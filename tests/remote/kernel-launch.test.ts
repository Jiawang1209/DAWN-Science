/**
 * 远端起内核 / 停内核 / 扫残留（远程内核，2026-09-03）。全是脚本拼接 + 输出解析，`exec` 注入。
 * Spike F 的四条纪律在这里各有一条用例：登录 shell 由执行器保证（不在此层）；
 * `键=值` 与最外层花括号解析（MOTD 夹在前 / 中 / 后）；pgrep 模式带方括号；僵尸不算活着。
 */
import { describe, expect, it } from "vitest"
import {
  内核文件名, 远端启动命令, 取花括号, 起远端内核, 停远端内核, 扫残留, 远端启动失败,
} from "../../src/remote/kernel-launch.js"

const 连接 = `{"shell_port": 5001, "iopub_port": 5002, "stdin_port": 5003, "control_port": 5004, "hb_port": 5005, "ip": "127.0.0.1", "key": "abc", "transport": "tcp", "signature_scheme": "hmac-sha256", "kernel_name": ""}`

/** 一个脚本化的假执行器：按顺序回答，记下跑过什么 */
function 假exec(回答: { out: string; code?: number; err?: string }[]) {
  const 跑过: string[] = []
  let i = 0
  const exec = async (command: string) => {
    跑过.push(command)
    const r = 回答[Math.min(i++, 回答.length - 1)]!
    return { code: r.code ?? 0, stdout: r.out, stderr: r.err ?? "" }
  }
  return { exec, 跑过 }
}
const 不睡 = async () => {}

describe("文件名与命令", () => {
  it("文件名带装机 id 与语言，落在 $TMPDIR", () => {
    expect(内核文件名("ab12", "python", 1000)).toBe("dawn-ab12-python-rs.json")
  })
  it("Python 走 ipykernel_launcher，R 走 IRkernel::main；nohup、日志同名 .log、回 DAWNPID 与 DAWNFILE", () => {
    const py = 远端启动命令("python", "/opt/conda/bin/python", "dawn-x-python-1.json")
    expect(py).toContain(`'/opt/conda/bin/python' -m ipykernel_launcher -f "$f"`)
    expect(py).toContain(`f="\${TMPDIR:-/tmp}/dawn-x-python-1.json"`)
    expect(py).toContain("nohup")
    expect(py).toContain(`>"$f.log" 2>&1 &`)
    expect(py).toContain("echo DAWNPID=$!")
    expect(py).toContain('echo "DAWNFILE=$f"')
    const r = 远端启动命令("R", "/usr/bin/R", "dawn-x-R-1.json")
    expect(r).toContain(`'/usr/bin/R' --slave -e 'IRkernel::main()' --args "$f"`)
  })
})

describe("取花括号", () => {
  it("MOTD 在前、在后、夹在中间都取得到最外层那对", () => {
    expect(取花括号(`*** 欢迎 ***\n${连接}\n`)).toBe(连接)
    expect(取花括号(`${连接}\n再见`)).toBe(连接)
    expect(取花括号(`{"shell_port": 1,\n*** 横幅 ***\n "hb_port": 2}`)).toBe(`{"shell_port": 1,\n*** 横幅 ***\n "hb_port": 2}`)
    expect(取花括号("没有")).toBeUndefined()
  })
})

describe("起远端内核", () => {
  it("拿到 pid 与文件、轮询到 connection.json 就返回连接信息", async () => {
    const 假 = 假exec([
      { out: "*** MOTD ***\nDAWNPID=4242\nDAWNFILE=/tmp/dawn-x-python-1.json\n" },
      { out: "DAWNALIVE=1\n" },           // 第一轮：活着
      { out: "DAWNRC=1\n" },              // 第一轮：文件还没写出来
      { out: "DAWNALIVE=1\n" },
      { out: `${连接}\nDAWNRC=0\n` },     // 第二轮：有了
    ])
    const r = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/opt/conda/bin/python", cwd: "/data/p", 文件名: "dawn-x-python-1.json", sleep: 不睡 })
    expect(r.pid).toBe(4242)
    expect(r.文件).toBe("/tmp/dawn-x-python-1.json")
    expect(r.连接信息.shell_port).toBe(5001)
    expect(r.连接信息.key).toBe("abc")
    expect(假.跑过[0]).toContain("ipykernel_launcher")
  })

  it("拿不到 DAWNPID（命令根本没跑起来）→ 抛，带 stderr", async () => {
    const 假 = 假exec([{ out: "", err: "bash: nohup: command not found", code: 127 }])
    await expect(起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 }))
      .rejects.toThrow(/nohup: command not found/)
  })

  it("进程起来就死（包没装）→ 抛 `远端启动失败`，日志尾巴在上面", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=7\nDAWNFILE=/tmp/f.json\n" },
      { out: "DAWNALIVE=0\n" },
      { out: "/x/python: No module named ipykernel_launcher\n" }, // tail 日志
    ])
    const e = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(远端启动失败)
    expect((e as 远端启动失败).日志尾).toContain("No module named ipykernel_launcher")
  })

  it("轮询到上限还没有文件 → 抛，并说明轮询了多少次", async () => {
    // 每轮两次 exec（活着检查 + cat 检查），3 轮就要 6 条 + 启动那条 = 7 条；
    // 假 exec 耗尽后会一直重放最后一条，若只给 3 条会在第 2 轮把"没有文件"的
    // 输出错当成"活着检查"的输出解析，提前触发「远端启动失败」而不是轮询耗尽。
    const 假 = 假exec([
      { out: "DAWNPID=7\nDAWNFILE=/tmp/f.json\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
    ])
    await expect(起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡, 最多轮询: 3 }))
      .rejects.toThrow(/3 次/)
  })
})

describe("停远端内核", () => {
  it("TERM → 等到真没了（僵尸不算活着）→ 删文件与日志", async () => {
    const 假 = 假exec([
      { out: "" },                 // kill -TERM
      { out: "DAWNALIVE=1\n" },    // 还活着
      { out: "DAWNALIVE=0\n" },    // 没了（僵尸判成 0）
      { out: "" },                 // rm
    ])
    await 停远端内核(假.exec, { pid: 7, 文件: "/tmp/f.json" }, { sleep: 不睡 })
    expect(假.跑过[0]).toMatch(/kill -TERM 7/)
    expect(假.跑过[1]).toContain("ps -o stat=")
    expect(假.跑过[1]).toContain("Z")
    expect(假.跑过.at(-1)).toContain(`rm -f '/tmp/f.json' '/tmp/f.json.log'`)
    expect(假.跑过.some((c) => /kill -KILL/.test(c))).toBe(false)
  })

  it("等不到就 KILL 兜底，文件照删", async () => {
    const 假 = 假exec([{ out: "" }, { out: "DAWNALIVE=1\n" }])
    await 停远端内核(假.exec, { pid: 7, 文件: "/tmp/f.json" }, { sleep: 不睡, 最多等: 2 })
    expect(假.跑过.some((c) => /kill -KILL 7/.test(c))).toBe(true)
    expect(假.跑过.at(-1)).toContain("rm -f")
  })
})

describe("扫残留", () => {
  it("只认自己装机 id 的文件与进程，pgrep 模式带方括号", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=2\n" }])
    const r = await 扫残留(假.exec, "ab12")
    expect(r.清了).toBe(2)
    expect(假.跑过[0]).toContain(`dawn-ab12-*.json`)
    expect(假.跑过[0]).toContain(`pkill -9 -f '[d]awn-ab12-'`)
    expect(假.跑过[0]).not.toContain("dawn-*")
  })
})
