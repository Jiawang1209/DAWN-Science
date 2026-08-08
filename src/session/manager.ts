/**
 * 会话生命周期管理（Task 1.6）。
 *
 * **核心约束：状态先落库再改内存。**
 * 任何持久化失败都不得留下「内存说活着、库里没有」的裂缝——那种裂缝在进程崩溃后
 * 无法分辨，UI 会拿着一个不存在的会话去连一个不存在的进程。
 *
 * 责任边界：本类知道 registry、store、lease，但**不知道任何 provider 细节**——
 * 「怎么跟进程说话」全部委托给 AgentRuntime。
 */
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { AgentDef, ProviderRegistry } from "../config/schema.js"
import type { SessionRecord, SessionStore } from "../store/sessions.js"
import type { AgentRuntime, EventSink, SessionId, SessionSpec } from "../runtime/types.js"
import { LeaseManager, type Holder } from "./lease.js"

export type PtyAgentDef = Extract<AgentDef, { kind: "pty" }>

export interface SessionManagerOptions {
  store: SessionStore
  registry: ProviderRegistry
  runtimes: { native: AgentRuntime; pty: AgentRuntime }
  /**
   * 按 agent 定义构造 pty runtime。给出时优先于 `runtimes.pty`。
   *
   * 存在的理由：pty agent 的**命令由 registry 逐个定义**（claude / codex / …），
   * 单一共享的 pty runtime 只能起一种命令。没有这个钩子，配置里的 `codex`
   * 会被错误地起成 claude——而进程照样起得来，失效方式很隐蔽。
   */
  ptyRuntimeFor?: (agentId: string, def: PtyAgentDef) => AgentRuntime
  workspaceRoot: string
  leaseTtlSeconds?: number
}

export class SessionManager {
  readonly leases: LeaseManager
  private readonly store: SessionStore
  private readonly registry: ProviderRegistry
  private readonly runtimes: { native: AgentRuntime; pty: AgentRuntime }
  private readonly ptyRuntimeFor: ((agentId: string, def: PtyAgentDef) => AgentRuntime) | undefined
  /** 本进程内活动的会话 → 它绑定的 runtime。重启后为空，靠 reconcileOnStartup 对账。 */
  private readonly bound = new Map<SessionId, AgentRuntime>()

  constructor(opts: SessionManagerOptions) {
    this.store = opts.store
    this.registry = opts.registry
    this.runtimes = opts.runtimes
    this.ptyRuntimeFor = opts.ptyRuntimeFor
    this.leases = new LeaseManager({ ttlSeconds: opts.leaseTtlSeconds ?? 300 })
  }

  async create(agentId: string, workspace: string): Promise<SessionRecord> {
    const def = this.registry.agents[agentId]
    // 无静默回退：未知 agent 立即失败，且在落库之前失败——不留半截记录
    if (!def) throw new Error(`未知的 agent "${agentId}"，请检查 providers.yaml 的 agents 段`)

    const id = randomUUID()
    const sessionDir = join(workspace, ".dawn", "sessions", id)
    const rec: SessionRecord = {
      id,
      agentId,
      workspace,
      sessionDir,
      state: "starting",
      createdAt: new Date().toISOString(),
    }
    this.store.insert(rec) // 先落库

    const spec: SessionSpec = { sessionId: id, workspace, sessionDir }
    if (def.kind === "native") {
      // 引用完整性已由 config/loader 的 assertReferences 在加载期保证，此处必然存在
      const ep = this.registry.endpoints[def.endpoint]!
      spec.endpoint = { baseUrl: ep.baseUrl, apiKey: ep.apiKey, model: def.model }
    }

    const runtime =
      def.kind === "native"
        ? this.runtimes.native
        : (this.ptyRuntimeFor?.(agentId, def) ?? this.runtimes.pty)
    try {
      const handle = await runtime.start(spec)
      this.bound.set(id, runtime)
      this.store.updateState(id, "alive", { pid: handle.pid })
      // 进程自行退出时把退出码回写入库——否则库里会永远停在 alive
      runtime.attach(id, (e) => {
        if (e.kind === "exited") this.store.updateState(id, "exited", { exitCode: e.exitCode })
      })
      return { ...rec, state: "alive", pid: handle.pid }
    } catch (err) {
      // 启动失败也要落库，绝不把会话留在 starting
      this.store.updateState(id, "exited", { exitCode: -1 })
      throw err
    }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动，无法附加观察者`)
    return rt.attach(sessionId, sink)
  }

  /** 写入前必须持有租约。这是规格 7.1 的守卫点——写权可追责的唯一入口。 */
  write(sessionId: SessionId, data: string, as: Holder): void {
    const lease = this.leases.current(sessionId)
    if (!lease || lease.holder !== as) {
      throw new Error(
        `写入被拒：${as} 未持有会话 "${sessionId}" 的租约（当前持有者：${lease?.holder ?? "无"}）`,
      )
    }
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动`)
    rt.write(sessionId, data)
  }

  /** 本进程内该会话绑定的 runtime。调用方需要区分 runtime 类型时用它。 */
  runtimeOf(sessionId: SessionId): AgentRuntime | undefined {
    return this.bound.get(sessionId)
  }

  /** 转发终端尺寸变化。只有 pty runtime 实现了 resize，其余是空操作。 */
  resize(sessionId: SessionId, cols: number, rows: number): void {
    this.bound.get(sessionId)?.resize?.(sessionId, cols, rows)
  }

  async stop(sessionId: SessionId): Promise<void> {
    const rt = this.bound.get(sessionId)
    if (rt) await rt.stop(sessionId)
    this.store.updateState(sessionId, "exited")
    this.bound.delete(sessionId)
    this.leases.release(sessionId)
  }

  list(): SessionRecord[] {
    return this.store.list()
  }

  /** 进程启动时调用：上次遗留的 starting/alive 显式转 exited（见 store 的同名方法）。 */
  reconcileOnStartup(): number {
    return this.store.reconcileOnStartup()
  }
}
