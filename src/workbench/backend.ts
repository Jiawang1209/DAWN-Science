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

/** 凭证库的最小接口。后端只需要这四个动作，不关心它存在哪、怎么加密。 */
export interface CredentialsPort {
  get(endpointId: string): string | undefined
  set(endpointId: string, secret: string): void
  delete(endpointId: string): void
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
}

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { projects, projectStore, runs, sessions, credentials, registry } = opts

  /** 会话开始时的 git 基线，用于算「这次会话改了什么」。进程重启后丢失——见下方注释。 */
  const baselines = new Map<string, GitBaseline>()

  const requireProject = (projectId: string) => {
    const s = projects.summary(projectId)
    if (!s) throw fault("not_found", `项目 "${projectId}" 不存在`)
    return s
  }

  return {
    listProjects: async () => projects.list(),

    /** **不回传任何凭证**，只回传「配置里有没有写死 key」这个布尔 */
    getProviders: async () => ({
      agents: Object.entries(registry.agents).map(([agentId, def]) => ({
        agentId,
        kind: def.kind,
        ...(def.kind === "native" ? { endpoint: def.endpoint, model: def.model } : { command: def.command }),
      })),
      endpoints: Object.entries(registry.endpoints).map(([endpointId, ep]) => ({
        endpointId,
        baseUrl: ep.baseUrl,
        models: ep.models,
        hasKeyInConfig: ep.apiKey !== undefined,
      })),
    }),

    /** **只回报配没配，绝不回报凭证本身**——界面不需要知道值 */
    listCredentials: async () => ({
      configured: credentials.configured(),
      encrypted: credentials.isEncrypted(),
    }),

    setCredential: async ({ endpointId, secret }) => {
      credentials.set(endpointId, secret)
      return {}
    },

    deleteCredential: async ({ endpointId }) => {
      credentials.delete(endpointId)
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

    createSession: async ({ projectId, agentId }) => {
      const project = requireProject(projectId)
      const rec = await sessions.create(agentId, project.workspace, { projectId })

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

    acquireLease: async ({ sessionId, holder }) => {
      try {
        return sessions.leases.acquire(sessionId, holder)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
    },
  }
}
