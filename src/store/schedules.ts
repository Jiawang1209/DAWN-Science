/** 定时任务的两张表（schema v15）。纯读写，不算时间 */
import type Database from "better-sqlite3"
import type { 定义, 运行, 运行状态 } from "../schedule/domain.js"
import type { 计划 } from "../schedule/recurrence.js"
import type { 权限档 } from "../policy/permissions.js"

interface 定义行 {
  id: string; revision: number; name: string; prompt: string; status: "active" | "paused"; schedule: string
  agent_id: string; workspace: string | null; connection_id: string | null; permission: string; created_at: string; updated_at: string
}
interface 运行行 {
  id: string; schedule_id: string; revision: number; occurrence_key: string; trigger: "schedule" | "manual"; scheduled_for: string
  status: 运行状态; prompt: string; session_id: string | null; started_at: string | null; finished_at: string | null
  summary: string | null; error_code: string | null; error_message: string | null
}

const 定义自行 = (r: 定义行): 定义 => ({
  id: r.id, revision: r.revision, name: r.name, prompt: r.prompt, status: r.status, schedule: JSON.parse(r.schedule) as 计划,
  agentId: r.agent_id, ...(r.workspace ? { workspace: r.workspace } : {}), ...(r.connection_id ? { connectionId: r.connection_id } : {}),
  permission: r.permission as 权限档, createdAt: r.created_at, updatedAt: r.updated_at,
})
const 运行自行 = (r: 运行行): 运行 => ({
  id: r.id, scheduleId: r.schedule_id, revision: r.revision, occurrenceKey: r.occurrence_key, trigger: r.trigger, scheduledFor: r.scheduled_for,
  status: r.status, prompt: r.prompt,
  ...(r.session_id ? { sessionId: r.session_id } : {}), ...(r.started_at ? { startedAt: r.started_at } : {}), ...(r.finished_at ? { finishedAt: r.finished_at } : {}),
  ...(r.summary ? { summary: r.summary } : {}), ...(r.error_code ? { error: { code: r.error_code, message: r.error_message ?? "" } } : {}),
})

export class ScheduleStore {
  constructor(private readonly db: Database.Database) {}

  list(): 定义[] {
    return (this.db.prepare(`SELECT * FROM schedules ORDER BY created_at DESC`).all() as 定义行[]).map(定义自行)
  }
  get(id: string): 定义 | undefined {
    const r = this.db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(id) as 定义行 | undefined
    return r ? 定义自行(r) : undefined
  }
  put(d: 定义): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO schedules (id, revision, name, prompt, status, schedule, agent_id, workspace, connection_id, permission, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.id, d.revision, d.name, d.prompt, d.status, JSON.stringify(d.schedule), d.agentId, d.workspace ?? null, d.connectionId ?? null, d.permission, d.createdAt, d.updatedAt)
  }
  /** 删定义；**运行记录留着**（它们是历史） */
  delete(id: string): boolean {
    return this.db.prepare(`DELETE FROM schedules WHERE id = ?`).run(id).changes > 0
  }

  runs(scheduleId?: string, limit = 200): 运行[] {
    const rows = scheduleId
      ? (this.db.prepare(`SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY scheduled_for DESC LIMIT ?`).all(scheduleId, limit) as 运行行[])
      : (this.db.prepare(`SELECT * FROM schedule_runs ORDER BY scheduled_for DESC LIMIT ?`).all(limit) as 运行行[])
    return rows.map(运行自行)
  }
  getRun(id: string): 运行 | undefined {
    const r = this.db.prepare(`SELECT * FROM schedule_runs WHERE id = ?`).get(id) as 运行行 | undefined
    return r ? 运行自行(r) : undefined
  }
  hasOccurrence(key: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM schedule_runs WHERE occurrence_key = ?`).get(key))
  }
  putRun(r: 运行): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO schedule_runs (id, schedule_id, revision, occurrence_key, trigger, scheduled_for, status, prompt, session_id, started_at, finished_at, summary, error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.id, r.scheduleId, r.revision, r.occurrenceKey, r.trigger, r.scheduledFor, r.status, r.prompt, r.sessionId ?? null, r.startedAt ?? null, r.finishedAt ?? null, r.summary ?? null, r.error?.code ?? null, r.error?.message ?? null)
  }
  /** 还没到终态的（启动时要收拾） */
  unfinished(): 运行[] {
    return (this.db.prepare(`SELECT * FROM schedule_runs WHERE status IN ('queued','running')`).all() as 运行行[]).map(运行自行)
  }
  /** 每条定义只留最近 `keep` 条记录 */
  prune(scheduleId: string, keep: number): number {
    return this.db
      .prepare(
        `DELETE FROM schedule_runs WHERE schedule_id = ? AND id NOT IN (
           SELECT id FROM schedule_runs WHERE schedule_id = ? ORDER BY scheduled_for DESC LIMIT ?)`,
      )
      .run(scheduleId, scheduleId, keep).changes
  }
}
