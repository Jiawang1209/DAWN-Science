/**
 * 项目管理器（Task 2.6）。
 *
 * **项目是用户切换的单位**：打开一个文件夹即一个项目，会话与 Run 都挂在它下面。
 * 这一层把三个 store 拼成协议实体，是 Workbench 后端的主要数据来源。
 */
import { randomUUID } from "node:crypto"
import { basename, resolve } from "node:path"
import type { ProviderRegistry } from "../config/schema.js"
import type { ProjectRecord, ProjectStore } from "../store/projects.js"
import type { RunStore } from "../store/runs.js"
import type { SessionStore } from "../store/sessions.js"
import type { ProjectSummary, RunSummary, SessionSummary } from "../protocol/index.js"

export interface ProjectManagerOptions {
  projects: ProjectStore
  sessions: SessionStore
  runs: RunStore
  /** 有 registry 才能知道一个 agent 是 native 还是 pty；没有则回退 native */
  registry?: ProviderRegistry
}

export class ProjectManager {
  // 字段名与方法名必须错开：sessions()/runs() 是对外的查询方法
  private readonly projectStore: ProjectStore
  private readonly sessionStore: SessionStore
  private readonly runStore: RunStore
  private readonly registry: ProviderRegistry | undefined

  constructor(opts: ProjectManagerOptions) {
    this.projectStore = opts.projects
    this.sessionStore = opts.sessions
    this.runStore = opts.runs
    this.registry = opts.registry
  }

  /**
   * 打开一个文件夹为项目。**已存在则返回原项目，不新建**——
   * 否则重复打开同一目录会不断产生新项目，把历史切成碎片。
   *
   * 路径先规范化再比对：`/w` 与 `/w/` 必须命中同一项目。
   */
  open(workspace: string): ProjectRecord {
    if (!workspace.startsWith("/")) {
      throw new Error(`项目路径必须是绝对路径，收到 "${workspace}"——相对路径在多窗口下会指向不同位置`)
    }
    const normalized = resolve(workspace)
    const existing = this.projectStore.findByWorkspace(normalized)
    if (existing) return existing

    const rec: ProjectRecord = {
      projectId: randomUUID(),
      name: basename(normalized) || normalized,
      workspace: normalized,
      createdAt: new Date().toISOString(),
    }
    this.projectStore.insert(rec)
    return rec
  }

  summary(projectId: string): ProjectSummary | undefined {
    return this.projectStore.summary(projectId)
  }

  list(): ProjectSummary[] {
    return this.projectStore
      .list()
      .map((p) => this.projectStore.summary(p.projectId))
      .filter((s): s is ProjectSummary => s !== undefined)
  }

  /**
   * agent 的 kind 来自 registry。**取不到时回退 native 并且这是显式行为**——
   * 不是猜测，而是「没有配置依据时的已声明默认值」。
   */
  private kindOf(agentId: string): "native" | "pty" {
    return this.registry?.agents[agentId]?.kind ?? "native"
  }

  /** 列出项目下的会话（协议实体形态） */
  sessions(projectId: string): SessionSummary[] {
    return this.sessionStore.listByProject(projectId).map((s) => ({
      sessionId: s.id,
      projectId,
      agentId: s.agentId,
      kind: this.kindOf(s.agentId),
      state: s.state,
      createdAt: s.createdAt,
      ...(s.pid === undefined ? {} : { pid: s.pid }),
      ...(s.exitCode === undefined ? {} : { exitCode: s.exitCode }),
    }))
  }

  /** 列出项目下的 Run，最近的在前——项目面板的历史栏要的就是这个顺序 */
  runs(projectId: string, opts: { sessionId?: string; limit?: number } = {}): RunSummary[] {
    return this.runStore.listByProject(projectId, opts)
  }
}
