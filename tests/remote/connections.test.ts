/**
 * 连接管理器（②-B · R3）。
 *
 * 这一层的要害只有三条，三条都在下面：
 *
 *   1. **断了就停在 `disconnected` 并带着原因**，不自动重连。
 *      悄悄重连会让「命令跑在哪台机器的哪个 shell 里」失去答案——
 *      重连之后那边是一个全新的进程，之前的 `cd`、后台任务、临时文件都不在了。
 *   2. **人按的断开 ≠ 断线**。前者停在 `idle`（没连而已），
 *      后者要报原因。混成一个，界面就没法把「我没连」与「它把我踢了」分开说。
 *   3. **口令从钥匙串取**，这一层不接受口令参数。
 */
import { describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import { RemoteConnections } from "../../src/remote/connections.js"
import type { SshClientLike } from "../../src/remote/ssh.js"
import type { ConnectionRecord } from "../../src/store/connections.js"

const 记录 = (over: Partial<ConnectionRecord> = {}): ConnectionRecord => ({
  id: "c1",
  label: "实验室",
  host: "h",
  port: 22,
  username: "u",
  sortOrder: 1,
  createdAt: "2026-08-11T00:00:00Z",
  ...over,
})

/** 一个能按需成功/失败/中途断线的假 SSH 客户端 */
function 假客户端(opts: { 认证失败?: boolean } = {}) {
  const c = new EventEmitter() as EventEmitter & SshClientLike
  const 收到的配置: Record<string, unknown>[] = []
  c.connect = ((cfg: Record<string, unknown>) => {
    收到的配置.push(cfg)
    setTimeout(() => {
      if (opts.认证失败) c.emit("error", new Error("All configured authentication methods failed"))
      else c.emit("ready")
    }, 1)
  }) as SshClientLike["connect"]
  c.exec = ((_cmd: string, cb: (e: Error | undefined, ch: unknown) => void) => {
    const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    ch.stderr = new EventEmitter()
    cb(undefined, ch)
    setTimeout(() => {
      ch.emit("data", Buffer.from("DAWNENV_PATH=/usr/bin\nDAWNENV_HOME=/home/u\n"))
      ch.emit("close", 0, undefined)
    }, 1)
  }) as SshClientLike["exec"]
  c.end = (() => setTimeout(() => c.emit("close"), 1)) as SshClientLike["end"]
  return { c, 收到的配置 }
}

describe("连接管理器", () => {
  it("没试过的一律 idle —— **那是实话**，不是「没连上」", () => {
    const m = new RemoteConnections({ createClient: () => 假客户端().c, secretFor: () => undefined })
    expect(m.stateOf("没见过").kind).toBe("idle")
  })

  it("连上之后 ready，且拿得到执行器", async () => {
    const { c } = 假客户端()
    const 推过: { id: string; kind: string }[] = []
    const m = new RemoteConnections({
      createClient: () => c,
      secretFor: () => "pw",
      onState: (id, s) => 推过.push({ id, kind: s.kind }),
    })
    await m.connect(记录())
    expect(m.stateOf("c1").kind).toBe("ready")
    expect(m.executorOf("c1")).toBeDefined()
    // **状态是推出去的**，不等界面来问
    expect(推过.map((x) => x.kind)).toEqual(["connecting", "ready"])
  })

  it("**口令从钥匙串取**，没私钥时当密码用", async () => {
    const { c, 收到的配置 } = 假客户端()
    const secretFor = vi.fn(() => "机密")
    const m = new RemoteConnections({ createClient: () => c, secretFor })
    await m.connect(记录())
    expect(secretFor).toHaveBeenCalledWith("c1")
    expect(收到的配置[0]!["password"]).toBe("机密")
    expect(收到的配置[0]!["passphrase"]).toBeUndefined()
  })

  it("有私钥时同一个秘密当 passphrase —— **配错哪一种是最常见的坑**", async () => {
    const { c, 收到的配置 } = 假客户端()
    const m = new RemoteConnections({
      createClient: () => c,
      secretFor: () => "机密",
      readKeyFile: async () => Buffer.from("KEY"),
    })
    await m.connect(记录({ privateKeyPath: "/k/id_ed25519" }))
    expect(收到的配置[0]!["passphrase"]).toBe("机密")
    expect(收到的配置[0]!["password"]).toBeUndefined()
  })

  it("**私钥读不到就说读不到** —— 退回试密码的话，人看到的是「认证失败」", async () => {
    const m = new RemoteConnections({
      createClient: () => 假客户端().c,
      secretFor: () => undefined,
      readKeyFile: async () => {
        throw new Error("ENOENT")
      },
    })
    await expect(m.connect(记录({ privateKeyPath: "/不在/id_rsa" }))).rejects.toThrow(/读不了私钥/)
  })

  it("连不上时如实抛错，**且不留下一个半死的执行器**", async () => {
    const { c } = 假客户端({ 认证失败: true })
    const m = new RemoteConnections({ createClient: () => c, secretFor: () => "pw" })
    await expect(m.connect(记录())).rejects.toThrow(/authentication/)
    expect(m.executorOf("c1")).toBeUndefined()
    expect(m.stateOf("c1").kind).toBe("disconnected")
  })

  it("**断线停在 disconnected 并带原因，不自动重连**", async () => {
    const { c } = 假客户端()
    let 连了几次 = 0
    const m = new RemoteConnections({
      createClient: () => {
        连了几次 += 1
        return c
      },
      secretFor: () => "pw",
    })
    await m.connect(记录())
    // 对端把连接掐了
    c.emit("close")
    await new Promise((r) => setTimeout(r, 5))

    const s = m.stateOf("c1")
    expect(s.kind).toBe("disconnected")
    expect(s.kind === "disconnected" && s.reason).toBeTruthy()
    // **没有人偷偷重连**
    expect(连了几次).toBe(1)
    // **执行器被扔掉了**：留着它，下一条命令会打在一条死连接上，
    // 而报错会是底层的 socket 错误，不是「这台机器断了」
    expect(m.executorOf("c1")).toBeUndefined()
  })

  it("**人按的断开是 idle，不是 disconnected** —— 两者混一起就没法分开说", async () => {
    const { c } = 假客户端()
    const m = new RemoteConnections({ createClient: () => c, secretFor: () => "pw" })
    await m.connect(记录())
    m.disconnect("c1")
    expect(m.stateOf("c1").kind).toBe("idle")
  })

  it("已经连着时重复按不重来 —— 掐掉重连会连带丢掉它上面所有会话的当前目录", async () => {
    let 造了几个 = 0
    const m = new RemoteConnections({
      createClient: () => {
        造了几个 += 1
        return 假客户端().c
      },
      secretFor: () => "pw",
    })
    await m.connect(记录())
    await m.connect(记录())
    expect(造了几个).toBe(1)
  })
})
