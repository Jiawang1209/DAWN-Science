/**
 * 项目表的读写（Task 2.4）。
 *
 * **项目是用户切换的单位**（规格阶段 ① 定位修正框）：一个文件夹 = 一个项目，
 * 会话与 Run 都挂在项目下。
 */
import type Database from "better-sqlite3"
import type { ProjectSummary } from "../protocol/index.js"

export interface ProjectRecord {
  projectId: string
  name: string
  workspace: string
  createdAt: string
}

interface Row {
  id: string
  name: string
  workspace: string
  created_at: string
}

const toRecord = (r: Row): ProjectRecord => ({
  projectId: r.id,
  name: r.name,
  workspace: r.workspace,
  createdAt: r.created_at,
})

export class ProjectStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: ProjectRecord): void {
    this.db
      .prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES (@projectId, @name, @workspace, @createdAt)`)
      .run(rec)
  }

  get(projectId: string): ProjectRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  /** 打开同一个文件夹应命中同一项目，而不是每次新建——否则历史会被切成碎片。 */
  findByWorkspace(workspace: string): ProjectRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM projects WHERE workspace = ?`).get(workspace) as
      | Row
      | undefined
    return row ? toRecord(row) : undefined
  }

  /** 最近创建的在前 */
  list(): ProjectRecord[] {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as Row[]
    return rows.map(toRecord)
  }

  /**
   * 项目摘要。
   *
   * **计数是算出来的，不是存出来的。** 存一份计数意味着每次增删都要同步更新，
   * 而任何一处漏更新都会让 UI 显示一个永远对不上的数字——那比没有更糟。
   * SQLite 的索引扫描足够快，等它慢到成为问题时再谈缓存。
   *
   * 项目不存在时返回 undefined，而**不是一个全零的假摘要**——
   * 后者会让「项目没了」看起来像「项目是空的」。
   */
  summary(projectId: string): ProjectSummary | undefined {
    const project = this.get(projectId)
    if (!project) return undefined

    const one = (sql: string): number =>
      (this.db.prepare(sql).get(projectId) as { n: number }).n

    return {
      projectId: project.projectId,
      name: project.name,
      workspace: project.workspace,
      createdAt: project.createdAt,
      totalRunCount: one(`SELECT COUNT(*) AS n FROM runs WHERE project_id = ?`),
      totalSessionCount: one(`SELECT COUNT(*) AS n FROM sessions WHERE project_id = ?`),
      // 「未解决问题」= 已结束且出错的 run。进行中的不算——它还没失败
      unresolvedProblemCount: one(
        `SELECT COUNT(*) AS n FROM runs WHERE project_id = ? AND has_error = 1 AND status <> 'running'`,
      ),
    }
  }

  /**
   * 从工作台移除一个项目。
   *
   * **绝不碰磁盘上的文件夹。** 这个方法删的是一条记录，
   * 不是用户的数据——把这两件事混起来，一次误点就没了一个项目的全部工作。
   */
  delete(projectId: string): boolean {
    return this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId).changes > 0
  }
}
