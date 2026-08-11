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
import type { NewSessionRecord, SessionRecord, SessionStore } from "../store/sessions.js"
import type { AgentRuntime, EventSink, SessionId, SessionSpec } from "../runtime/types.js"
import { UserFacingError } from "../errors.js"
import { LeaseManager, type Holder } from "./lease.js"

export type PtyAgentDef = Extract<AgentDef, { kind: "pty" }>

/**
 * **打算给用户看的失败。**
 *
 * 定义搬到了 `src/errors.ts`——`runtime/` 也要用它，而 `runtime/` 不能
 * 反向依赖 `session/`。这里留一个别名，老调用点不必全改。
 */
export { UserFacingError as SessionSetupError }

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

/**
 * 在 `.dawn/` 里放一份**子 agent 的样例**（2026-08-10）。
 *
 * ## 为什么需要它
 *
 * 子 agent 的能力早就具备了，但一个新用户打开 DAWN**不知道该往哪写什么**——
 * `.dawn/agents/` 是空的，格式也没有任何地方提示。
 *
 * ## 为什么后缀是 `.md.example` 而不是 `.md`
 *
 * **加载器把 `.dawn/agents/` 下的每一个 `.md` 都当成一个子 agent**
 * （`definitions.ts` 里 `names.filter((n) => n.endsWith(".md"))`）。
 * 所以样例若叫 `scout.md`，它就不是样例，是一个**我们替用户装上的 agent**——
 * 那是替他做决定；叫 `README.md` 更糟：它会变成一个 frontmatter 缺失的坏定义，
 * 每次建会话都报一次问题。
 *
 * `.md.example` 加载器不认，于是它只是一份可读的样板，**改个名才生效**。
 * 怎么改名写在 `.dawn/README.txt` 里——那个文件在 `agents/` 外面，
 * 同样不会被当成定义。
 *
 * **已存在就不动**：与 `.gitignore` 同一条规矩，覆盖等于替用户做决定。
 */
export function seedSubagentExample(workspace: string): void {
  const dir = join(workspace, ".dawn", "agents")
  const example = join(dir, "scout.md.example")
  const readme = join(workspace, ".dawn", "README.txt")
  try {
    if (!existsSync(example)) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(example, SCOUT_EXAMPLE, "utf8")
    }
    if (!existsSync(readme)) writeFileSync(readme, DAWN_README, "utf8")
  } catch {
    // 与 `.gitignore` 同一条理由：写不出来不该拦住建会话
  }
}

/**
 * 送出去的那份样例。
 *
 * **内容与 `examples/agents/scout.md` 逐字一致，由测试守着**——
 * 我第一版在这里自己另写了一个 scout，那就是同一份东西两个家：
 * 改了仓库里那份，用户拿到的还是旧的，而且没有任何东西会说不一致。
 * 这个项目今天已经在别处栽过一次（`layout-constants.ts`）。
 */
const SCOUT_EXAMPLE = `---
name: scout
description: 快速踏勘代码库或数据目录，返回压缩后的要点，不做修改
tools: read, bash
---
你是踏勘员。

你的任务是**快速摸清情况并压缩成要点**，不是把全文搬回去。
调用你的人只有很小的上下文预算，所以：

- 先用 bash（\`ls\` / \`grep\` / \`head\`）定位，再用 read 精读少数关键文件
- 回答控制在 20 行以内，列出**文件路径 + 一句话说明**
- 拿不准的地方明说「没查到」，**不要猜**

**只读不写。** 你没有被授予写文件的工具。
`

const DAWN_README = `这个目录是 DAWN Science 建的，放这个项目的会话数据与子 agent 定义。
整个目录已经自我忽略（.dawn/.gitignore 里是一个 *），不会进你的 git。

agents/
    子 agent 定义。**这里每一个 .md 文件都会成为一个子 agent**，
    格式是 YAML frontmatter（name / description）+ 正文提示词。

    目录里有一份 scout.md.example —— 去掉 .example 后缀就能用：

        mv .dawn/agents/scout.md.example .dawn/agents/scout.md

    带 .example 的文件加载器不认，所以它现在只是样例，不是一个 agent。

改完不用重启：子 agent 定义是**每次建会话时**读的。
`

export interface SessionManagerOptions {
  store: SessionStore
  registry: ProviderRegistry
  runtimes: { native: AgentRuntime; pty: AgentRuntime; cli?: AgentRuntime; kernel?: AgentRuntime }
  /** 配置好的解释器路径。**没配就返回 undefined**——不猜一个 */
  interpreterOf?: (language: "python" | "R") => string | undefined
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
  private readonly runtimes: { native: AgentRuntime; pty: AgentRuntime; cli?: AgentRuntime; kernel?: AgentRuntime }
  private readonly interpreterOf: ((language: "python" | "R") => string | undefined) | undefined
  private readonly ptyRuntimeFor: ((agentId: string, def: PtyAgentDef) => AgentRuntime) | undefined
  private readonly hasCredential: ((providerId: string) => boolean) | undefined
  /** 本进程内活动的会话 → 它绑定的 runtime。重启后为空，靠 reconcileOnStartup 对账。 */
  private readonly bound = new Map<SessionId, AgentRuntime>()

  constructor(opts: SessionManagerOptions) {
    this.store = opts.store
    this.registry = opts.registry
    this.runtimes = opts.runtimes
    this.ptyRuntimeFor = opts.ptyRuntimeFor
    this.interpreterOf = opts.interpreterOf
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
    if (!def) throw new UserFacingError(`未知的 agent "${agentId}"，请检查 providers.yaml 的 agents 段`)

    const id = randomUUID()
    const sessionDir = join(workspace, ".dawn", "sessions", id)
    ensureDawnDirIgnored(workspace)
    seedSubagentExample(workspace)
    const rec: NewSessionRecord = {
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
        throw new UserFacingError(
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
     */
    let runtime: AgentRuntime
    if (def.kind === "native") {
      runtime = this.runtimes.native
    } else if (def.kind === "cli") {
      const cli = this.runtimes.cli
      // 没装配 CLI 运行时的场景（部分单测）**明确失败**，不退回 pty
      if (!cli) {
        this.store.updateState(id, "exited", { exitCode: 1 })
        throw new UserFacingError(
          `agent "${agentId}" 的 kind 是 cli，但本次运行没有装配 CLI 运行时`,
        )
      }
      runtime = cli
      /**
       * **续接凭据从库里来**：codex 一轮一个进程，重开应用后靠 `thread_id`
       * 接上上一次的对话。claude 用不上它（长驻进程），那时库里恒为空。
       */
      const prior = this.store.get(id)?.cliThreadId
      if (prior) spec.cli = { threadId: prior }
    } else if (def.kind === "kernel") {
      /**
       * **必须是显式分支。** 落进下面那个 `else` 的话，一个内核会话会
       * 悄悄变成一个 PTY——进程起得来、界面画出个终端，
       * 而用户配的是一个执行器。**那正是上面那段注释说的静默回退。**
       */
      const kernel = this.runtimes.kernel
      if (!kernel) {
        this.store.updateState(id, "exited", { exitCode: 1 })
        throw new UserFacingError(
          `agent "${agentId}" 的 kind 是 kernel，但本次运行没有装配内核运行时`,
        )
      }
      runtime = kernel
      /**
       * **优先按语言取配置好的解释器路径。**
       *
       * 作者 2026-08-10 定的机制：*「只有配置了，我们才能调用。」*
       * 没配就响亮失败并指向设置——**不退回扫描出来的某个 kernelspec**，
       * 那正是「跑在了另一个环境里而不自知」的来源。
       */
      if (def.language) {
        const path = this.interpreterOf?.(def.language)
        if (!path) {
          this.store.updateState(id, "exited", { exitCode: 1 })
          throw new UserFacingError(
            `还没有配置 ${def.language === "python" ? "Python" : "R"} 解释器路径——到「设置 → 内核」填一个。`,
          )
        }
        spec.kernel = { language: def.language, interpreterPath: path }
      } else {
        spec.kernel = { kernelName: def.command! }
      }
    } else {
      runtime = this.ptyRuntimeFor?.(agentId, def) ?? this.runtimes.pty
    }
    try {
      const handle = await runtime.start(spec)
      this.bound.set(id, runtime)
      this.store.updateState(id, "alive", { pid: handle.pid })
      // 进程自行退出时把退出码回写入库——否则库里会永远停在 alive
      runtime.attach(id, (e) => {
        if (e.kind === "exited") this.store.updateState(id, "exited", { exitCode: e.exitCode })
      })
      /**
       * **从库里读回来**，不拿内存里那份拼一个。
       * `sortOrder` 是入库那一刻由数据库定的（`MAX + 1`），
       * 在这里补一个值等于猜——而它正是列表顺序的依据。
       */
      const saved = this.store.get(id)
      if (!saved) throw new Error(`会话 ${id} 刚入库就读不到了`)
      return saved
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

  /**
   * 停掉本进程里所有活着的会话（2026-08-11，退出时用）。
   *
   * ## 为什么退出时非停不可
   *
   * 内核会话背后是 zeromq 的 socket。**进程带着未关闭的 socket 退出，
   * 它的 native 析构会抛 `Napi::Error`——那是从 C++ 里抛的，
   * JS 一个 try/catch 都接不住，整个进程 SIGABRT。**
   *
   * 症状离原因非常远：e2e 全量跑时随机一条报
   * `electronApplication.firstWindow: Timeout 30000ms`——
   * 上一个进程崩了，macOS 的崩溃上报把下一次启动拖过了 30 秒。
   * 这笔账挂了两天，直到把主进程的 stderr 接进测试输出才看见那一行。
   *
   * **每个都单独兜底**：一个停不下来不该拖住其余的（退出路径上尤其如此）。
   */
  /**
   * 本进程里有没有**内核**会话（2026-08-11）。
   *
   * 退出时只有它需要「等一等」——**zeromq 的 socket 不关就会让进程 SIGABRT**。
   * native / cli / pty 没有这个问题，它们不该为此每次退出都多等一会儿：
   * e2e 那边一次退出多等 1 秒，155 条用例就是两分半。
   */
  hasLiveKernelSessions(): boolean {
    const kernel = this.runtimes.kernel
    if (!kernel) return false
    for (const rt of this.bound.values()) if (rt === kernel) return true
    return false
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.bound.keys()].map((id) =>
        this.stop(id).catch(() => {
          // 退出路上，停不掉的那个交给 OS。**但不能因此不停别的**
        }),
      ),
    )
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
   * 这个会话现在有哪些变量（②-A · K5 · S14）。**只有内核会话有。**
   *
   * 与 `contextUsage` 同一个形状：能力是运行时可选的，
   * **拿不到就是 `undefined`**，由调用方决定怎么说。
   */
  /**
   * 这个会话准入时的环境快照（S17）。
   *
   * **同一条透传写法**：运行时有这个能力就问，没有就 `undefined`——
   * 「这个运行时不认识环境」与「这个环境是空的」是两回事。
   */
  environment(sessionId: SessionId): unknown {
    const rt = this.bound.get(sessionId) as
      | { environmentOf?: (id: SessionId) => unknown }
      | undefined
    return rt?.environmentOf ? rt.environmentOf(sessionId) : undefined
  }

  async variables(sessionId: SessionId) {
    const rt = this.bound.get(sessionId) as { variables?: (id: SessionId) => Promise<unknown> } | undefined
    return rt?.variables ? await rt.variables(sessionId) : undefined
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

  /**
   * 删掉一个会话：**先停进程，再删记录**。
   *
   * 顺序不能反——先删记录的话，进程还活着而我们已经忘了它是谁的，
   * 那就成了一个**没人认领的孤儿进程**，只有重启才收得回来。
   *
   * @returns 是否真的删掉了
   */
  async remove(sessionId: SessionId): Promise<boolean> {
    await this.stop(sessionId)
    return this.store.delete(sessionId)
  }

  reorder(projectId: string, orderedIds: readonly string[]): number {
    return this.store.reorder(projectId, orderedIds)
  }

  rename(sessionId: SessionId, title: string): boolean {
    return this.store.rename(sessionId, title)
  }

  setPinned(sessionId: SessionId, pinned: boolean): boolean {
    return this.store.setPinned(sessionId, pinned)
  }

  move(sessionId: SessionId, direction: "up" | "down"): boolean {
    return this.store.move(sessionId, direction)
  }

  /** 取一条会话记录。**没有就是 undefined**，不抛 */
  get(sessionId: SessionId): SessionRecord | undefined {
    return this.store.get(sessionId)
  }

  listByProject(projectId: string): SessionRecord[] {
    return this.store.listByProject(projectId)
  }

  countByProject(projectId: string): number {
    return this.store.countByProject(projectId)
  }

  /** 删掉一个项目名下的全部会话记录。**调用方负责先把进程停掉** */
  deleteByProject(projectId: string): number {
    return this.store.deleteByProject(projectId)
  }

  list(): SessionRecord[] {
    return this.store.list()
  }

  /** 进程启动时调用：上次遗留的 starting/alive 显式转 exited（见 store 的同名方法）。 */
  reconcileOnStartup(): number {
    return this.store.reconcileOnStartup()
  }
}
