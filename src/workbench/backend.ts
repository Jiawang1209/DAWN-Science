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
import type { ProjectStore } from "../store/projects.js"
import { diffSince, snapshot, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
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
  /** 凭证变更后让 pi 侧缓存失效。不给则不失效（测试场景） */
  invalidateCredentials?: (providerId: string) => void
}

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials } = opts

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
            : { command: def.command }),
        })),
        providers: used.map((providerId) => ({
          providerId,
          models: [...new Set(nativeAgents.filter((d) => d.provider === providerId).map((d) => d.model))],
        })),
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
      const rec = await sessions.create(agentId, project.workspace, { projectId })

      // 先登记再接线：attach 的回调可能同步就来一条事件
      events.track(rec.id, registry.agents[agentId]?.kind ?? "native")
      sessions.attach(rec.id, (e) => events.ingest(rec.id, e))

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
        if (as === "user") events.userTurn(sessionId, data)
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
