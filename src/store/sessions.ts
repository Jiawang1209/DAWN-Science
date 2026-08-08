/**
 * 会话表的读写（Task 1.3）。
 *
 * 这一层只管持久化，不知道 Runtime、不知道租约。会话生命周期管理器（Task 1.6）
 * 的契约是「先落库再改内存」——所以这里的写入必须是同步且可靠的。
 */
import type Database from "better-sqlite3"

export type SessionState = "starting" | "alive" | "exited"

export interface SessionRecord {
  id: string
  agentId: string
  workspace: string
  sessionDir: string
  state: SessionState
  pid?: number
  exitCode?: number
  createdAt: string
}

interface Row {
  id: string
  agent_id: string
  workspace: string
  session_dir: string
  state: SessionState
  pid: number | null
  exit_code: number | null
  created_at: string
}

function toRecord(r: Row): SessionRecord {
  return {
    id: r.id,
    agentId: r.agent_id,
    workspace: r.workspace,
    sessionDir: r.session_dir,
    state: r.state,
    createdAt: r.created_at,
    // 未设置的字段整个省略，而不是留成 undefined/null。
    // 这样 `"pid" in rec` 能真实反映「有没有这个信息」。
    ...(r.pid === null ? {} : { pid: r.pid }),
    ...(r.exit_code === null ? {} : { exitCode: r.exit_code }),
  }
}

export class SessionStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: SessionRecord): void {
    this.db
      .prepare(`
        INSERT INTO sessions (id, agent_id, workspace, session_dir, state, pid, exit_code, created_at)
        VALUES (@id, @agentId, @workspace, @sessionDir, @state, @pid, @exitCode, @createdAt)
      `)
      .run({ ...rec, pid: rec.pid ?? null, exitCode: rec.exitCode ?? null })
  }

  get(id: string): SessionRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  list(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions ORDER BY created_at`).all() as Row[]
    return rows.map(toRecord)
  }

  /**
   * 只更新本次提供的字段。COALESCE 保证「这次没传 pid」不会把已记录的 pid 抹成 null——
   * 状态推进往往分多次发生（先拿到 pid，后拿到 exitCode），覆盖式写入会丢信息。
   */
  updateState(id: string, state: SessionState, extra: { pid?: number; exitCode?: number } = {}): void {
    this.db
      .prepare(`
        UPDATE sessions
           SET state = @state,
               pid = COALESCE(@pid, pid),
               exit_code = COALESCE(@exitCode, exit_code)
         WHERE id = @id
      `)
      .run({ id, state, pid: extra.pid ?? null, exitCode: extra.exitCode ?? null })
  }

  /**
   * 启动时对账：上次进程留下的 starting/alive 记录不可能仍然存活
   * （进程都换了，pty 与子进程一并没了），显式转为 exited。
   *
   * 这是规格 7.5「无静默回退」在存储层的体现——宁可显式标记「它已经死了」，
   * 也不要让 UI 拿着一个假的存活状态去连一个不存在的进程。
   *
   * @returns 被修正的记录数
   */
  reconcileOnStartup(): number {
    const info = this.db
      .prepare(`UPDATE sessions SET state = 'exited' WHERE state IN ('starting','alive')`)
      .run()
    return info.changes
  }
}
