/**
 * 远端起内核 / 停内核 / 扫残留（远程内核，2026-09-03）。全是脚本拼接 + 输出解析，`exec` 注入。
 * Spike F 的四条纪律在这里各有一条用例：登录 shell 由执行器保证（不在此层）；
 * `键=值` 与 base64 整段回读（MOTD 里带花括号也不影响）；pgrep 模式带方括号（glob 与 pkill 都要）；僵尸不算活着。
 */
import { describe, expect, it, vi } from "vitest"
import {
  内核文件名, 远端启动命令, 起远端内核, 停远端内核, 扫残留, 远端启动失败,
  远端活着, 远端内核还在, 删远端文件, 挑端口并写文件脚本, 解析端口, 挑端口并写文件,
} from "../../src/remote/kernel-launch.js"

const 连接 = `{"shell_port": 5001, "iopub_port": 5002, "stdin_port": 5003, "control_port": 5004, "hb_port": 5005, "ip": "127.0.0.1", "key": "abc", "transport": "tcp", "signature_scheme": "hmac-sha256", "kernel_name": ""}`
const 连接base64 = (json = 连接) => Buffer.from(json, "utf8").toString("base64")

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
    expect(py).toContain(`f="\${TMPDIR:-/tmp}/"'dawn-x-python-1.json'`)
    expect(py).toContain("nohup")
    expect(py).toContain(`>"$f.log" 2>&1 &`)
    expect(py).toContain("echo DAWNPID=$!")
    expect(py).toContain('echo "DAWNFILE=$f"')
    const r = 远端启动命令("R", "/usr/bin/R", "dawn-x-R-1.json")
    expect(r).toContain(`'/usr/bin/R' --slave -e 'IRkernel::main()' --args "$f"`)
  })
  it("内核不挂在 ssh 通道的 stdin / 进程组上：setsid（探测不到就退化）+ 关掉继承的标准输入", () => {
    const py = 远端启动命令("python", "/opt/conda/bin/python", "dawn-x-python-1.json")
    expect(py).toContain("</dev/null")
    expect(py).toContain("command -v setsid")
  })
  it("setsid 探测结果自己回声：DAWNSETSID=1/0，供起内核那层判断要不要出声警告", () => {
    const py = 远端启动命令("python", "/opt/conda/bin/python", "dawn-x-python-1.json")
    expect(py).toMatch(/DAWNSETSID=1/)
    expect(py).toMatch(/DAWNSETSID=0/)
  })
})

describe("装机 id 校验", () => {
  it("装机 id 带非字母数字字符就直接抛，不许拼进脚本", () => {
    expect(() => 内核文件名("ab;rm -rf /", "python")).toThrow(/装机 id/)
  })
  it("装机 id 是 run 也要拒绝——执行器给每条脚本都包了一层 dawn-run-*.pid 的 wrapper，扫残留会连它一起命中", () => {
    expect(() => 内核文件名("run", "python")).toThrow(/run/)
  })
  it("扫残留 也校验装机 id，坏 id 一条 exec 都不跑", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=0\n" }])
    await expect(扫残留(假.exec, "a b")).rejects.toThrow(/装机 id/)
    expect(假.跑过.length).toBe(0)
  })
  it("扫残留 也拒绝 run", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=0\n" }])
    await expect(扫残留(假.exec, "run")).rejects.toThrow(/run/)
    expect(假.跑过.length).toBe(0)
  })
})

describe("起远端内核", () => {
  it("拿到 pid 与文件、轮询到 connection.json 就返回连接信息", async () => {
    const 假 = 假exec([
      { out: "*** MOTD ***\nDAWNPID=4242\nDAWNFILE=/tmp/dawn-x-python-1.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" },                          // 第一轮：活着
      { out: "DAWNRC=1\n" },                              // 第一轮：文件还没写出来
      { out: "DAWNALIVE=1\n" },
      { out: `DAWNRC=0\nDAWNJSON=${连接base64()}\n` },    // 第二轮：有了（DAWNRC 先于 DAWNJSON，`键=值` 取出来再解码）
    ])
    const r = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/opt/conda/bin/python", cwd: "/data/p", 文件名: "dawn-x-python-1.json", sleep: 不睡 })
    expect(r.pid).toBe(4242)
    expect(r.文件).toBe("/tmp/dawn-x-python-1.json")
    expect(r.连接信息.shell_port).toBe(5001)
    expect(r.连接信息.key).toBe("abc")
    expect(r.setsid).toBe(true)
    expect(假.跑过[0]).toContain("ipykernel_launcher")
  })

  it("MOTD 里本身带花括号也不影响：整段 base64 回读，不按花括号配对解析", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=99\nDAWNFILE=/tmp/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" },
      { out: `*** 欢迎回来 {这不是 JSON} ***\nDAWNRC=0\nDAWNJSON=${连接base64()}\n` },
    ])
    const r = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 })
    expect(r.连接信息.key).toBe("abc")
    expect(r.连接信息.shell_port).toBe(5001)
  })

  it("拿不到 DAWNPID（命令根本没跑起来）→ 抛，带 stderr", async () => {
    const 假 = 假exec([{ out: "", err: "bash: nohup: command not found", code: 127 }])
    await expect(起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 }))
      .rejects.toThrow(/nohup: command not found/)
  })

  it("进程起来就死（包没装）→ 抛 `远端启动失败`，日志尾巴在上面", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=7\nDAWNFILE=/tmp/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=0\n" },
      { out: "/x/python: No module named ipykernel_launcher\n" }, // tail 日志
    ])
    const e = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(远端启动失败)
    expect((e as 远端启动失败).日志尾).toContain("No module named ipykernel_launcher")
    expect((e as 远端启动失败).name).toBe("远端启动失败")
  })

  it("轮询到上限还没有文件 → 抛（不是「远端启动失败」），说明轮询了多少次，并已经 KILL 兜底", async () => {
    // 每轮两次 exec（活着检查 + cat 检查），3 轮就要 6 条 + 启动那条 = 7 条；
    // 假 exec 耗尽后会一直重放最后一条，若只给 3 条会在第 2 轮把"没有文件"的
    // 输出错当成"活着检查"的输出解析，提前触发「远端启动失败」而不是轮询耗尽。
    const 假 = 假exec([
      { out: "DAWNPID=7\nDAWNFILE=/tmp/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNRC=1\n" },
    ])
    const e = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡, 最多轮询: 3 })
      .catch((x: unknown) => x)
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).toMatch(/3 次/)
    expect(e).not.toBeInstanceOf(远端启动失败)
    expect(假.跑过.some((c) => /kill -KILL 7/.test(c))).toBe(true)
  })

  it("connection.json 存在但读不出来（DAWNRC=2，base64 失败）→ 立刻抛，不等到轮询上限", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=7\nDAWNFILE=/tmp/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" },
      { out: "DAWNRC=2\n" },
    ])
    const e = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡, 最多轮询: 60 })
      .catch((x: unknown) => x)
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).toMatch(/读不出来|base64/)
    expect(假.跑过.length).toBe(3) // 没有继续轮询到上限
  })

  it("这台机器没有 setsid（DAWNSETSID=0）→ 仍能起内核，但出声警告；返回 setsid:false", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=8\nDAWNFILE=/tmp/f.json\nDAWNSETSID=0\n" },
      { out: "DAWNALIVE=1\n" },
      { out: `DAWNRC=0\nDAWNJSON=${连接base64()}\n` },
    ])
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 })
    expect(r.setsid).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toContain("没有 setsid")
    spy.mockRestore()
  })

  it("这台机器有 setsid（DAWNSETSID=1）→ 不出声，返回 setsid:true", async () => {
    const 假 = 假exec([
      { out: "DAWNPID=9\nDAWNFILE=/tmp/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" },
      { out: `DAWNRC=0\nDAWNJSON=${连接base64()}\n` },
    ])
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await 起远端内核(假.exec, { 语言: "python", 解释器路径: "/x/python", cwd: "/", 文件名: "f.json", sleep: 不睡 })
    expect(r.setsid).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
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
  it("只认自己装机 id 的文件与进程，glob 与 pkill 模式都带方括号防自噬", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=2\n" }])
    const r = await 扫残留(假.exec, "ab12")
    expect(r.清了).toBe(2)
    expect(假.跑过[0]).toContain(`[d]awn-ab12-*.json`)
    expect(假.跑过[0]).toContain(`pkill -9 -f "[d]\${b#d}"`)
    expect(假.跑过[0]).not.toContain("dawn-*")
  })
})

describe("远端活着 / 远端内核还在 / 删远端文件", () => {
  it("远端活着：DAWNALIVE=1 才算活", async () => {
    expect(await 远端活着(假exec([{ out: "DAWNALIVE=1\n" }]).exec, 7)).toBe(true)
    expect(await 远端活着(假exec([{ out: "MOTD {\nDAWNALIVE=0\n" }]).exec, 7)).toBe(false)
  })
  it("远端内核还在：进程活着且文件在才算在；一条脚本问两件事", async () => {
    const 假 = 假exec([{ out: "DAWNALIVE=1\nDAWNFILE=1\n" }])
    expect(await 远端内核还在(假.exec, { pid: 7, 文件: "/tmp/dawn-ab12-python-x.json" })).toBe(true)
    expect(假.跑过).toHaveLength(1)
    expect(假.跑过[0]).toContain("kill -0 7")
    expect(假.跑过[0]).toContain(`[ -f '/tmp/dawn-ab12-python-x.json' ]`)
    expect(await 远端内核还在(假exec([{ out: "DAWNALIVE=1\nDAWNFILE=0\n" }]).exec, { pid: 7, 文件: "/tmp/f.json" })).toBe(false)
    expect(await 远端内核还在(假exec([{ out: "DAWNALIVE=0\nDAWNFILE=1\n" }]).exec, { pid: 7, 文件: "/tmp/f.json" })).toBe(false)
  })
  it("删远端文件：json 与 .log 一起删，失败不抛", async () => {
    const 假 = 假exec([{ out: "", code: 1 }])
    await 删远端文件(假.exec, "/tmp/dawn-ab12-python-x.json")
    expect(假.跑过[0]).toBe(`rm -f '/tmp/dawn-ab12-python-x.json' '/tmp/dawn-ab12-python-x.json.log'; true`)
  })
})

describe("扫残留 · 名单", () => {
  it("名单为空：逐文件杀，pkill 按 basename 精确到那一台，glob 与模式都带方括号", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=2\n" }])
    const r = await 扫残留(假.exec, "ab12")
    expect(r.清了).toBe(2)
    expect(假.跑过[0]).toContain(`[d]awn-ab12-*.json`)
    expect(假.跑过[0]).toContain(`b=$(basename "$f"); pkill -9 -f "[d]\${b#d}"`)
    expect(假.跑过[0]).not.toContain("case ")
    expect(假.跑过[0]).not.toContain("dawn-*")
  })
  it("名单上的文件跳过、不计数、不杀", async () => {
    const 假 = 假exec([{ out: "DAWNSWEPT=1\n" }])
    await 扫残留(假.exec, "ab12", ["dawn-ab12-python-abc.json"])
    expect(假.跑过[0]).toContain(`case "$(basename "$f")" in 'dawn-ab12-python-abc.json') continue;; esac;`)
  })
  it("名单里的名字不合法就一条都不跑——它要原样进 shell", async () => {
    const 假 = 假exec([])
    await expect(扫残留(假.exec, "ab12", ["x'; rm -rf /"])).rejects.toThrow(/名单/)
    expect(假.跑过).toHaveLength(0)
  })
})

/**
 * 远端 R：连接文件是**我们**写的（2026-09-05，规格 R1/R3）。
 * IRkernel 只读不写——`IRkernel::main(connection_file="")` 从 `commandArgs(TRUE)[[1]]` 取文件名，
 * 文件不在就报 `cannot open the connection` 立刻退出（本机 R 4.6.1 实测）。
 * 所以端口要在**那台服务器上**挑（本机的空闲端口与服务器无关），再把 connection.json 写过去。
 */
describe("R · 挑端口并写连接文件", () => {
  const 脚本 = () => 挑端口并写文件脚本("/usr/local/bin/R", "dawn-ab-R-1.json", "k-1")

  it("走那台机器上的 R；文件名与 key 都单引号包死，且整条命令只有一行", () => {
    const c = 脚本()
    expect(c).toContain("'/usr/local/bin/R' --slave -e ")
    expect(c).toContain(`--args "$f" 'k-1'`)
    // 假服务器与执行器都按「一条命令一行」处理，R 代码里混进换行会把它们全带偏
    expect(c).not.toContain("\n")
  })

  it("$TMPDIR 的展开留在远端，并把落点回声成 DAWNFILE——否则本地不知道文件在哪，得多花一趟 SSH 去问", () => {
    const c = 脚本()
    expect(c).toContain(`f="\${TMPDIR:-/tmp}/"'dawn-ab-R-1.json'`)
    expect(c).toContain(`echo "DAWNFILE=$f"`)
  })

  it("umask 077 在写文件之前——connection.json 里有 HMAC key，集群的 /tmp 是所有人可读的（R3）", () => {
    const c = 脚本()
    const u = c.indexOf("Sys.umask")
    const w = c.indexOf("writeLines")
    expect(u).toBeGreaterThan(-1)
    expect(w).toBeGreaterThan(-1)
    expect(u).toBeLessThan(w)
    expect(c).toContain('Sys.umask("077")')
  })

  it("五个 socket 一起开着挑完再关——一个个开关会挑到同一个端口", () => {
    const c = 脚本()
    expect(c).toContain("serverSocket")
    // 收集到 5 个之后才 close：close 出现在循环之后
    expect(c.indexOf("while(")).toBeLessThan(c.indexOf("close(con)"))
  })

  it("R 代码里不许出现单引号——整段是被 shell 单引号包着的", () => {
    const c = 脚本()
    const 里面 = c.slice(c.indexOf("-e '") + 4, c.lastIndexOf("' --args"))
    expect(里面).not.toContain("'")
  })

  it("解析端口：五个都在才算数", () => {
    const out = "*** MOTD {不是 JSON} ***\nDAWNRC=0\nDAWNPORT_shell=21001\nDAWNPORT_iopub=21002\nDAWNPORT_stdin=21003\nDAWNPORT_control=21004\nDAWNPORT_hb=21005\n"
    expect(解析端口(out)).toEqual({ shell_port: 21001, iopub_port: 21002, stdin_port: 21003, control_port: 21004, hb_port: 21005 })
  })

  it("少一个端口就抛——缺失不许当成 0（那会起一台连不上的内核，症状伪装成「R 装得不对」）", () => {
    const out = "DAWNRC=0\nDAWNPORT_shell=21001\nDAWNPORT_iopub=21002\nDAWNPORT_stdin=21003\nDAWNPORT_control=21004\n"
    expect(() => 解析端口(out)).toThrow(/hb/)
  })

  it("DAWNRC=3（200 次都没挑到空闲端口）→ 抛，说的是端口的事", () => {
    expect(() => 解析端口("DAWNRC=3\n")).toThrow(/空闲端口/)
  })

  it("DAWNRC=4（文件写不出来：目录只读、磁盘满）→ 抛，带上那台机器说的话", () => {
    expect(() => 解析端口("DAWNRC=4\nDAWNERR=cannot open file\n")).toThrow(/cannot open file/)
  })

  it("R 根本没跑起来（127、什么都没回）→ 抛，带 stderr，不要沉默地当成没端口", async () => {
    const 假 = 假exec([{ out: "", err: "R: command not found", code: 127 }])
    await expect(挑端口并写文件(假.exec, { 解释器路径: "/no/R", 文件名: "f.json", key: "k" }))
      .rejects.toThrow(/command not found/)
  })

  it("挑端口并写文件：一条 exec，回五个端口与文件落点", async () => {
    const 假 = 假exec([{ out: "DAWNRC=0\nDAWNPORT_shell=1\nDAWNPORT_iopub=2\nDAWNPORT_stdin=3\nDAWNPORT_control=4\nDAWNPORT_hb=5\nDAWNFILE=/scratch/f.json\n" }])
    const p = await 挑端口并写文件(假.exec, { 解释器路径: "/usr/local/bin/R", 文件名: "f.json", key: "kk" })
    expect(p.文件).toBe("/scratch/f.json")
    expect(p.端口).toEqual({ shell_port: 1, iopub_port: 2, stdin_port: 3, control_port: 4, hb_port: 5 })
    expect(假.跑过).toHaveLength(1)
    expect(假.跑过[0]).toContain("'kk'")
  })
})

/**
 * R 的就绪判据（规格 R2）。Python 靠「connection.json 出现了」判断内核起来了；
 * **R 的那份文件是我们自己先写的**，那条判据对 R 恒真、什么也证明不了。
 * R 改成：轮询进程还在不在，起来就死当场抓住；真正的就绪由后面的握手证明。
 */
describe("起远端内核 · R", () => {
  const 端口回声 = "DAWNRC=0\nDAWNPORT_shell=21001\nDAWNPORT_iopub=21002\nDAWNPORT_stdin=21003\nDAWNPORT_control=21004\nDAWNPORT_hb=21005\nDAWNFILE=/scratch/dawn-ab-R-1.json\n"

  it("先挑端口写文件、再起内核；连接信息就是我们写下的那五个端口与 key", async () => {
    const 假 = 假exec([
      { out: 端口回声 },
      { out: "DAWNPID=777\nDAWNFILE=/scratch/dawn-ab-R-1.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" },
      { out: "DAWNALIVE=1\n" },
      { out: "DAWNALIVE=1\n" },
    ])
    const r = await 起远端内核(假.exec, {
      语言: "R", 解释器路径: "/usr/local/bin/R", cwd: "/data/p", 文件名: "dawn-ab-R-1.json", sleep: 不睡, key: "K-1",
    })
    expect(假.跑过[0]).toContain("serverSocket")
    expect(假.跑过[1]).toContain("IRkernel::main()")
    expect(r.pid).toBe(777)
    expect(r.文件).toBe("/scratch/dawn-ab-R-1.json")
    expect(r.连接信息).toMatchObject({
      key: "K-1", shell_port: 21001, iopub_port: 21002, stdin_port: 21003, control_port: 21004, hb_port: 21005,
      ip: "127.0.0.1", transport: "tcp", signature_scheme: "hmac-sha256",
    })
    expect(r.setsid).toBe(true)
  })

  it("**一次都不去读 connection.json**——那份是我们写的，读回来只是在读自己的手迹", async () => {
    const 假 = 假exec([
      { out: 端口回声 },
      { out: "DAWNPID=777\nDAWNFILE=/scratch/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNALIVE=1\n" }, { out: "DAWNALIVE=1\n" },
    ])
    await 起远端内核(假.exec, { 语言: "R", 解释器路径: "/usr/local/bin/R", cwd: "/", 文件名: "f.json", sleep: 不睡, key: "K" })
    expect(假.跑过.some((c) => c.includes("base64"))).toBe(false)
  })

  it("起来就死（IRkernel 没装）→ 抛 `远端启动失败`，`.log` 的尾巴带上来——那是唯一的线索", async () => {
    const 假 = 假exec([
      { out: 端口回声 },
      { out: "DAWNPID=778\nDAWNFILE=/scratch/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=0\n" },
      { out: "Error in loadNamespace: there is no package called 'IRkernel'\n" },
    ])
    const e = await 起远端内核(假.exec, { 语言: "R", 解释器路径: "/usr/local/bin/R", cwd: "/", 文件名: "f.json", sleep: 不睡, key: "K" })
      .catch((x) => x)
    expect(e).toBeInstanceOf(远端启动失败)
    expect((e as 远端启动失败).日志尾).toContain("no package called")
  })

  it("挑端口那步就失败（端口挑不到 / 文件写不出）→ 内核那条压根不发", async () => {
    const 假 = 假exec([{ out: "DAWNRC=3\n" }])
    await expect(起远端内核(假.exec, { 语言: "R", 解释器路径: "/usr/local/bin/R", cwd: "/", 文件名: "f.json", sleep: 不睡, key: "K" }))
      .rejects.toThrow(/空闲端口/)
    expect(假.跑过).toHaveLength(1)
  })

  it("不给 key 就自己生成一个——两台内核不许共用同一把 HMAC key", async () => {
    const 造 = () => 假exec([
      { out: 端口回声 },
      { out: "DAWNPID=1\nDAWNFILE=/f.json\nDAWNSETSID=1\n" },
      { out: "DAWNALIVE=1\n" }, { out: "DAWNALIVE=1\n" }, { out: "DAWNALIVE=1\n" },
    ])
    const a = 造(), b = 造()
    const r1 = await 起远端内核(a.exec, { 语言: "R", 解释器路径: "/R", cwd: "/", 文件名: "f.json", sleep: 不睡 })
    const r2 = await 起远端内核(b.exec, { 语言: "R", 解释器路径: "/R", cwd: "/", 文件名: "f.json", sleep: 不睡 })
    expect(r1.连接信息.key).not.toBe(r2.连接信息.key)
    expect(r1.连接信息.key.length).toBeGreaterThan(8)
  })
})
