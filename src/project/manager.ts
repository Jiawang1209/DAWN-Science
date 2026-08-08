/**
 * 项目管理器（Task 2.6）。
 *
 * **项目是用户切换的单位**：打开一个文件夹即一个项目，会话与 Run 都挂在它下面。
 * 这一层把三个 store 拼成协议实体，是 Workbench 后端的主要数据来源。
 */
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
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

  /**
   * 保证至少有一个项目可用。
   *
   * **作者的原话：「claude code, codex 其实上来也没有要求我一定要配置工作目录的。」**
   * 此前 DAWN 把「打开文件夹」做成了准入门槛——后端完全可用，界面却什么都不让做。
   * Hermes 的 DESIGN.md 早写明了正解：*"Reserve the full-screen boot/connecting
   * experience for a genuinely unusable backend."* 没有项目不属于那种情况。
   *
   * 注意它**不是**「总是创建默认项目」：
   *   - 已经有项目 ⇒ 什么都不做，返回第一个。不往用户的列表里塞东西，
   *     **也不创建那个目录**——用户没要它。
   *   - 一个都没有 ⇒ 建目录 + 建项目，幂等（`open()` 命中已有路径会复用）。
   */
  ensureDefault(workspace: string): ProjectRecord {
    const existing = this.projectStore.list()
    if (existing.length > 0) return existing[0]!
    mkdirSync(workspace, { recursive: true })
    return this.open(workspace)
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
