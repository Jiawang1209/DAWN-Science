/**
 * 任务表的读写（T1，schema v12）。
 *
 * 作者 2026-08-12：*「任务的对话框里面设置工作路径。如果不设置任何工作目录的话，
 * 那么其实就是我们的普通对话。」*
 *
 * ## 一个任务 = 一段对话 + 一个可选的工作路径
 *
 * 它取代的是此前的三样东西（项目 / 项目下的会话 / 临时会话）——
 * 那三样的区别**只有一个**：工作路径是谁给的。
 *
 * ## `workspace` 缺席是有意义的，不是「还没填」
 *
 * **缺席 = 这是一段普通对话。** 服务端仍然会给它一个 scratch 目录让 agent
 * 有地方读写，但那是实现细节，**不进界面、不进这张表**。
 * 用空串表示「没设」会让下游分不清「没设」与「设了一个空路径」——
 * 本项目那条老规矩：**缺失不等于相同，缺失也不等于支持**。
 */
import type Database from "better-sqlite3"

export interface TaskRecord {
  taskId: string
  /** 标题。**缺席 = 还没说过话**，界面据此显示「新任务」，不是一行空白 */
  title?: string
  /** 工作路径。**缺席 = 普通对话**（见文件头） */
  workspace?: string
  /** 活儿在哪台远端机器上（②-B · R3）。**缺席 = 本地** */
  connectionId?: string
  /**
   * 这个任务现在跑的是哪段会话。
   *
   * **缺席 = 还没起来**（比如刚迁过来、进程重启之后）——
   * 那不是错误，界面据此知道「点开时要先把它拉起来」。
   */
  sessionId?: string
  pinned: boolean
  sortOrder: number
  createdAt: string
}

interface Row {
  id: string
  title: string | null
  workspace: string | null
  connection_id: string | null
  session_id: string | null
  pinned: number
  sort_order: number
  created_at: string
}

const toRecord = (r: Row): TaskRecord => ({
  taskId: r.id,
  // **只在真有值时给字段**：`"title" in rec` 因此能如实回答「有没有这个信息」
  ...(r.title ? { title: r.title } : {}),
  ...(r.workspace ? { workspace: r.workspace } : {}),
  ...(r.connection_id ? { connectionId: r.connection_id } : {}),
  ...(r.session_id ? { sessionId: r.session_id } : {}),
  pinned: r.pinned === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
})

export class TaskStore {
  constructor(private readonly db: Database.Database) {}

  /** **置顶的在前，各组内新的在上**——与会话列表同一条序（schema v8 的说明） */
  list(): TaskRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks ORDER BY pinned DESC, sort_order DESC, id DESC`)
      .all() as Row[]
    return rows.map(toRecord)
  }

  get(id: string): TaskRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  insert(rec: TaskRecord): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, workspace, connection_id, session_id, pinned, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.taskId,
        rec.title ?? null,
        rec.workspace ?? null,
        rec.connectionId ?? null,
        rec.sessionId ?? null,
        rec.pinned ? 1 : 0,
        rec.sortOrder,
        rec.createdAt,
      )
  }

  /**
   * 给任务设工作路径（作者要的那个动作）。
   *
   * **传 `undefined` 就是取消设置**——那时它退回「普通对话」。
   * 这是一个明确的动作，不是「忘了填」，所以它写得进去。
   */
  setWorkspace(id: string, workspace: string | undefined): void {
    const r = this.db
      .prepare(`UPDATE tasks SET workspace = ? WHERE id = ?`)
      .run(workspace ?? null, id)
    // **改不到就出声**：静默的 0 行更新会让界面显示「已设置」，而库里没变
    if (r.changes === 0) throw new Error(`没有这个任务：${id}`)
  }

  /** 这个任务现在跑哪段会话。**重启之后会换**，所以它是可写的 */
  setSession(id: string, sessionId: string): void {
    this.db.prepare(`UPDATE tasks SET session_id = ? WHERE id = ?`).run(sessionId, id)
  }

  /** 第一句话定名字。**只在还没有标题时写**——判空在 SQL 里，不在调用方 */
  setTitleIfAbsent(id: string, title: string): void {
    this.db
      .prepare(`UPDATE tasks SET title = ? WHERE id = ? AND (title IS NULL OR title = '')`)
      .run(title, id)
  }

  setPinned(id: string, pinned: boolean): void {
    this.db.prepare(`UPDATE tasks SET pinned = ? WHERE id = ?`).run(pinned ? 1 : 0, id)
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
  }

  /** 下一个排序号。**新的排在最上面**（列表是倒序的） */
  nextSortOrder(): number {
    const row = this.db.prepare(`SELECT MAX(sort_order) AS m FROM tasks`).get() as {
      m: number | null
    }
    return (row.m ?? 0) + 1
  }
}
