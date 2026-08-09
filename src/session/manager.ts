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
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentDef, ProviderRegistry } from "../config/schema.js"
import type { SessionRecord, SessionStore } from "../store/sessions.js"
import type { AgentRuntime, EventSink, SessionId, SessionSpec } from "../runtime/types.js"
import { LeaseManager, type Holder } from "./lease.js"

export type PtyAgentDef = Extract<AgentDef, { kind: "pty" }>

/**
 * **打算给用户看的失败。**
 *
 * 协议服务端对异常的策略是刻意的（`workbench/server.ts`）：
 * 只有 `fault()` 抛出的业务性失败会把消息原样交给界面，
 * 其余一律归一成 `internal_error`，原始信息**只进日志**——
 * 因为它可能含路径、连接串、密钥片段（学自 Rho）。
 *
 * 那条策略是对的，**问题在抛错的一侧**：这一层此前抛的是普通 `Error`，
 * 于是「provider 未配置凭证——请在设置里填写它的 API key」这种
 * **写得很清楚、也很该给用户看**的话，在界面上变成了
 * `操作 "createSession" 执行失败`。
 *
 * 2026-08-09 由 ①-C 的第一条 e2e 撞出来。
 * **想让用户看见，就得显式声明「这句话是给他看的」**——
 * 而不是指望下游去猜哪条消息安全。
 *
 * 本层不引 `fault()`：那是 workbench 的东西，会把依赖方向倒过来。
 */
export class SessionSetupError extends Error {
  readonly userFacing = true as const
  constructor(message: string) {
    super(message)
    this.name = "SessionSetupError"
  }
}

/**
 * 让 `<workspace>/.dawn/` 对 git 隐形。
 *
 * **2026-08-09 由 e2e「外部改文件切回来」撞出来的缺陷。** 会话目录写在用户的
 * 仓库里（`<workspace>/.dawn/sessions/<id>`），装的是 pi 的 session jsonl、
 * 工具输出转储、mcp.json 这些**内部记录**。它们对 git 是可见的未跟踪文件，后果三层：
 *
 *   1. 产出栏把 DAWN 自己的账本当成 agent 的产出报出来
 *   2. **用户自己的 `git status` 也脏了** —— 应用在别人的仓库里留下东西
 *   3. 逐次溯源的每一条差集都带着这些噪声
 *
 * 修在这里而不是「`git-facts` 里过滤掉 `.dawn/`」：后者只修第 1 层，
 * 第 2 层照旧；也不是把目录挪出工作区，那会改掉「会话数据跟着项目走」的语义，
 * 而且 `sessionDir` 已经落了库。
 *
 * **两条边界**：
 * - `.gitignore` 写在 `.dawn/` **里面**，不碰用户根目录的那一份
 * - **已存在就不动** —— 用户可能改过它，覆盖等于替他做决定
 */
function ensureDawnDirIgnored(workspace: string): void {
  const dir = join(workspace, ".dawn")
  const file = join(dir, ".gitignore")
  if (existsSync(file)) return
  try {
    mkdirSync(dir, { recursive: true })
    // `*` 连 .gitignore 自己一并忽略——它是 DAWN 的东西，不是用户仓库的内容
    writeFileSync(file, "*\n")
  } catch {
    /**
     * **写不出来不该拦住建会话。** 只读工作区、权限不足都可能走到这里，
     * 而那时唯一的后果是产出栏多几行噪声——比「打不开会话」轻得多。
     * 这不是静默回退掩盖失败：真正的失败（工作区不可写）会在
     * agent 第一次写文件时以更准确的方式报出来。
     */
  }
}

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
  /**
   * 某个 provider 配没配凭证。**只问有无，不取值**——
   * 真正的取值发生在 pi 内部（`ModelRuntime` 持有我们的 `CredentialStore`），
   * 会话管理器不该经手凭证明文。
   *
   * 不注入时不做检查（CLI 与测试场景）。
   */
  hasCredential?: (providerId: string) => boolean
  workspaceRoot: string
  leaseTtlSeconds?: number
}

export class SessionManager {
  readonly leases: LeaseManager
  private readonly store: SessionStore
  private readonly registry: ProviderRegistry
  private readonly runtimes: { native: AgentRuntime; pty: AgentRuntime }
  private readonly ptyRuntimeFor: ((agentId: string, def: PtyAgentDef) => AgentRuntime) | undefined
  private readonly hasCredential: ((providerId: string) => boolean) | undefined
  /** 本进程内活动的会话 → 它绑定的 runtime。重启后为空，靠 reconcileOnStartup 对账。 */
  private readonly bound = new Map<SessionId, AgentRuntime>()

  constructor(opts: SessionManagerOptions) {
    this.store = opts.store
    this.registry = opts.registry
    this.runtimes = opts.runtimes
    this.ptyRuntimeFor = opts.ptyRuntimeFor
    this.hasCredential = opts.hasCredential
    this.leases = new LeaseManager({ ttlSeconds: opts.leaseTtlSeconds ?? 300 })
  }

  /**
   * @param opts.projectId 会话归属的项目。**不提供时留空而非编一个**——
   *   没有归属依据时填一个等于伪造事实（不变式 5）。
   */
  async create(
    agentId: string,
    workspace: string,
    opts: { projectId?: string } = {},
  ): Promise<SessionRecord> {
    const def = this.registry.agents[agentId]
    // 无静默回退：未知 agent 立即失败，且在落库之前失败——不留半截记录
    if (!def) throw new SessionSetupError(`未知的 agent "${agentId}"，请检查 providers.yaml 的 agents 段`)

    const id = randomUUID()
    const sessionDir = join(workspace, ".dawn", "sessions", id)
    ensureDawnDirIgnored(workspace)
    const rec: SessionRecord = {
      id,
      agentId,
      workspace,
      sessionDir,
      state: "starting",
      createdAt: new Date().toISOString(),
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    }
    this.store.insert(rec) // 先落库

    const spec: SessionSpec = { sessionId: id, workspace, sessionDir }
    if (def.kind === "native") {
      // 凭证的有无在这里检查，而不是加载配置时：**桌面应用不该因为还没填 key 就起不来**，
      // 但也不该带着空 key 去发请求。这里是真正要用它的时刻，报错也才有可操作性。
      if (this.hasCredential && !this.hasCredential(def.provider)) {
        // 已落库的记录要收尾，不能留在 starting
        this.store.updateState(id, "exited", { exitCode: -1 })
        throw new SessionSetupError(
          `provider "${def.provider}" 未配置凭证——请在设置里填写它的 API key`,
        )
      }
      // provider 的合法性已由 config/loader 的 assertProviders 在加载期保证
      spec.native = { provider: def.provider, model: def.model }
    }

    /**
     * **按 kind 显式分支，不用「非 native 即 pty」。**
     *
     * ①-C 加了第三种 `cli`。原来那个三元是「native ? native : pty」——
     * 加一种 kind 之后它会让 `cli` **悄悄落进 PTY 运行时**：进程照样起得来，
     * 用户看到一个终端，而他配的是一个对话式 agent。
     * **那正是本项目反复栽的静默回退**（规格 7.5）。
     *
     * `cli` 的运行时是 C2/C3 的事；在它到位之前，这里**响亮地失败**。
     */
    if (def.kind === "cli") {
      this.store.updateState(id, "exited", { exitCode: 1 })
      throw new SessionSetupError(
        `agent "${agentId}" 的 kind 是 cli（外部 CLI 的对话模式），` +
          `但 CLI 运行时尚未实现（①-C 的 C2/C3）。` +
          `暂时可把它改成 kind: pty 在终端里用，或改用内置 agent。`,
      )
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

  /**
   * 中止当前回合。**只有 native runtime 实现**——PTY 的中止是送 Ctrl-C，走 `write`。
   * 不支持时明确抛错，不静默成功（规格 7.5）。
   */
  async abort(sessionId: SessionId): Promise<void> {
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动`)
    if (!rt.abort) throw new Error(`该会话的运行时不支持中止——外部 CLI 请在终端里按 Ctrl-C`)
    await rt.abort(sessionId)
  }

  /**
   * 上下文用量。只有 native 有；**拿不到就返回 undefined**——
   * 编一个零出来会让界面显示「上下文是空的」，那是假话。
   */
  contextUsage(sessionId: SessionId) {
    return this.bound.get(sessionId)?.contextUsage?.(sessionId)
  }

  /**
   * 换模型。只有 native 有。
   *
   * **不查写权租约**：换模型不是往会话里写内容，它改的是「下一轮用谁」。
   * 「这一轮还没说完不许换」由运行时自己把（它跟踪着 pending），
   * 见 `NativeRuntime.setModel` 的注释。
   */
  async setModel(sessionId: SessionId, provider: string, model: string): Promise<void> {
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动`)
    if (!rt.setModel) throw new Error("该会话的运行时不支持换模型——外部 CLI 的模型由它自己管")
    await rt.setModel(sessionId, provider, model)
  }

  /** 插一句引导。同样只有 native 有。**写权守卫照旧**——引导也是写入。 */
  async steer(sessionId: SessionId, text: string, as: Holder): Promise<void> {
    const lease = this.leases.current(sessionId)
    if (!lease || lease.holder !== as) {
      throw new Error(
        `引导被拒：${as} 未持有会话 "${sessionId}" 的租约（当前持有者：${lease?.holder ?? "无"}）`,
      )
    }
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动`)
    if (!rt.steer) throw new Error(`该会话的运行时不支持引导`)
    await rt.steer(sessionId, text)
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
