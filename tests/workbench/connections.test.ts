/**
 * 远端连接的五个操作（②-B · R3/R4）。
 *
 * ## 这份文件真正在盯的是口令
 *
 * 其余四条（增删改查）坏了，人一眼看得见。**口令坏了没人看得见**：
 * 它可能被回显进一次截图、被一次改分组顺手清掉、
 * 或者在删掉服务器之后留在钥匙串里没人认领。三种都不会报错。
 *
 * 这是 `models.json` 那次的直接延伸——**明文落盘的密钥等于没有密钥**。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { ConnectionStore } from "../../src/store/connections.js"
import { RemoteConnections } from "../../src/remote/connections.js"
import { createWorkbenchBackend, type CredentialsPort } from "../../src/workbench/backend.js"
import { EventEmitter } from "node:events"
import type { RemoteConnection } from "../../src/protocol/index.js"
import type { SshClientLike } from "../../src/remote/ssh.js"

/** 一个记得住东西的假钥匙串 */
function 假钥匙串(): CredentialsPort & { 里面: Map<string, string> } {
  const 里面 = new Map<string, string>()
  return {
    里面,
    get: (id) => 里面.get(id),
    set: (id, s) => void 里面.set(id, s),
    delete: (id) => void 里面.delete(id),
    configured: () => [...里面.keys()],
    isEncrypted: () => true,
  }
}

function 假客户端(): SshClientLike {
  const c = new EventEmitter() as EventEmitter & SshClientLike
  c.connect = (() => setTimeout(() => c.emit("ready"), 1)) as SshClientLike["connect"]
  c.exec = ((_cmd: string, cb: (e: Error | undefined, ch: unknown) => void) => {
    const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    ch.stderr = new EventEmitter()
    cb(undefined, ch)
    setTimeout(() => {
      ch.emit("data", Buffer.from("DAWNENV_PATH=/usr/bin\n"))
      ch.emit("close", 0, undefined)
    }, 1)
  }) as SshClientLike["exec"]
  c.end = (() => setTimeout(() => c.emit("close"), 1)) as SshClientLike["end"]
  return c
}

function 起一套() {
  const db = new Database(":memory:")
  migrate(db)
  const credentials = 假钥匙串()
  const store = new ConnectionStore(db)
  const manager = new RemoteConnections({
    createClient: 假客户端,
    secretFor: (id) => credentials.get(`ssh:${id}`),
  })
  const backend = createWorkbenchBackend({
    // 这份用例只碰远端那五个操作，其余端口给到能构造出来即可
    projects: {} as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: {} as never,
    registry: { providers: [] } as never,
    events: {} as never,
    credentials,
    remote: { store, manager },
  })
  /**
   * **在测试里把返回值类型补回来。**
   *
   * 后端的派发表按协议契约返回 `unknown`——那是服务端边界该有的样子
   * （出去的东西由 zod 验，不由 TypeScript 保证）。但断言需要类型，
   * 所以在这里收窄一次，而不是在每一条断言上撒 `as`。
   */
  const 存 = (req: Parameters<typeof backend.saveConnection>[0]) =>
    backend.saveConnection(req) as Promise<RemoteConnection>
  const 列 = () => backend.listConnections({}) as Promise<RemoteConnection[]>
  const 连 = (id: string) => backend.connectRemote({ id }) as Promise<RemoteConnection>
  const 断 = (id: string) => backend.disconnectRemote({ id }) as Promise<RemoteConnection>
  return { backend, credentials, store, manager, 存, 列, 连, 断 }
}

describe("远端连接 · 增删改查", () => {
  it("加一台，回来的是它该有的样子", async () => {
    const { 存 } = 起一套()
    const c = await 存({
      label: "实验室",
      group: "集群",
      host: "gs191.example",
      username: "user",
    })
    expect(c.id).toMatch(/^conn-/)
    expect(c.label).toBe("实验室")
    expect(c.group).toBe("集群")
    // **端口给了默认值**，不留一个 undefined 让下游各猜各的
    expect(c.port).toBe(22)
    // **刚加的还没连**——不是「连不上」，是我们没试过
    expect(c.state.kind).toBe("idle")
  })

  it("列出来带分组，**没分组的排在前面**（不造一个叫「未分组」的假分组）", async () => {
    const { 存, 列 } = 起一套()
    await 存({ label: "甲", group: "乙组", host: "h1", username: "u" })
    await 存({ label: "丙", host: "h2", username: "u" })
    const list = await 列()
    expect(list.map((c) => c.label)).toEqual(["丙", "甲"])
    expect(list[0]!.group).toBeUndefined()
  })

  it("改一台：**覆盖式**，清掉私钥路径要能表达", async () => {
    const { 存 } = 起一套()
    const c = await 存({
      label: "甲",
      host: "h",
      username: "u",
      privateKeyPath: "/k/id",
    })
    const 改后 = await 存({ id: c.id, label: "甲改", host: "h2", username: "u2" })
    expect(改后.label).toBe("甲改")
    expect(改后.host).toBe("h2")
    expect(改后.privateKeyPath).toBeUndefined()
    // **id 与创建时间不变**：改一次名字不该让它变成另一台机器
    expect(改后.id).toBe(c.id)
    expect(改后.createdAt).toBe(c.createdAt)
  })

  it("改不存在的那台要出声，不静默新建一个", async () => {
    const { 存 } = 起一套()
    await expect(存({ id: "没有", label: "x", host: "h", username: "u" })).rejects.toThrow()
  })
})

describe("**口令只进不出**", () => {
  it("响应里没有 secret，只有「配过没有」", async () => {
    const { 存 } = 起一套()
    const c = await 存({
      label: "甲",
      host: "h",
      username: "u",
      secret: "机密",
    })
    expect(c.hasSecret).toBe(true)
    // **一个字都不许回显**：回显一次，它就落进了截图、日志和录屏
    expect(JSON.stringify(c)).not.toContain("机密")
    expect(c).not.toHaveProperty("secret")
  })

  it("口令进的是钥匙串，**不是库**", async () => {
    const { 存, credentials, store } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "机密" })
    expect(credentials.里面.get(`ssh:${c.id}`)).toBe("机密")
    // 库里那条记录整个序列化出来都不该有它
    expect(JSON.stringify(store.get(c.id))).not.toContain("机密")
  })

  it("**不传 secret = 不动原来那个**（不是清空）—— 改一次分组就丢口令是最经典的坏法", async () => {
    const { 存, credentials } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "机密" })
    await 存({ id: c.id, label: "甲", group: "新组", host: "h", username: "u" })
    expect(credentials.里面.get(`ssh:${c.id}`)).toBe("机密")
  })

  it("传空串才是清除 —— 那是明确的「我不要它了」", async () => {
    const { 存, credentials } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "机密" })
    const 改后 = await 存({ id: c.id, label: "甲", host: "h", username: "u", secret: "" })
    expect(credentials.里面.has(`ssh:${c.id}`)).toBe(false)
    expect(改后.hasSecret).toBe(false)
  })

  it("**删掉服务器时钥匙串那份也删掉** —— 留着就是一份没人认领的秘密", async () => {
    const { 存, 列, credentials, backend } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "机密" })
    await backend.removeConnection({ id: c.id })
    expect(credentials.里面.has(`ssh:${c.id}`)).toBe(false)
    expect(await 列()).toEqual([])
  })
})

describe("连接与断开", () => {
  it("连上之后状态变 ready，**列表里也看得见**", async () => {
    const { 存, 列, 连 } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "pw" })
    const 连后 = await 连(c.id)
    expect(连后.state.kind).toBe("ready")
    expect((await 列())[0]!.state.kind).toBe("ready")
  })

  it("断开之后回到 idle", async () => {
    const { 存, 连, 断 } = 起一套()
    const c = await 存({ label: "甲", host: "h", username: "u", secret: "pw" })
    await 连(c.id)
    const 断后 = await 断(c.id)
    expect(断后.state.kind).toBe("idle")
  })

  it("连一台不存在的要说没有这台，**不静默返回一个空壳**", async () => {
    const { 连 } = 起一套()
    await expect(连("没有")).rejects.toThrow()
  })
})

describe("没装配远端时", () => {
  it("**如实说没装配**，不返回一个空名单假装「你还没加过服务器」", async () => {
    const backend = createWorkbenchBackend({
      projects: {} as never,
      projectStore: {} as never,
      runs: {} as never,
      sessions: {} as never,
      registry: { providers: [] } as never,
      events: {} as never,
      credentials: 假钥匙串(),
    })
    await expect(backend.listConnections({})).rejects.toThrow(/没有装配/)
  })
})
