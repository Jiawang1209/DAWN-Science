/**
 * 远端工具（②-B · R2）。
 *
 * 这一层的要害有两条，两条都在下面被钉住：
 *
 *   1. **模型看到的工具一字不改**——只有 `execute` 被换掉。
 *      改了名字或 schema，模型就得为远端另学一套，而它学到的会是错的。
 *   2. **路径守卫在这里**。远端那台机器上还有别人的东西，
 *      一个 `../../etc` 出得去就是事故。
 */
import { describe, expect, it, vi } from "vitest"
import { 改造成远端工具, 挑工具后端, 摘出目录, 解析远端路径 } from "../../src/remote/tools.js"
import type { RemoteExecutor } from "../../src/remote/ssh.js"

const WS = "/home/u/proj"

/**
 * 一个可变的当前目录（②-B · R4′）。
 *
 * **它不再是一个固定的工作区**：作者要的是「连上就聊，需要换地方再换」，
 * 所以目录是会话身上的状态，`cd` 之后要粘住。
 */
const 目录 = (start = WS, 界?: string) => {
  let v = start
  return { get: () => v, set: (x: string) => { v = x }, ...(界 ? { 界 } : {}) }
}

/** 一个够用的假执行器 */
function 假执行器(over: Partial<Record<keyof RemoteExecutor, unknown>> = {}) {
  const 文件 = new Map<string, string>()
  const 跑过: { cmd: string; cwd?: string; timeoutSec?: number }[] = []
  const ex = {
    exec: vi.fn(async (cmd: string, o: { cwd?: string; timeoutSec?: number } = {}) => {
      跑过.push({ cmd, ...(o.cwd ? { cwd: o.cwd } : {}), ...(o.timeoutSec ? { timeoutSec: o.timeoutSec } : {}) })
      return { code: 0, stdout: "ok\n", stderr: "" }
    }),
    readFile: vi.fn(async (p: string) => {
      const v = 文件.get(p)
      if (v === undefined) throw new Error("No such file")
      return Buffer.from(v)
    }),
    writeFile: vi.fn(async (p: string, d: string | Buffer) => {
      文件.set(p, d.toString())
    }),
    ...over,
  } as unknown as RemoteExecutor
  return { ex, 文件, 跑过 }
}

/**
 * 造一组「pi 的定义」：只留下我们关心的字段。
 *
 * **`本地: true` 是故意的**——真调到它就说明没换成远端，那是要红的。
 */
type 假定义 = Record<string, unknown> & { name: string; execute: (...a: unknown[]) => Promise<unknown> }
const 原定义 = (): 假定义[] => [
  { name: "read", label: "读", parameters: { a: 1 }, execute: async () => ({ 本地: true }) },
  { name: "write", label: "写", parameters: { b: 2 }, execute: async () => ({ 本地: true }) },
  { name: "edit", label: "改", parameters: { c: 3 }, execute: async () => ({ 本地: true }) },
  { name: "bash", label: "跑", parameters: { d: 4 }, execute: async () => ({ 本地: true }) },
]

const 取 = (list: { name: string }[], name: string) => list.find((t) => t.name === name)! as never as {
  execute: (id: string, p: unknown, s?: AbortSignal) => Promise<{ content: { text: string }[]; isError?: boolean }>
}

describe("**只换 execute，别的一字不改**", () => {
  it("名字、label、参数 schema 原样留着 —— 模型不该为远端另学一套", () => {
    const { ex } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    expect(出.map((t) => t.name)).toEqual(["read", "write", "edit", "bash"])
    expect(出[0]!["label"]).toBe("读")
    expect(出[0]!["parameters"]).toEqual({ a: 1 })
    // 但 execute 换过了
    expect(出[0]!.execute).not.toBe(原定义()[0]!.execute)
  })

  it("**不认识的工具原样留下** —— 悄悄丢掉比留着更错", () => {
    const { ex } = 假执行器()
    const 定义: 假定义[] = [...原定义(), { name: "未知", execute: async () => 1 }]
    const 出 = 改造成远端工具(定义, { executor: ex, cwd: 目录() })
    expect(出.map((t) => t.name)).toContain("未知")
  })
})

describe("路径守卫", () => {
  it("相对路径按工作区解析", () => {
    expect(解析远端路径(WS, "data/a.csv")).toBe(`${WS}/data/a.csv`)
  })

  it("**给了界时，`..` 先归一再判** —— 只查前缀的话，`../../etc/passwd` 会大摇大摆通过", () => {
    expect(() => 解析远端路径(WS, "../../etc/passwd", WS)).toThrow(/越出/)
    expect(() => 解析远端路径(WS, `${WS}/a/../../../etc`, WS)).toThrow(/越出/)
  })

  it("**没给界就没有界**（默认）—— 作者定的形状是「登上去，说话」，不先声明工作目录", () => {
    // 这不比人自己 ssh 上去更危险，但也不会更安全：区别是命令由模型出。
    // 「圈在某个目录里」是一个可选开关，开了才传界
    // `/home/u/proj` 往上两级是 `/home`
    expect(解析远端路径(WS, "../../etc/passwd")).toBe("/home/etc/passwd")
    expect(解析远端路径(WS, "/etc/passwd")).toBe("/etc/passwd")
  })

  it("工作区自己算在里面", () => {
    expect(解析远端路径(WS, ".")).toBe(WS)
  })

  it("**开了那个开关之后**，越界的读写在工具层就被挡下，且说清原因", async () => {
    const { ex } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录(WS, WS) })
    const r = await 取(出, "read").execute("t1", { path: "/etc/passwd" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/越出/)
  })
})

describe("读", () => {
  it("读全文", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.txt`, "一\n二\n三")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    expect((await 取(出, "read").execute("t", { path: "a.txt" })).content[0]!.text).toBe("一\n二\n三")
  })

  it("offset 从 1 起算，与 pi 的 schema 一致", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.txt`, "一\n二\n三\n四")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "read").execute("t", { path: "a.txt", offset: 2, limit: 2 })
    expect(r.content[0]!.text).toBe("二\n三")
  })

  it("读不到就说读不到，不返回空串", async () => {
    const { ex } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "read").execute("t", { path: "没有这个.txt" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/读不了/)
  })
})

describe("写", () => {
  it("写进去，并**先建父目录**（少了它，写 results/out.csv 会莫名失败）", async () => {
    const { ex, 文件, 跑过 } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    await 取(出, "write").execute("t", { path: "results/out.csv", content: "a,b\n" })
    expect(文件.get(`${WS}/results/out.csv`)).toBe("a,b\n")
    expect(跑过.some((c) => c.cmd.includes("mkdir -p"))).toBe(true)
  })
})

describe("改", () => {
  it("逐处替换", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.py`, "x = 1\ny = 2\n")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    await 取(出, "edit").execute("t", { path: "a.py", edits: [{ oldText: "x = 1", newText: "x = 42" }] })
    expect(文件.get(`${WS}/a.py`)).toBe("x = 42\ny = 2\n")
  })

  it("**命中不唯一就整次不改** —— 半改的文件比没改坏得多", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.py`, "v = 1\nv = 1\n")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "edit").execute("t", {
      path: "a.py",
      edits: [{ oldText: "v = 1", newText: "v = 2" }],
    })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/不唯一/)
    // **一个字节都没动**
    expect(文件.get(`${WS}/a.py`)).toBe("v = 1\nv = 1\n")
  })

  it("找不到也是整次不改", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.py`, "x = 1\n")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "edit").execute("t", {
      path: "a.py",
      edits: [{ oldText: "不存在", newText: "y" }],
    })
    expect(r.isError).toBe(true)
    expect(文件.get(`${WS}/a.py`)).toBe("x = 1\n")
  })

  it("**替换文本里的 `$&` 不被当成正则** —— 那会把内容改成别的东西", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set(`${WS}/a.sh`, "echo OLD\n")
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    await 取(出, "edit").execute("t", {
      path: "a.sh",
      edits: [{ oldText: "OLD", newText: "$& $1 $$" }],
    })
    expect(文件.get(`${WS}/a.sh`)).toBe("echo $& $1 $$\n")
  })
})

describe("跑命令", () => {
  it("在工作区里跑，**退出码永远写出来**（哪怕是 0）", async () => {
    const { ex, 跑过 } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "bash").execute("t", { command: "ls" })
    expect(跑过[0]!.cwd).toBe(WS)
    expect(r.content[0]!.text).toContain("[退出码 0]")
    expect(r.isError).toBeUndefined()
  })

  it("**非零退出算失败**，让模型知道它没成", async () => {
    const { ex } = 假执行器({
      exec: vi.fn(async () => ({ code: 2, stdout: "", stderr: "boom\n" })),
    })
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "bash").execute("t", { command: "false" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("[stderr]")
    expect(r.content[0]!.text).toContain("[退出码 2]")
  })

  it("**默认不设超时**（作者定的）；模型显式要求时才设", async () => {
    const { ex, 跑过 } = 假执行器()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    await 取(出, "bash").execute("t", { command: "sleep 1" })
    expect(跑过[0]!.timeoutSec).toBeUndefined()
    await 取(出, "bash").execute("t", { command: "sleep 1", timeout: 30 })
    expect(跑过[1]!.timeoutSec).toBe(30)
  })

  it("**中止信号原样递给执行器** —— 「中止交给你按」的另一半在这里", async () => {
    const 收到: (AbortSignal | undefined)[] = []
    const { ex } = 假执行器({
      exec: vi.fn(async (_c: string, o: { signal?: AbortSignal } = {}) => {
        收到.push(o.signal)
        return { code: 0, stdout: "", stderr: "" }
      }),
    })
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const ac = new AbortController()
    await 取(出, "bash").execute("t", { command: "sleep 999" }, ac.signal)
    // 界面上那个「停止」按下去之后，最终要落到远端那个进程上。
    // 这条只钉住这一段：**信号没有在工具层被吃掉**
    expect(收到[0]).toBe(ac.signal)
  })

  it("被信号结束时说的是信号，不是退出码", async () => {
    const { ex } = 假执行器({
      exec: vi.fn(async () => ({ code: undefined, signal: "KILL", stdout: "", stderr: "" })),
    })
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "bash").execute("t", { command: "x" })
    expect(r.content[0]!.text).toContain("被信号 KILL 结束")
  })

  it("断线时如实报错，不假装跑过", async () => {
    const { ex } = 假执行器({
      exec: vi.fn(async () => {
        throw new Error("远端不可用（disconnected）：连接被对端关闭")
      }),
    })
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "bash").execute("t", { command: "ls" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/没跑成.*disconnected/)
  })
})

/**
 * **接线本身也要有人看着。**
 *
 * 这个判断本来是 `native.ts` 私有方法里的一行 `remote ? … : …`。
 * 本项目栽得最多的正是这种一行：每一层单独看都对，接线断了却没人知道
 * （三个面板那次、成本那次、模型目录那次）。
 */
describe("挑执行后端", () => {
  it("没给远端 = 原样用本地那份", () => {
    const 原 = 原定义()
    expect(挑工具后端(原, 目录("/w"), undefined)).toBe(原)
  })

  it("给了远端 = 四个工具全部换成远端版", async () => {
    const { ex, 跑过 } = 假执行器()
    const 出 = 挑工具后端(原定义(), 目录(), ex)
    await 取(出, "bash").execute("t", { command: "pwd" })
    // 真打到执行器上了，而不是回落到本地那份（那份会返回 `{本地:true}`）
    expect(跑过).toHaveLength(1)
    expect(跑过[0]!.cwd).toBe(WS)
  })
})

/**
 * **`cd` 要粘住**（②-B · R4′）。
 *
 * 作者：*「自然语言告诉我跳到哪个文件夹之类的不就好了？」*
 * 而每条命令都开一个干净的 shell（有意的，否则登录横幅会污染输出），
 * 所以模型敲的 `cd data` 到下一条本来就没了。
 */
describe("当前目录跟着 cd 走", () => {
  const 带标记 = (dir: string) => `\n__DAWN_CWD__${dir}\n`

  it("命令跑完把新目录记下来，**并从输出里抹掉那行标记**", async () => {
    const { ex } = 假执行器({
      exec: vi.fn(async () => ({ code: 0, stdout: `列了几个文件${带标记("/home/u/proj/data")}`, stderr: "" })),
    })
    const cwd = 目录()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd })
    const r = await 取(出, "bash").execute("t", { command: "cd data && ls" })

    expect(cwd.get()).toBe("/home/u/proj/data")
    // 内部标记不该出现在模型看到的文本里
    expect(r.content[0]!.text).not.toContain("__DAWN_CWD__")
    expect(r.content[0]!.text).toContain("列了几个文件")
  })

  it("**下一条命令就在新目录里跑**", async () => {
    const { ex, 跑过 } = 假执行器({
      exec: vi.fn(async (_c: string, o: { cwd?: string } = {}) => {
        跑过.push({ cmd: _c, ...(o.cwd ? { cwd: o.cwd } : {}) })
        return { code: 0, stdout: 带标记("/home/u/proj/data"), stderr: "" }
      }),
    })
    const cwd = 目录()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd })
    await 取(出, "bash").execute("t", { command: "cd data" })
    await 取(出, "bash").execute("t", { command: "pwd" })
    expect(跑过[1]!.cwd).toBe("/home/u/proj/data")
  })

  it("**读不到标记就不动**（命令被中止时会这样）—— 不拿一个猜的目录去覆盖", async () => {
    const { ex } = 假执行器({
      exec: vi.fn(async () => ({ code: undefined, signal: "TERM", stdout: "跑了一半", stderr: "" })),
    })
    const cwd = 目录()
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd })
    await 取(出, "bash").execute("t", { command: "sleep 999" })
    expect(cwd.get()).toBe(WS)
  })

  it("**退出码要原样保住** —— 不保的话每条命令都会变成 printf 的 0，失败全变成功", async () => {
    const { ex, 跑过 } = 假执行器({
      exec: vi.fn(async (c: string) => {
        跑过.push({ cmd: c })
        return { code: 2, stdout: 带标记(WS), stderr: "boom\n" }
      }),
    })
    const 出 = 改造成远端工具(原定义(), { executor: ex, cwd: 目录() })
    const r = await 取(出, "bash").execute("t", { command: "false" })
    // 发出去的那条里有 `rc=$?` 与 `exit $rc`
    expect(跑过[0]!.cmd).toContain("rc=$?")
    expect(跑过[0]!.cmd).toContain("exit $rc")
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("[退出码 2]")
  })

  it("摘标记：**取最后一个**，命令自己打印的同名字符串不该抢走它", () => {
    const r = 摘出目录("我打印了 __DAWN_CWD__/假的\n真输出\n__DAWN_CWD__/真的\n")
    expect(r.目录).toBe("/真的")
    expect(r.正文).toContain("我打印了")
  })
})
