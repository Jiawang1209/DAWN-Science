/**
 * 点开一段**长在服务器上**的旧对话，会怎么样（作者 2026-08-19 报的）。
 *
 * > *「服务器连接之后，我发现我再点击服务器里面以前的会话的时候，
 * >   发现连接不上之前的历史会话。」*
 *
 * ## 这份文件盯的是两个叠在一起的洞
 *
 * 1. **续接不认识远端**：`subscribeSession` 调的是 `sessions.resume(sessionId)`，
 *    而 `resume()` 的第二个参数恰恰是那台机器的执行器。不传的话，
 *    这段对话被拿到**本机**重新拉起——工作目录是一条远端路径，本地根本不存在。
 *    症状与 2026-08-14 那次「任务标着远端、活跑在本机」是同一种，
 *    只是这一次发生在**续接**而不是**新建**。
 *
 * 2. **失败被吞掉**（违反规格 7.5）：拉不起来之后掉进一个空的 `catch {}`，
 *    界面只剩一句「不在本进程中活动」——那句话对**任何**原因都成立，
 *    于是它什么都没说。
 *
 * 两条都不是「点了没反应」，是「点了，反应是错的/是哑的」。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { EventEmitter } from "node:events"
import { migrate } from "../../src/store/schema.js"
import { ConnectionStore } from "../../src/store/connections.js"
import { RemoteConnections } from "../../src/remote/connections.js"
import { createWorkbenchBackend, type CredentialsPort } from "../../src/workbench/backend.js"
import type { RemoteConnection } from "../../src/protocol/index.js"
import type { SshClientLike } from "../../src/remote/ssh.js"

function 假钥匙串(): CredentialsPort {
  const 里面 = new Map<string, string>()
  return {
    get: (id) => 里面.get(id),
    set: (id, s) => void 里面.set(id, s),
    delete: (id) => void 里面.delete(id),
    configured: () => [...里面.keys()],
    isEncrypted: () => true,
  }
}

/** 一台会握手、会报家目录的假机器 */
function 假客户端(): SshClientLike {
  const c = new EventEmitter() as EventEmitter & SshClientLike
  c.connect = (() => setTimeout(() => c.emit("ready"), 1)) as SshClientLike["connect"]
  c.exec = ((_cmd: string, cb: (e: Error | undefined, ch: unknown) => void) => {
    const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    ch.stderr = new EventEmitter()
    cb(undefined, ch)
    setTimeout(() => {
      ch.emit("data", Buffer.from("DAWNENV_HOME=/home/user\nDAWNENV_PATH=/usr/bin\n"))
      ch.emit("close", 0, undefined)
    }, 1)
  }) as SshClientLike["exec"]
  c.end = (() => setTimeout(() => c.emit("close"), 1)) as SshClientLike["end"]
  return c
}

type 续接记录 = { sessionId: string; remote?: { cwd: { get(): string }; executor: unknown } }

function 起一套(opts: { 续接失败?: string } = {}) {
  const db = new Database(":memory:")
  migrate(db)
  const credentials = 假钥匙串()
  const store = new ConnectionStore(db)
  const manager = new RemoteConnections({
    createClient: 假客户端,
    secretFor: () => undefined,
  })

  /** 那一段旧对话：**它记得自己长在哪台机器上、上次 `cd` 到了哪儿** */
  const 会话记录: Record<string, unknown> = {
    id: "sess-1",
    agentId: "claude",
    workspace: "/home/user/项目",
    connectionId: "",
    remoteCwd: "/home/user/项目/子目录",
    state: "exited",
  }

  const 续接了: 续接记录[] = []
  const sessions = {
    get: (id: string) => (id === "sess-1" ? 会话记录 : undefined),
    isLive: () => false,
    resume: async (sessionId: string, remote?: 续接记录["remote"]) => {
      续接了.push({ sessionId, ...(remote ? { remote } : {}) })
      if (opts.续接失败) throw new Error(opts.续接失败)
      return 会话记录
    },
    attach: () => {},
    history: async () => [],
  }

  const 订阅了: string[] = []
  const events = {
    track: () => {},
    ingest: () => {},
    restore: () => {},
    setCwd: () => {},
    subscribe: (id: string) => {
      // **续不上就订不上**：事件总线只认此刻活着的那些
      if (续接了.length === 0 || opts.续接失败) throw new Error("会话不在本进程中活动")
      订阅了.push(id)
      return { sessionId: id, events: [] }
    },
  }

  const backend = createWorkbenchBackend({
    projects: { setRemoteCwd: () => {} } as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: sessions as never,
    registry: { providers: [] } as never,
    events: events as never,
    credentials,
    remote: { store, manager },
  })

  const 存 = (req: Parameters<typeof backend.saveConnection>[0]) =>
    backend.saveConnection(req) as Promise<RemoteConnection>
  return { backend, 存, 会话记录, 续接了 }
}

describe("续接一段长在服务器上的旧对话", () => {
  it("**要连回那台机器**，不是在本机悄悄起一个同名的", async () => {
    const { backend, 存, 会话记录, 续接了 } = 起一套()
    const c = await 存({ label: "gs191", host: "gs191.example", username: "user" })
    会话记录["connectionId"] = c.id

    await backend.subscribeSession({ sessionId: "sess-1" })

    expect(续接了).toHaveLength(1)
    // 这一条就是那个洞：从前这里是 undefined，于是它起在了本机
    expect(续接了[0]!.remote).toBeDefined()
    /**
     * **从上次 `cd` 到的地方接着来，不是从家目录重来。**
     *
     * 记录里存着 `remoteCwd` 正是为了这个。退回家目录的话，
     * 界面上那条路径与 agent 实际所在的目录会对不上——
     * 「以为在 A 目录、其实在 B 目录」这类错本项目已经写进过注释。
     */
    expect(续接了[0]!.remote!.cwd.get()).toBe("/home/user/项目/子目录")
  })

  it("本机那些照旧**不带远端参数**——别给本地会话塞一个执行器", async () => {
    const { backend, 续接了 } = 起一套()
    // connectionId 留空 = 这是一段本地会话
    await backend.subscribeSession({ sessionId: "sess-1" })
    expect(续接了).toHaveLength(1)
    expect(续接了[0]!.remote).toBeUndefined()
  })

  it("**续不上要说真话**：不能只回一句「不在本进程中活动」", async () => {
    const { backend, 存, 会话记录 } = 起一套({ 续接失败: "gs191 上的 pi 起不来：没有这个命令" })
    const c = await 存({ label: "gs191", host: "gs191.example", username: "user" })
    会话记录["connectionId"] = c.id

    await expect(backend.subscribeSession({ sessionId: "sess-1" })).rejects.toThrow(
      /gs191 上的 pi 起不来/,
    )
  })
})
