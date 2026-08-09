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
import type { SessionManager } from "../session/manager.js"
import type { ProjectManager } from "../project/manager.js"
import type { RunStore } from "../store/runs.js"
import type { RunRecorder } from "../project/run-recorder.js"
import type { ProjectStore } from "../store/projects.js"
import { diffSince, snapshot, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
import { discoverCliModels } from "../runtime/cli/models.js"
import { familyOf } from "../runtime/family.js"
import { UserFacingError } from "../errors.js"
import { fault, type WorkbenchBackend } from "./server.js"
import type { SessionTranscripts } from "./events.js"

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
  models?: { available(providerId: string): Promise<string[]> }
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
  const { projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials, runRecorder, models, cliHome } = opts

  /** 会话开始时的 git 基线，用于算「这次会话改了什么」。进程重启后丢失——见下方注释。 */
  const baselines = new Map<string, GitBaseline>()

  const requireProject = (projectId: string) => {
    const s = projects.summary(projectId)
    if (!s) throw fault("not_found", `项目 "${projectId}" 不存在`)
    return s
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

    createSession: async ({ projectId, agentId }) => {
      const project = requireProject(projectId)
      /**
       * **把「打算给用户看的失败」翻成 fault，其余照旧归一成 internal_error。**
       *
       * 服务端只把 `fault()` 的消息原样交给界面，其余只进日志——那条策略是对的
       * （消息里可能有路径、连接串、密钥片段）。所以要让一句话到达用户，
       * **必须在抛出的一侧显式声明它是给用户看的**，而不是让下游去猜哪条安全。
       *
       * 2026-08-09 由 ①-C 的第一条 e2e 撞出来：会话层写得很清楚的
       * 「provider 未配置凭证——请在设置里填写它的 API key」，
       * 在界面上是 `操作 "createSession" 执行失败`。
       */
      const rec = await sessions.create(agentId, project.workspace, { projectId }).catch((err: unknown) => {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      })

      // 先登记再接线：attach 的回调可能同步就来一条事件
      const kind = registry.agents[agentId]?.kind ?? "native"
      events.track(rec.id, kind)
      sessions.attach(rec.id, (e) => {
        events.ingest(rec.id, e)
        // **记账与呈现是两件事，各走各的。** 中枢管「界面看得见什么」，
        // 记账员管「账本上留下什么」——把它们合成一条会让任何一方的改动
        // 都可能悄悄影响另一方
        runRecorder?.ingest(e)
      })
      // PTY 的「命令」不可观测（只有字节流），可观测的是会话本身。见 run-recorder.ts
      if (kind === "pty") runRecorder?.beginPtySession(rec.id)

      // 记下 git 基线，供之后算「这次会话改了什么」。
      // 拿不到（非 git 仓库）就不记——后续 getRun 会因此不返回 fileChanges，
      // 这比返回一个空数组诚实。
      try {
        baselines.set(rec.id, await snapshot(project.workspace))
      } catch (err) {
        if (!(err instanceof NotAGitRepoError)) throw err
      }

      return projects.sessions(projectId).find((s) => s.sessionId === rec.id)!
    },

    writeToSession: async ({ sessionId, data, as }) => {
      try {
        sessions.write(sessionId, data, as)
        // 用户的发言回灌进事件流，**界面不做本地乐观追加**——
        // 事件流是对话的唯一事实来源，两条路各写一半迟早对不上。
        // PTY 会话由中枢自行忽略：终端本来就会回显，再补一条是重复。
        if (as === "user") {
          events.userTurn(sessionId, data)
          // 运行时没有 turn_start 事件——回合的起点只有这里知道。
          // PTY 会话由记账员自己忽略（那是按键，不是发话），见 run-recorder.ts
          runRecorder?.beginTurn(sessionId)
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

    acquireLease: async ({ sessionId, holder }) => {
      try {
        return sessions.leases.acquire(sessionId, holder)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
    },
  }
}
