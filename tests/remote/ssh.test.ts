/**
 * 远端执行器（②-B · R1）。
 *
 * ## 这里钉的是 Spike F 换来的那条设计
 *
 * 两件事互相打架：
 *   - **要你的 PATH** —— ssh2 的 `exec` 起的是非登录 shell，不读 `~/.bashrc`。
 *     Spike F 里作者装好的 `ipykernel` 就是这么"消失"的。
 *   - **不要欢迎横幅** —— `bash -lc` 会读 profile，而很多服务器的 profile
 *     打一段 MOTD。让 agent 每跑一条命令都收到这堆噪声，
 *     后果不是难看，是**模型会照着噪声推理**。
 *
 * 所以：**捕获一次环境用登录 shell，之后每条命令用干净的非登录 shell。**
 * 下面第一组用例钉的就是这一条——它是这个模块存在的主要理由。
 */
import { describe, expect, it, vi } from "vitest"
import { RemoteExecutor, 单引号, 取值, type SshClientLike } from "../../src/remote/ssh.js"

/** 一条假 channel：够用即可，不模拟 ssh2 的全部行为 */
function 假channel(out: string, err = "", code = 0) {
  const 回调: Record<string, ((...a: never[]) => void)[]> = {}
  const on = (ev: string, cb: (...a: never[]) => void) => {
    ;(回调[ev] ??= []).push(cb)
    return undefined as never
  }
  const ch = {
    on,
    stderr: { on: (ev: string, cb: (...a: never[]) => void) => on(`stderr:${ev}`, cb) },
    close: () => {},
  }
  // 下一个 tick 把数据与结束事件发出去
  queueMicrotask(() => {
    for (const cb of 回调["data"] ?? []) (cb as (d: Buffer) => void)(Buffer.from(out))
    if (err) for (const cb of 回调["stderr:data"] ?? []) (cb as (d: Buffer) => void)(Buffer.from(err))
    for (const cb of 回调["exit"] ?? []) (cb as (c: number, s: null) => void)(code, null)
    for (const cb of 回调["close"] ?? []) (cb as () => void)()
  })
  return ch as never
}

interface 假的 {
  client: SshClientLike
  跑过: string[]
  /** 让下一条命令返回什么 */
  下一次: (out: string, err?: string, code?: number) => void
  断开: () => void
}

function 造一个假客户端(环境输出 = "DAWNENV_PATH=/opt/conda/bin:/usr/bin\nDAWNENV_HOME=/home/u"): 假的 {
  const 跑过: string[] = []
  let 待返回: { out: string; err: string; code: number } | undefined
  const handlers: Record<string, ((...a: never[]) => void)[]> = {}
  const client: SshClientLike = {
    on(ev, cb) {
      ;(handlers[ev] ??= []).push(cb)
      return undefined as never
    },
    connect() {
      queueMicrotask(() => {
        for (const cb of handlers["ready"] ?? []) (cb as () => void)()
      })
      return undefined as never
    },
    exec(cmd, cb) {
      跑过.push(cmd)
      // 第一条一定是环境捕获
      const r = 待返回 ?? { out: 跑过.length === 1 ? 环境输出 : "", err: "", code: 0 }
      待返回 = undefined
      queueMicrotask(() => cb(undefined, 假channel(r.out, r.err, r.code)))
      return undefined as never
    },
    // 这条测试不用隧道——给个占位，真正的行为由下面「forwardOut」那组用例单独覆盖
    forwardOut(_srcIP, _srcPort, _dstIP, _dstPort, cb) {
      cb(new Error("这份假客户端没配 forwardOut"), undefined as never)
      return undefined as never
    },
    sftp(cb) {
      cb(undefined, {
        readFile: (_p: string, f: (e: undefined, d: Buffer) => void) => f(undefined, Buffer.from("内容")),
        writeFile: (_p: string, _d: unknown, f: (e?: Error) => void) => f(),
        readdir: (_p: string, f: (e: undefined, l: unknown[]) => void) =>
          f(undefined, [
            // `mtime` 是**秒**（SFTP 的口径），`readdir` 要换成毫秒
            { filename: "a.txt", attrs: { isDirectory: () => false, size: 3, mtime: 1_755_000_000 } },
            { filename: "sub", attrs: { isDirectory: () => true, size: 0, mtime: 1_755_000_000 } },
          ]),
      } as never)
      return undefined as never
    },
    end() {
      return undefined as never
    },
  }
  return {
    client,
    跑过,
    下一次: (out, err = "", code = 0) => (待返回 = { out, err, code }),
    断开: () => {
      for (const cb of handlers["close"] ?? []) (cb as () => void)()
    },
  }
}

/**
 * 把 `bash -c '<脚本>'` 里那段脚本还原出来。
 *
 * **断言要验语义，不验转义后的字面量**：整段脚本被单引号包住，
 * 里面每个单引号都成了 `'\''`——照着那个形状写断言，
 * 读的人看不出它到底在说什么，而且换一种同样正确的转义就会红。
 */
const 内层 = (cmd: string) =>
  cmd
    .replace(/^bash -c '/, "")
    .replace(/'$/, "")
    .replaceAll(`'\\''`, "'")

const 造 = (f: 假的, onState?: (s: never) => void) =>
  new RemoteExecutor({
    config: { host: "h", username: "u" },
    createClient: () => f.client,
    ...(onState ? { onState: onState as never } : {}),
  })

describe("捕获环境 vs 跑命令 —— 两种 shell", () => {
  it("**捕获环境走登录 shell**（否则看不到你的 PATH）", async () => {
    const f = 造一个假客户端()
    await 造(f).connect()
    expect(f.跑过[0]).toContain("bash -lc")
  })

  it("**跑命令用干净的非登录 shell**（否则每条命令都带回欢迎横幅）", async () => {
    const f = 造一个假客户端()
    const r = 造(f)
    await r.connect()
    await r.exec("ls")
    const 命令 = f.跑过[1]!
    expect(命令).toContain("bash -c")
    expect(命令).not.toContain("bash -lc")
  })

  it("捕获来的环境会**带到每条命令上** —— 这就是 ipykernel 那次丢掉的东西", async () => {
    const f = 造一个假客户端()
    const r = 造(f)
    await r.connect()
    expect(r.loginEnv()["PATH"]).toBe("/opt/conda/bin:/usr/bin")
    await r.exec("which python3")
    expect(内层(f.跑过[1]!)).toContain("export PATH='/opt/conda/bin:/usr/bin'")
  })

  it("**MOTD 混进来也取得对** —— 顺序不能假设，但一个自造的键名可以", async () => {
    const f = 造一个假客户端(
      "*******************************\n欢迎使用本集群 https://example.com\nDAWNENV_PATH=/x/bin\n*** 账号失效时间：2026-11-08 ***",
    )
    const r = 造(f)
    await r.connect()
    expect(r.loginEnv()["PATH"]).toBe("/x/bin")
  })

  it("**空值不记**：`CONDA_PREFIX=` 与「没有 CONDA_PREFIX」是一回事", async () => {
    const f = 造一个假客户端("DAWNENV_PATH=/x\nDAWNENV_CONDA_PREFIX=")
    const r = 造(f)
    await r.connect()
    expect(r.loginEnv()["CONDA_PREFIX"]).toBeUndefined()
  })
})

describe("跑命令", () => {
  it("cwd 用单引号包住，**且进不去就 127**（不在错的目录里接着跑）", async () => {
    const f = 造一个假客户端()
    const r = 造(f)
    await r.connect()
    await r.exec("ls", { cwd: "/data/我的 项目" })
    expect(内层(f.跑过[1]!)).toContain(`cd '/data/我的 项目' || exit 127`)
  })

  it("退出码与信号如实带回来", async () => {
    const f = 造一个假客户端()
    const r = 造(f)
    await r.connect()
    f.下一次("", "boom", 3)
    const res = await r.exec("false")
    expect(res.code).toBe(3)
    expect(res.stderr).toBe("boom")
  })

  it("**断线之后 exec 直接抛错并说清原因，不自动重连**", async () => {
    const f = 造一个假客户端()
    const 状态: unknown[] = []
    const r = 造(f, (s) => 状态.push(s))
    await r.connect()
    f.断开()

    await expect(r.exec("ls")).rejects.toThrow(/disconnected|连接被对端关闭/)
    // **断线要立刻喊出来**，不是等下一次调用才发现
    expect(JSON.stringify(状态)).toContain("disconnected")
    // 只跑过环境捕获那一条：**没有偷偷重连再跑**
    expect(f.跑过).toHaveLength(1)
  })
})

describe("主机公钥校验 · TOFU（审查 debug A6）", () => {
  /** connect 时真调 hostVerifier,拿它给出的键;返回 true → ready,false → error(模拟 ssh2 的握手失败) */
  const 造带公钥的客户端 = (公钥: Buffer): SshClientLike => {
    const handlers: Record<string, ((...a: never[]) => void)[]> = {}
    return {
      on(ev, cb) {
        ;(handlers[ev] ??= []).push(cb)
        return undefined as never
      },
      connect(cfg: { hostVerifier?: (key: Buffer) => boolean }) {
        const 放行 = cfg.hostVerifier ? cfg.hostVerifier(公钥) : true
        queueMicrotask(() => {
          if (放行) for (const cb of handlers["ready"] ?? []) (cb as () => void)()
          else for (const cb of handlers["error"] ?? []) (cb as (e: Error) => void)(new Error("握手失败"))
        })
        return undefined as never
      },
      // connect 成功后 RemoteExecutor 会捕获一次环境(走 exec)——回个空的即可,不然 connect() 一直等
      exec(_cmd, cb) {
        queueMicrotask(() => cb(undefined, 假channel("", "", 0) as never))
        return undefined as never
      },
      forwardOut: () => undefined as never,
      sftp: () => undefined as never,
      end: () => undefined as never,
    }
  }
  const 记事本 = () => {
    const m = new Map<string, string>()
    return { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), m }
  }
  const 连 = (client: SshClientLike, kh: ReturnType<typeof 记事本>) =>
    new RemoteExecutor({ config: { host: "h", port: 22, username: "u" }, createClient: () => client, knownHosts: kh })

  it("**首次自动信任(TOFU)**:第一次连就记下公钥,连得上", async () => {
    const kh = 记事本()
    await 连(造带公钥的客户端(Buffer.from("KEY-A")), kh).connect()
    expect(kh.m.get("h:22")).toBeTruthy() // 记下了指纹
  })

  it("**同一把公钥再连,放行**", async () => {
    const kh = 记事本()
    await 连(造带公钥的客户端(Buffer.from("KEY-A")), kh).connect() // 首次记下
    await expect(连(造带公钥的客户端(Buffer.from("KEY-A")), kh).connect()).resolves.toBeUndefined()
  })

  it("**公钥变了就拒,并说清是中间人风险**", async () => {
    const kh = 记事本()
    await 连(造带公钥的客户端(Buffer.from("KEY-A")), kh).connect() // 首次记下 KEY-A
    // 再连,服务器给的是另一把公钥 → 拒
    await expect(连(造带公钥的客户端(Buffer.from("KEY-B")), kh).connect()).rejects.toThrow(/中间人|不一样/)
  })
})

describe("文件", () => {
  it("读 / 写 / 列目录走 SFTP", async () => {
    const f = 造一个假客户端()
    const r = 造(f)
    await r.connect()
    expect((await r.readFile("/a")).toString()).toBe("内容")
    await r.writeFile("/a", "x")
    const list = await r.readdir("/")
    expect(list).toEqual([
      { name: "a.txt", directory: false, size: 3, mtimeMs: 1_755_000_000_000 },
      { name: "sub", directory: true, size: 0, mtimeMs: 1_755_000_000_000 },
    ])
  })
})

describe("引号与解析", () => {
  it("单引号里的单引号被转义 —— **shell 里唯一不会再解释任何东西的引法**", () => {
    expect(单引号(`it's`)).toBe(`'it'\\''s'`)
  })

  it("取值不靠行号也不靠位置", () => {
    expect(取值("噪声\nK=v 后面还有\n更多噪声", "K")).toBe("v 后面还有")
    expect(取值("什么都没有", "K")).toBeUndefined()
  })
})

describe("状态", () => {
  it("连上前后状态变化会喊出来", async () => {
    const f = 造一个假客户端()
    const 状态: { kind: string }[] = []
    const r = 造(f, (s) => 状态.push(s as never))
    await r.connect()
    expect(状态.map((s) => s.kind)).toEqual(["connecting", "ready"])
    const spy = vi.spyOn(f.client, "end")
    r.close()
    expect(spy).toHaveBeenCalled()
    expect(r.current().kind).toBe("idle")
  })
})

describe("forwardOut（远程内核）", () => {
  it("连着时把远端端口的通道交出来；没连就说没连", async () => {
    const 假 = 造一个假客户端()
    const 要过: unknown[] = []
    ;(假.client as unknown as { forwardOut: unknown }).forwardOut = (
      srcIP: string, srcPort: number, dstIP: string, dstPort: number,
      cb: (e: Error | undefined, ch: unknown) => void,
    ) => {
      要过.push([srcIP, srcPort, dstIP, dstPort])
      cb(undefined, { 我是通道: dstPort })
    }
    const ex = new RemoteExecutor({ config: { host: "h", username: "u" }, createClient: () => 假.client })
    await expect(ex.forwardOut(5555)).rejects.toThrow(/还没连上|不可用/)
    await ex.connect()
    const ch = await ex.forwardOut(5555)
    expect(ch).toEqual({ 我是通道: 5555 })
    expect(要过).toEqual([["127.0.0.1", 0, "127.0.0.1", 5555]])
  })
})
