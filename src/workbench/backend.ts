/**
 * Workbench 的真实后端（补 Part 1 的收口）。
 *
 * Task 2.3 交付了 `WorkbenchBackend` 接口与服务端；本文件是它的真实现，
 * 把 ①-A 的 `SessionManager` / `LeaseManager` 与 ①-B 的 `ProjectManager` /
 * `RunStore` / git 事实拼起来。
 *
 * **业务性失败一律抛 `fault(code, message)`**，而不是让它变成 `internal_error`——
 * 否则「项目不存在」与「数据库炸了」在 UI 上会长得一模一样。
 */
import type { ProviderRegistry } from "../config/schema.js"
import { addNativeAgent, setProviderConnection } from "../config/writer.js"
import { homedir } from "node:os"
import { fingerprintOf, type EnvironmentSnapshot } from "../kernel/environment.js"
import type { EnvironmentStore } from "../store/environments.js"
import { deriveSessionTitle } from "../session/title.js"
import type { SessionManager } from "../session/manager.js"
import type { ProjectManager } from "../project/manager.js"
import type { RunStore } from "../store/runs.js"
import type { SettingsStore } from "../store/settings.js"
import { diagnoseInterpreter } from "../kernel/specs.js"
import {
  listDirectory as listWorkspaceDirectory,
  readFileForPreview as readWorkspaceFile,
  resolveInWorkspace,
} from "../files/access.js"
import type { RunRecorder } from "../project/run-recorder.js"
import type { ProjectStore } from "../store/projects.js"
import { diffSince, snapshot, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
import { discoverCliModels } from "../runtime/cli/models.js"
import { familyOf } from "../runtime/family.js"
import { UserFacingError } from "../errors.js"
import { fault, type WorkbenchBackend } from "./server.js"
import type { SessionTranscripts } from "./events.js"
import { discoverKernelSpecs } from "../kernel/specs.js"

/**
 * 凭证库的最小接口。后端只需要这四个动作，不关心它存在哪、怎么加密。
 *
 * **2026-08-08 返工 R2：键从 endpointId 改为 providerId。**
 * 配置里已经没有 endpoints 段了，凭证按 pi 的 provider 存。
 */
export interface CredentialsPort {
  get(providerId: string): string | undefined
  set(providerId: string, secret: string): void
  delete(providerId: string): void
  configured(): string[]
  isEncrypted(): boolean
}

export interface WorkbenchBackendOptions {
  projects: ProjectManager
  projectStore: ProjectStore
  runs: RunStore
  /**
   * 临时会话的目录根（2026-08-11）。**不给就开不了临时会话**，如实说，
   * 不偷偷退回某个猜出来的路径——那个路径上会真的落文件。
   */
  scratchRoot?: string
  /**
   * `providers.yaml` 的路径。**给了才能在界面里加 agent**——
   * 没给就如实说「本次运行没有装配」，不偷偷退回某个猜出来的路径。
   */
  configPath?: string
  /** 应用级设置。两个解释器路径住在这里（②-A 后续） */
  settings?: SettingsStore
  /** 环境快照的落库处（S17）。**没装配也能用**，只是快照不持久 */
  environments?: EnvironmentStore
  /**
   * 交给系统打开一个**绝对路径**（②-A′ · F3）。
   *
   * **端口注入，不在后端里 import Electron**——后端要能在没有 Electron 的
   * 测试里跑。路径的合法性由后端自己保证（走 `resolveInWorkspace`），
   * 这个端口只负责「交给系统」。
   */
  openPath?: (absolutePath: string) => Promise<string>
  sessions: SessionManager
  credentials: CredentialsPort
  /** 配置里的 provider 注册表，供界面列出可选 agent */
  registry: ProviderRegistry
  /** 会话事件中枢。界面靠它才能看见 agent 说了什么 */
  events: SessionTranscripts
  /**
   * 模型目录：该 provider 真正有哪些模型（①-B″ · U2）。
   *
   * **不给则 `available` 缺省**——缺省的含义是「不知道」，不是「没有」。
   * 界面因此不会把「后端没接这个端口」显示成「这个 provider 一个模型都没有」。
   */
  models?: {
    available(providerId: string): Promise<string[]>
    /** pi 认识的全部 provider。**「我能配谁」**，与 `getProviders` 的「我配过谁」不同 */
    known?(): Promise<string[]>
    /** 地址 pi 不自带的那几个。**界面据此给输入框** */
    needsBaseUrl?(): Promise<string[]>
    /**
     * provider 的显示名（`deepseek` → `DeepSeek`）。
     *
     * **不给则界面退回用 id**——缺省是「不知道」，那时用 id 至少是实话。
     */
    names?(): Promise<Record<string, string>>
  }
  /** provider 连接设置变了。装配层据此重新生成 `models.json` 并让下次用上 */
  onProvidersChanged?: (providers: ProviderRegistry["providers"]) => void
  /**
   * 去哪找外部 CLI 自己的配置（codex 的 `models_cache.json`）。
   *
   * **可注入的理由是测试隔离**：不注入时读开发机真实的家目录，
   * 而 e2e 的第一条原则是「每个用例一套全新的目录」——
   * 2026-08-09 加自动发现时捅了这个洞，当场补上。
   */
  cliHome?: string
  /** 凭证变更后让 pi 侧缓存失效。不给则不失效（测试场景） */
  invalidateCredentials?: (providerId: string) => void
  /**
   * Run 记账员。**不给则不记账**——但那意味着 Runs 面板永远是空的，
   * 只有不关心历史的测试才该省略它（不变式 3）。
   */
  runRecorder?: RunRecorder
}

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials, runRecorder, models, cliHome, settings, openPath, environments, configPath, onProvidersChanged, scratchRoot } = opts

  /** 会话开始时的 git 基线，用于算「这次会话改了什么」。进程重启后丢失——见下方注释。 */
  const baselines = new Map<string, GitBaseline>()

  const requireProject = (projectId: string) => {
    const s = projects.summary(projectId)
    if (!s) throw fault("not_found", `项目 "${projectId}" 不存在`)
    return s
  }

  /**
   * **填了 key 就够了**（2026-08-10）。
   *
   * 作者：*「我明明设置 kimi 的 key 就好了，为什么还会多一个新建 agent
   * 这种奇怪的东西呢？其实配置 kimi 的方法，不应该和新建 deepseek 是一回事儿吗？」*
   *
   * 他是对的。deepseek 之所以「填个 key 就能用」，**唯一的原因是它碰巧写在
   * 默认配置里**——而 kimi 没有。同一件事被做成了两种，
   * 差别还落在一个用户根本不该知道的概念（agent）上。
   *
   * 所以：**配了凭证的 provider，自动就有一个同名 agent。**
   *
   * 两条边界：
   *   - **只在内存里**，不写进 `providers.yaml`——那是用户的文件，
   *     我们不该因为他填了个 key 就去改它。
   *   - **绝不覆盖已声明的**：某个 provider 已经有 agent 在用就不再自动加，
   *     否则用户精心写的 model 会被我们挑的那个顶掉。
   */
  async function 确保配过key的都能用(): Promise<void> {
    if (!models?.available) return
    const 已被用 = new Set(
      Object.values(registry.agents)
        .filter((d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native")
        .map((d) => d.provider),
    )
    /**
     * **写下了连接设置的也算。**
     *
     * 一个自建的 vLLM / Ollama 往往**根本不需要 key**——只按「填过 key」来算，
     * 它会在设置里配得好好的，却在对话里选不到，
     * 而那正是作者反复撞上的那件事的另一个版本。
     */
    const 该有的 = [
      ...new Set([...credentials.configured(), ...Object.keys(registry.providers ?? {})]),
    ]
    for (const providerId of 该有的) {
      if (已被用.has(providerId) || registry.agents[providerId]) continue
      /**
       * **挑不出模型就不造这个 agent。** 一个模型是空串的 agent
       * 会在建会话时才炸，而那时错误与「你填了个 key」毫无关系。
       */
      const list = await models.available(providerId).catch(() => [] as string[])
      const model = list[0]
      if (!model) continue
      registry.agents[providerId] = {
        kind: "native",
        provider: providerId,
        model,
        capabilities: ["chat", "exec"],
      }
    }
  }

  /**
   * 起一个会话（登记 + 接线 + 记基线）。
   *
   * **抽出来是因为它现在有两个调用点**（`createSession` 与
   * `createTemporarySession`）——两份复制粘贴的接线代码，
   * 迟早有一份忘了挂记账员或忘了记 git 基线，而那种漏是不出声的。
   */
  async function 起一个会话(projectId: string, agentId: string, workspaceOverride?: string) {
    const project = requireProject(projectId)
    /**
     * **会话的工作目录可以与项目的不同**（2026-08-11）。
     * 临时会话就是这样：它们同属一个「临时会话」项目（那样置顶与排序才成立），
     * 但**每条各有一个自己的目录**——那是作者选的形态。
     */
    const workspace = workspaceOverride ?? project.workspace
    /**
     * **把「打算给用户看的失败」翻成 fault，其余照旧归一成 internal_error。**
     *
     * 服务端只把 `fault()` 的消息原样交给界面，其余只进日志——那条策略是对的
     * （消息里可能有路径、连接串、密钥片段）。所以要让一句话到达用户，
     * **必须在抛出的一侧显式声明它是给用户看的**，而不是让下游去猜哪条安全。
     */
    const rec = await sessions.create(agentId, workspace, { projectId }).catch((err: unknown) => {
      if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
      throw err
    })

    // 先登记再接线：attach 的回调可能同步就来一条事件
    const kind = registry.agents[agentId]?.kind ?? "native"
    events.track(rec.id, kind)
    sessions.attach(rec.id, (e) => {
      events.ingest(rec.id, e)
      // **记账与呈现是两件事，各走各的。**
      runRecorder?.ingest(e)
    })
    // PTY 的「命令」不可观测（只有字节流），可观测的是会话本身
    if (kind === "pty") runRecorder?.beginPtySession(rec.id)

    // 记下 git 基线。拿不到（非 git 仓库）就不记——后续 getRun 因此不返回
    // fileChanges，这比返回一个空数组诚实
    try {
      baselines.set(rec.id, await snapshot(workspace))
    } catch (err) {
      if (!(err instanceof NotAGitRepoError)) throw err
    }

    return projects.sessions(projectId).find((s) => s.sessionId === rec.id)!
  }

  /**
   * 这一次写入在账本上该叫什么。
   *
   * **只有内核会话与众不同**：它送进去的是代码，不是话。
   * 拿不到语言时退回 `kernel_execute`——**不猜**（写死 python 的话，
   * 一个 R 会话的账本会指着一门它没用过的语言）。
   */
  function 这一轮叫什么(sessionId: string): string | undefined {
    const rec = sessions.get(sessionId)
    const agentId = rec?.agentId
    const def = agentId ? registry.agents[agentId] : undefined
    if (def?.kind !== "kernel") return undefined
    return def.language === "R" ? "execute_r" : def.language === "python" ? "execute_python" : "kernel_execute"
  }

  return {
    listProjects: async () => projects.list(),

    /**
     * 界面要列出可选 agent 才能新建会话，要列出 provider 才能填凭证。
     *
     * **2026-08-08 返工 R2**：`endpoints` 段没了，改为回传**本配置实际用到的
     * provider 集合**——不是 pi 内置的全部 39 个。理由：设置界面该问的是
     * 「你声明要用的这些 provider，凭证配了吗」，而不是把 39 个都列出来让人挑。
     *
     * **不回传任何凭证**。
     */
    getProviders: async () => {
      await 确保配过key的都能用()
      /**
       * 显示名一次问全，不在循环里一家一家问。
       * **拿不到就整份缺省**，界面退回用 id——见 `models.names` 的注释。
       */
      const 显示名: Record<string, string> = models?.names
        ? await models.names().catch(() => ({}))
        : {}
      const nativeAgents = Object.values(registry.agents).filter(
        (d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native",
      )
      const used = [...new Set(nativeAgents.map((d) => d.provider))].sort()
      return {
        agents: Object.entries(registry.agents).map(([agentId, def]) => ({
          agentId,
          kind: def.kind,
          ...(def.kind === "native"
            ? { provider: def.provider, model: def.model }
            : {
                command: def.command,
                /**
                 * cli 的模型清单：**配置声明优先，其次自动发现**。
                 *
                 * - 配置里写了 `models` → 用它（**显式压过推断**，这是通则）
                 * - 没写 → 问 CLI 自己（codex 有 `models_cache.json`；claude 没有）
                 * - 都没有 → **不给这个字段**：缺省是「不知道」，
                 *   空数组会被读成「确认一个都没有」
                 *
                 * `model`（钉死当前用哪个）**几乎总该不写**：写了就等于给 CLI 传
                 * `--model`，会盖掉用户自己 CLI 的配置（2026-08-09 作者两个 CLI 都撞上了）。
                 */
                ...(def.kind === "cli" && def.model ? { model: def.model } : {}),
                ...(def.kind === "cli"
                  ? (() => {
                      const list =
                        def.models ??
                        discoverCliModels(familyOf(def.command) ?? "", cliHome)
                      return list ? { models: list } : {}
                    })()
                  : {}),
              }),
        })),
        providers: await Promise.all(
          used.map(async (providerId) => ({
            providerId,
            // 配置里声明过的（凭证界面看这一份）
            models: [...new Set(nativeAgents.filter((d) => d.provider === providerId).map((d) => d.model))],
            // 目录里真正有的（模型选择器看这一份）。**取不到就不给字段**——
            // 缺省是「不知道」，空数组是「确认没有」，两者不能混
            ...(models ? { available: await models.available(providerId) } : {}),
            // pi 给的显示名。**没有就不给字段**，界面退回用 id
            ...(显示名[providerId] ? { name: 显示名[providerId]! } : {}),
          })),
        ),
      }
    },

    /** **只回报配没配，绝不回报凭证本身**——界面不需要知道值 */
    listCredentials: async () => ({
      configured: credentials.configured(),
      encrypted: credentials.isEncrypted(),
    }),

    setCredential: async ({ providerId, secret }) => {
      credentials.set(providerId, secret)
      // 凭证变了必须让 pi 侧的缓存失效，否则刚填的 key 不会生效
      // （缓存的存在理由见 credential-store.ts：一次会话 202 次 read）
      invalidateCredentials?.(providerId)
      return {}
    },

    deleteCredential: async ({ providerId }) => {
      credentials.delete(providerId)
      invalidateCredentials?.(providerId)
      return {}
    },

    getProject: async ({ projectId }) => requireProject(projectId),

    listSessions: async ({ projectId }) => {
      requireProject(projectId)
      return projects.sessions(projectId)
    },

    listRuns: async ({ projectId, sessionId, pageSize }) => {
      requireProject(projectId)
      return projects.runs(projectId, {
        ...(sessionId ? { sessionId } : {}),
        limit: pageSize,
      })
    },

    getRun: async ({ runId }) => {
      const run = runs.get(runId)
      if (!run) throw fault("not_found", `Run "${runId}" 不存在`)

      // 产出：只有拿得到基线才算得出。基线在进程重启后丢失——
      // 那时**不返回 fileChanges 字段**，而不是返回一个空数组。
      // 空数组会被读成「什么都没改」，那是错的；缺字段读成「不知道」，才对。
      const project = projectStore.get(run.projectId)
      const baseline = baselines.get(run.sessionId)
      let fileChanges
      if (project && baseline) {
        try {
          fileChanges = await diffSince(project.workspace, baseline)
        } catch (err) {
          if (!(err instanceof NotAGitRepoError)) throw err
          // 非 git 仓库：同样不编造，留空
        }
      }

      return { ...run, ...(fileChanges ? { fileChanges } : {}) }
    },

    getProvenance: async ({ resourceId }) => {
      const link = runs.getProvenance(resourceId)
      if (!link) throw fault("not_found", `资源 "${resourceId}" 没有溯源记录`)
      return link
    },

    previewTakeover: async ({ sessionId, requester }) =>
      sessions.leases.previewTakeover(sessionId, requester),

    openProject: async ({ workspace }) => {
      const rec = projects.open(workspace)
      return projects.summary(rec.projectId)!
    },

    subscribeSession: async ({ sessionId }) => {
      try {
        return events.subscribe(sessionId)
      } catch (err) {
        // 「会话不在本进程中活动」是业务性失败——进程重启后旧会话就是这个状态，
        // 界面要能分辨它和「数据库炸了」
        throw fault("not_found", err instanceof Error ? err.message : String(err))
      }
    },

    unsubscribeSession: async ({ sessionId }) => {
      events.unsubscribe(sessionId)
      return {}
    },

    createSession: async ({ projectId, agentId }) => 起一个会话(projectId, agentId),

    /**
     * 临时会话：**服务端自己开目录、写项目记录、起会话**（2026-08-11）。
     *
     * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话」*，
     * 并且选了**每个临时会话一个独立目录**。
     *
     * 三件事必须一起成立——目录建了、记录写了、会话却没起来，
     * 就在磁盘和库里各留一份垃圾，而界面上什么都看不到。
     */
    createTemporarySession: async ({ agentId }) => {
      if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")
      const 临时项目 = projects.ensureTemporary(scratchRoot)
      // **每条会话一个自己的目录**，但它们同属那一个临时项目
      const dir = projects.temporaryWorkspace(scratchRoot)
      return 起一个会话(临时项目.projectId, agentId, dir)
    },

    /**
     * 开一个终端（2026-08-11）。**cwd 由这里定，不收渲染进程给的路径。**
     *
     * 作者：*「终端的路径应该是项目文件夹的路径，如果没有选择的话，
     * 那么终端就在家目录下。」*
     *
     * 没有项目时它仍然要有个归属（会话表要 project_id），
     * 挂在那个「临时会话」项目下——**但 cwd 是家目录，不是临时目录**：
     * 你要的是「在自己的地盘上敲两条命令」，不是一个空文件夹。
     */
    createTerminalSession: async ({ agentId, projectId }) => {
      if (projectId) return 起一个会话(projectId, agentId)
      if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")
      const 归属 = projects.ensureTemporary(scratchRoot)
      return 起一个会话(归属.projectId, agentId, homedir())
    },

    /**
     * 全部临时会话。**跨项目**——每个临时会话自带一个项目，
     * 按项目一个个问会变成 N 次调用。
     */
    listTemporarySessions: async () =>
      projects
        .list()
        .filter((p) => p.temporary)
        .flatMap((p) => projects.sessions(p.projectId)),

    writeToSession: async ({ sessionId, data, as }) => {
      try {
        sessions.write(sessionId, data, as)
        // 用户的发言回灌进事件流，**界面不做本地乐观追加**——
        // 事件流是对话的唯一事实来源，两条路各写一半迟早对不上。
        // PTY 会话由中枢自行忽略：终端本来就会回显，再补一条是重复。
        if (as === "user") {
          /**
           * **第一句话定名字**（2026-08-10）。写在这里而不是运行时里：
           * 这是「会话」这个记录的属性，与哪种运行时无关——
           * 内核会话第一段代码同样能当名字。
           *
           * `setTitleIfAbsent` 在 SQL 里判空，不在这里先读后写：
           * 先读后写有窗口，而「第二句话把标题改掉了」的症状是
           * 侧栏上的名字会自己变，人会以为点错了会话。
           */
          const title = deriveSessionTitle(data)
          if (title) projects.setSessionTitle(sessionId, title)
          events.userTurn(sessionId, data)
          /**
           * 运行时没有 turn_start 事件——回合的起点只有这里知道。
           * PTY 会话由记账员自己忽略（那是按键，不是发话），见 run-recorder.ts
           *
           * **内核会话记的是「执行了一段代码」**（2026-08-11）：
           * 账本上一段 R 代码不该和一次模型对话长得一模一样。
           * 名字用路线图 S16 早就写下的 `execute_python` / `execute_r`。
           */
          runRecorder?.beginTurn(sessionId, 这一轮叫什么(sessionId))
        }
      } catch (err) {
        // 写权被拒是业务性失败，不是内部错误——UI 要能分辨并提示用户去抢租约
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    stopSession: async ({ sessionId }) => {
      await sessions.stop(sessionId)
      baselines.delete(sessionId)
      return {}
    },

    abortSession: async ({ sessionId }) => {
      try {
        await sessions.abort(sessionId)
      } catch (err) {
        // 「运行时不支持中止」是业务性失败，界面要能分辨并提示去终端按 Ctrl-C
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    getContextUsage: async ({ sessionId }) => {
      const u = sessions.contextUsage(sessionId)
      // 拿不到时给一个**三档全零、且没有上限**的结果：
      // 上限缺省的含义是"不知道"，界面据此显示「尚未采集」而不是「用了 0%」
      return u ?? { bytes: { system: 0, tools: 0, history: 0 } }
    },

    setSessionModel: async ({ sessionId, provider, model }) => {
      try {
        // **provider 对 cli 会话没有意义**（外部 CLI 没这个概念），
        // 放宽之后这里给空串——运行时那边也只是为了签名一致才留着这个参数
        await sessions.setModel(sessionId, provider ?? "", model)
      } catch (err) {
        // **全是业务性失败**：模型不存在、没配 key、这一轮还没说完。
        // 界面要原样把理由说给人听，所以不能吞成一句「操作失败」
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    steerSession: async ({ sessionId, text }) => {
      try {
        await sessions.steer(sessionId, text, "user")
        events.userTurn(sessionId, text)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    /**
     * 列出本机内核（②-A · K2）。
     *
     * **每次现扫，不缓存。** 用户可能刚在别处 `installspec` 了一个——
     * 缓存住的表现是「我装了但 DAWN 看不见」，而那看起来像 DAWN 坏了。
     */
    listKernels: async () => {
      const d = discoverKernelSpecs()
      return {
        kernels: d.specs.map((k) => ({
          name: k.name,
          displayName: k.displayName,
          ...(k.language ? { language: k.language } : {}),
          ...(k.executable ? { executable: k.executable } : {}),
          dir: k.dir,
        })),
        problems: d.problems,
        shadowed: d.shadowed.map((k) => ({ name: k.name, dir: k.dir })),
      }
    },

    /**
     * 变量面板（②-A · K5 · S14）。
     *
     * **不支持与「真没有」必须分开**：前者是「我们没去问」，
     * 后者是「问了，确实一个都没有」。混成一个空列表，
     * 用户会以为自己的变量丢了。
     */
    listVariables: async ({ sessionId }) => {
      const v = (await sessions.variables(sessionId)) as
        | { supported: false; reason: string }
        | { supported: true; variables: unknown[] }
        | undefined
      if (!v) {
        // 不是内核会话，或会话不在。**如实说，不返回空列表**
        return { supported: false as const, reason: "这个会话没有内核，看不到变量" }
      }
      return v as never
    },

    /**
     * 准入时刻的环境快照（②-B · S17）。
     *
     * **返回冻结的那一份，不重新探。** 「现在装的是什么」与「当时装的是什么」
     * 是两个问题——拿前者回答后者就是用今天的环境伪造昨天的证据。
     */
    getEnvironment: async ({ sessionId }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const snap = sessions.environment(sessionId) as EnvironmentSnapshot | undefined
      if (!snap) {
        /**
         * **三种「没有」说的话不同**，混成一句就等于什么都没说：
         * 不是内核会话 / 语言不支持 / 探测没成功。
         */
        return {
          captured: false as const,
          reason: "这个会话还没有环境快照（不是内核会话、内核语言不是 Python/R、或准入时探测失败）",
        }
      }
      // **入库即冻结**，并且同一个环境只存一行（内容寻址）
      const id = environments?.put(snap, rec.createdAt) ?? fingerprintOf(snap)
      return { captured: true as const, id, ...snap }
    },

    /**
     * 两个解释器路径（2026-08-10，作者定的机制）。
     * **没配的那个不给字段**——「还没配」与「配了一个空路径」在界面上要说不同的话。
     */
    getInterpreters: async () => settings?.interpreters() ?? {},

    setInterpreter: async ({ language, path }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置存储")
      settings.set(language === "python" ? "interpreter.python" : "interpreter.r", path, new Date().toISOString())
      /**
       * **当场验，不等到建会话才炸。**
       *
       * 填完路径就该知道它行不行——「保存成功」然后建会话时才报错，
       * 中间隔着的那段时间会让人以为是别的东西坏了。
       *
       * 这里只做**静态**判断（路径存不存在）：包缺没缺要真起一次才知道，
       * 那是建会话时的事，届时同一套诊断会说清楚。
       */
      const now = settings.interpreters()
      const configured = language === "python" ? now.python : now.r
      const d = configured ? diagnoseInterpreter(language, configured) : undefined
      return { ...now, ...(d ? { problem: d.message } : {}) }
    },

    /**
     * 列一层工作区目录（②-A′ · F2）。
     *
     * **工作区从项目取，不从请求取**——让调用方传工作区，
     * 等于把路径守卫的起点也交给它，那守卫就形同虚设。
     */
    listDirectory: async ({ projectId, path, includeIgnored }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return listWorkspaceDirectory(p.workspace, path, {
        ...(includeIgnored === undefined ? {} : { includeIgnored }),
      })
    },

    /** 读一个文件供预览。**只读**，且路径守卫在 `files/access.ts` 里 */
    readFile: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return readWorkspaceFile(p.workspace, path)
    },

    openExternally: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **守卫在这里，不在调用方**：解析失败会抛，越界也会抛
      const abs = resolveInWorkspace(p.workspace, path)
      if (!openPath) return { problem: "本次运行没有装配「用系统程序打开」的能力" }
      const err = await openPath(abs)
      // Electron 的 `shell.openPath` 成功时返回空串，失败时返回原因
      return err ? { problem: err } : {}
    },

    listKnownProviders: async () => {
      /** 已经写下的连接设置。**只回写过的**，没写过的不给键 */
      const connections: Record<string, { baseUrl?: string; api?: string; models?: string[] }> = {}
      for (const [id, c] of Object.entries(registry.providers ?? {})) {
        connections[id] = {
          ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}),
          ...(c.api ? { api: c.api } : {}),
          ...(c.models ? { models: c.models } : {}),
        }
      }
      /**
       * **目录取不到时也要把连接设置回出去。** 那是用户自己写下的东西，
       * 与「pi 认识谁」无关——不回的话，设置页会把已经填好的地址显示成空的，
       * 看起来像被清掉了。
       */
      const 写过的 = Object.keys(connections).length > 0 ? { connections } : {}
      if (!models?.known) {
        return { providers: [], ...写过的, problem: "本次运行没有装配模型目录" }
      }
      try {
        const ids = await models.known()
        /**
         * 顺带把每个 provider 的模型带上。**建 agent 时要在这里面挑**，
         * 而 `getProviders` 的 `available` 只覆盖配置里用到的那几个。
         */
        const table: Record<string, string[]> = {}
        for (const id of ids) table[id] = await models.available(id)
        return {
          providers: ids,
          models: table,
          // **地址 pi 不自带的那几个**：界面据此给输入框
          ...(models.needsBaseUrl ? { needsBaseUrl: await models.needsBaseUrl() } : {}),
          ...写过的,
        }
      } catch (err) {
        /**
         * **取不到就说取不到。** 返回一个空清单会被读成「pi 一个都不支持」，
         * 而实情是「我们没问到」（规格 7.5：失败必须出声）。
         */
        return {
          providers: [],
          ...写过的,
          problem: err instanceof Error ? err.message : String(err),
        }
      }
    },

    reorderSessions: async ({ projectId, orderedIds }) => {
      requireProject(projectId)
      return { reordered: sessions.reorder(projectId, orderedIds) }
    },

    setProviderConnection: async ({ providerId, baseUrl, api, models: 模型 }) => {
      if (!configPath) throw fault("internal_error", "本次运行没有装配配置文件路径")
      let 新的
      try {
        新的 = setProviderConnection(configPath, providerId, {
          ...(baseUrl === undefined ? {} : { baseUrl }),
          ...(api === undefined ? {} : { api }),
          ...(模型 === undefined ? {} : { models: 模型 }),
        })
      } catch (err) {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      }
      // 原地更新那一个被多处持有的对象（同 createAgent 的理由）
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      registry.providers = 新的.providers
      /**
       * **重新生成 `models.json` 并让下一次用上它。**
       * 不做这一步的话，地址写进了配置却要重启才生效——
       * 而界面会说「已保存」，那是一句半真的话。
       */
      onProvidersChanged?.(新的.providers)
      return {}
    },

    createAgent: async ({ agentId, provider, model }) => {
      if (!configPath) throw fault("internal_error", "本次运行没有装配配置文件路径")
      let 新的
      try {
        新的 = addNativeAgent(configPath, { agentId, provider, model })
      } catch (err) {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      }
      /**
       * **原地更新同一个对象，不换引用。**
       *
       * `registry` 被 wiring 里好几处按引用持有（runtime 的 `commandOf` 现查、
       * 会话中枢的 kind 判定…）。换引用只会更新我们手里这一个，
       * 别人还指着旧的——那时新 agent 在选择器里有、建会话时却说不认识。
       */
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      return { agentId }
    },

    renameSession: async ({ sessionId, title }) => {
      // **空串等于清掉**，回到自动标题——不是存一个空标题
      if (!sessions.rename(sessionId, title)) throw fault("not_found", `没有这个会话：${sessionId}`)
      return {}
    },

    setSessionPinned: async ({ sessionId, pinned }) => {
      if (!sessions.setPinned(sessionId, pinned)) {
        throw fault("not_found", `没有这个会话：${sessionId}`)
      }
      return {}
    },

    moveSession: async ({ sessionId, direction }) => {
      if (!sessions.get(sessionId)) throw fault("not_found", `没有这个会话：${sessionId}`)
      /**
       * **已经在头/尾就如实回 `false`**，不抛也不假装成功。
       * 「没得动了」是一个正常结果，界面据此什么都不做即可。
       */
      return { moved: sessions.move(sessionId, direction) }
    },

    deleteSession: async ({ sessionId }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const removed = await sessions.remove(sessionId)
      if (!removed) throw fault("not_found", `没有这个会话：${sessionId}`)
      // 转录只活在内存里，跟着走
      events.forget(sessionId)
      baselines.delete(sessionId)
      /**
       * **账本留着，并且把还剩多少说出来。**
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      const kept = rec.projectId ? runs.countByProject(rec.projectId) : 0
      return { ledgerKept: kept }
    },

    deletionImpact: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **摆真数字**：界面手里的会话列表与账本都是分页/局部的，猜不出来
      return {
        sessions: sessions.countByProject(projectId),
        runs: runs.countByProject(projectId),
        workspace: p.workspace,
      }
    },

    deleteProject: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)

      /**
       * **先把活着的会话停掉**，再删记录。反过来的话进程还活着
       * 而我们已经忘了它是谁的——一个没人认领的孤儿进程。
       */
      for (const rec of sessions.listByProject(projectId)) {
        if (rec.state !== "exited") await sessions.stop(rec.id).catch(() => {})
        events.forget(rec.id)
        baselines.delete(rec.id)
      }
      const sessionsDeleted = sessions.deleteByProject(projectId)
      const runsDeleted = runs.deleteByProject(projectId)
      projectStore.delete(projectId)
      /**
       * **磁盘上的文件夹一个字节都没动。** 回它的路径，让人一眼确认
       * ——「移除的是工作台里的记录，不是我的数据」。
       */
      return { sessionsDeleted, runsDeleted, workspace: p.workspace }
    },

    acquireLease: async ({ sessionId, holder }) => {
      try {
        return sessions.leases.acquire(sessionId, holder)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
    },
  }
}
