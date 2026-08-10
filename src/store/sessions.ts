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
  /** v2 起：会话归属的项目。v1 遗留记录为空——它们产生时还没有项目概念 */
  projectId?: string
  /**
   * v5 起：codex 的会话续接凭据（①-C）。
   *
   * **缺省的含义是「这个会话没有可续接的线程」**——claude 会话恒为空
   * （它是长驻进程，不需要），老记录也为空。
   */
  cliThreadId?: string
  /**
   * 会话标题。由第一句用户发言推出来。
   *
   * **缺省 = 还没说过话（或是这个概念之前的老会话）**，不是空标题。
   * 界面据此显示「新会话」，而不是显示一行空白。
   */
  title?: string
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
  project_id: string | null
  cli_thread_id: string | null
  title: string | null
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
    ...(r.project_id === null || r.project_id === undefined ? {} : { projectId: r.project_id }),
    ...(r.cli_thread_id === null || r.cli_thread_id === undefined ? {} : { cliThreadId: r.cli_thread_id }),
    ...(r.title === null || r.title === undefined ? {} : { title: r.title }),
  }
}

export class SessionStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: SessionRecord): void {
    this.db
      .prepare(`
        INSERT INTO sessions (id, agent_id, workspace, session_dir, state, pid, exit_code, created_at, project_id)
        VALUES (@id, @agentId, @workspace, @sessionDir, @state, @pid, @exitCode, @createdAt, @projectId)
      `)
      .run({
        ...rec,
        pid: rec.pid ?? null,
        exitCode: rec.exitCode ?? null,
        projectId: rec.projectId ?? null,
      })
  }

  get(id: string): SessionRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  list(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions ORDER BY created_at`).all() as Row[]
    return rows.map(toRecord)
  }

  listByProject(projectId: string): SessionRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`)
      .all(projectId) as Row[]
    return rows.map(toRecord)
  }

  /**
   * 只更新本次提供的字段。COALESCE 保证「这次没传 pid」不会把已记录的 pid 抹成 null——
   * 状态推进往往分多次发生（先拿到 pid，后拿到 exitCode），覆盖式写入会丢信息。
   */
  /**
   * 记下 codex 的 `thread_id`。**一拿到就落库**——它丢了会话就断了，
   * 而进程随时可能退出（codex 一轮一个进程）。
   */
  /**
   * 只在还没有标题时写入。
   *
   * **`WHERE title IS NULL` 在 SQL 里判，不在调用方判**——
   * 调用方先读后写会有窗口，而「第二句话把标题改掉了」的症状是
   * 侧栏上的名字会自己变，人会以为点错了会话。
   *
   * @returns 是否真的写进去了。调用方据此决定要不要通知界面刷新
   */
  setTitleIfAbsent(id: string, title: string): boolean {
    const r = this.db
      .prepare(`UPDATE sessions SET title = ? WHERE id = ? AND title IS NULL`)
      .run(title, id)
    return r.changes > 0
  }

  /**
   * 删掉一条会话记录。**不碰账本**——账本记的是「对你的文件发生过什么」，
   * 那件事不因为你删掉一个会话就没发生（不变式 5）。
   *
   * @returns 是否真的删掉了。**没有这条记录要能分辨**，不是静静地成功
   */
  delete(id: string): boolean {
    return this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id).changes > 0
  }

  /** 一个项目下有多少会话。删项目前要**把数字说给用户听** */
  countByProject(projectId: string): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE project_id = ?`)
      .get(projectId) as { n: number }
    return r.n
  }

  /** 删掉一个项目名下的全部会话。移除项目时连带 */
  deleteByProject(projectId: string): number {
    return this.db.prepare(`DELETE FROM sessions WHERE project_id = ?`).run(projectId).changes
  }

  setCliThreadId(id: string, threadId: string): void {
    this.db.prepare(`UPDATE sessions SET cli_thread_id = ? WHERE id = ?`).run(threadId, id)
  }

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
