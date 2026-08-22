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
  /** ACP 那边的会话 id（A3）。**要与 `acpFingerprint` 一起用** */
  acpSessionId?: string
  /** 当时是用什么命令起的。**对不上就不许 load**——见 schema 里那段 */
  acpFingerprint?: string
  /**
   * 会话标题。由第一句用户发言推出来。
   *
   * **缺省 = 还没说过话（或是这个概念之前的老会话）**，不是空标题。
   * 界面据此显示「新会话」，而不是显示一行空白。
   */
  title?: string
  /** 置顶。**只是分组，不是另一种序**——置顶的和没置顶的各自按 `sortOrder` 排 */
  pinned: boolean
  /** 归档时刻。**有值 = 藏起来了**：项目列表不列，位置与置顶原样留着 */
  archivedAt?: string
  /** 列表里的位置。**每条都有**，见 schema v8 的说明 */
  sortOrder: number
  /**
   * v11 起：这段对话长在哪台远端服务器上（②-B · R4′）。
   *
   * **缺省 = 本地**。`remoteCwd` 是**此刻**的当前目录，随模型 `cd` 变——
   * 落库不是为了持久化（会话本来活不过重启），是为了**列表要显示它**。
   */
  connectionId?: string
  remoteCwd?: string
}

/**
 * 建会话时调用方要提供的字段。
 *
 * **`pinned` 与 `sortOrder` 不在里面**：位置是入库那一刻由数据库定的
 * （`MAX(sort_order) + 1`），让调用方去算等于把「新的排在哪」这件事
 * 复制到每一个调用点。
 */
export type NewSessionRecord = Omit<SessionRecord, "pinned" | "sortOrder" | "archivedAt">

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
  acp_session_id?: string | null
  acp_fingerprint?: string | null
  title: string | null
  pinned: number
  archived_at?: string | null
  sort_order: number | null
  connection_id: string | null
  remote_cwd: string | null
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
    ...(r.acp_session_id ? { acpSessionId: r.acp_session_id } : {}),
    ...(r.acp_fingerprint ? { acpFingerprint: r.acp_fingerprint } : {}),
    ...(r.title === null || r.title === undefined ? {} : { title: r.title }),
    ...(r.connection_id ? { connectionId: r.connection_id } : {}),
    ...(r.remote_cwd ? { remoteCwd: r.remote_cwd } : {}),
    pinned: r.pinned === 1,
    ...(r.archived_at ? { archivedAt: r.archived_at } : {}),
    // 理论上回填之后不会有 NULL；真有就当它排在最后，**不抛**
    sortOrder: r.sort_order ?? 0,
  }
}

export class SessionStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: NewSessionRecord): void {
    this.db
      .prepare(`
        INSERT INTO sessions (id, agent_id, workspace, session_dir, state, pid, exit_code, created_at, project_id,
                              connection_id, remote_cwd, sort_order)
        VALUES (@id, @agentId, @workspace, @sessionDir, @state, @pid, @exitCode, @createdAt, @projectId,
                @connectionId, @remoteCwd,
                COALESCE((SELECT MAX(sort_order) FROM sessions) + 1, 1))
      `)
      .run({
        ...rec,
        pid: rec.pid ?? null,
        exitCode: rec.exitCode ?? null,
        projectId: rec.projectId ?? null,
        connectionId: rec.connectionId ?? null,
        remoteCwd: rec.remoteCwd ?? null,
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
      /**
       * **置顶的在前，各组内按位置倒序**（新的/挪到上面的在上）。
       * `id` 兜底只是为了**顺序绝对稳定**——两条位置相同时不该每次刷新都换个样。
       */
      .prepare(
        `SELECT * FROM sessions WHERE project_id = ? AND archived_at IS NULL
          ORDER BY pinned DESC, sort_order DESC, id DESC`,
      )
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
  /**
   * 记下这个会话此刻在远端的哪个目录（②-B · R4′）。
   *
   * **每次 `cd` 之后都会来一趟**。写库是为了列表能显示它——
   * 侧栏那一行的副行写的就是它。
   */
  setRemoteCwd(id: string, cwd: string): void {
    this.db.prepare(`UPDATE sessions SET remote_cwd = ? WHERE id = ?`).run(cwd, id)
  }

  /**
   * 这段对话换了个地方干活（T3-b，2026-08-12）。
   *
   * 作者：*「在对话窗口选择文件夹之后，就属于是一个项目管理。」*
   *
   * **三样一起改，缺一样就是一份互相矛盾的记录**：
   *   - `workspace`：agent 的手往哪伸
   *   - `session_dir`：pi 的历史 jsonl 在哪（它就住在 workspace 里面）
   *   - `project_id`：账本、产出、git 事实按它归集
   *
   * 落库之后 `SessionManager.resume` 会照着新值把运行时重新拉起来——
   * **它读的正是这三个字段**，所以「换地方」不需要另造一条启动路径。
   */
  rehome(id: string, to: { workspace: string; sessionDir: string; projectId?: string }): boolean {
    const r = this.db
      .prepare(`UPDATE sessions SET workspace = ?, session_dir = ?, project_id = ? WHERE id = ?`)
      .run(to.workspace, to.sessionDir, to.projectId ?? null, id)
    return r.changes > 0
  }

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

  /**
   * 改名。**空串等于清掉**，回到「新会话」——
   * 而不是存一个空标题（那在界面上是一行空白，看起来像加载失败）。
   */
  rename(id: string, title: string): boolean {
    const v = title.trim()
    return (
      this.db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(v || null, id).changes > 0
    )
  }

  /**
   * 归档 / 取消归档（2026-08-22）。**只动 `archived_at`**，位置与置顶不碰。
   * 重复归档不改写时刻；没这条回 false。
   */
  setArchived(id: string, archived: boolean): boolean {
    const r = archived
      ? this.db.prepare(`UPDATE sessions SET archived_at = COALESCE(archived_at, ?) WHERE id = ?`).run(new Date().toISOString(), id)
      : this.db.prepare(`UPDATE sessions SET archived_at = NULL WHERE id = ?`).run(id)
    return r.changes > 0
  }

  /** 全部归档了的，最近归档的在前 */
  listArchived(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC`).all() as Row[]
    return rows.map(toRecord)
  }

  countArchived(): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE archived_at IS NOT NULL`).get() as { n: number }
    return r.n
  }

  setPinned(id: string, pinned: boolean): boolean {
    return (
      this.db.prepare(`UPDATE sessions SET pinned = ? WHERE id = ?`).run(pinned ? 1 : 0, id)
        .changes > 0
    )
  }

  /**
   * 上移／下移一格。
   *
   * **与相邻那条换位置**，不是重排整张表：换位置是 O(1) 且不会碰到
   * 任何别的行，而重排会把「人从没动过的那些」也搅一遍。
   *
   * **只在同一组里换**（置顶的和没置顶的各排各的）——跨组换等于偷偷
   * 改了置顶状态，那是另一个动作。
   *
   * @returns 换成了没有。**已经在头/尾就是 false**，调用方据此不出声也不撒谎
   */
  move(id: string, direction: "up" | "down"): boolean {
    const me = this.get(id)
    if (!me) return false
    // 上移 = 去更大的 sort_order（列表是倒序的）
    const 更大 = direction === "up"
    const row = this.db
      .prepare(
        /**
         * **邻居要在人看得见的那一列里找。**
         *
         * 加上 `connection_id` 之前，远端会话与临时会话同挂在一个容器项目下，
         * 于是「上移」换到的是一条**根本没显示在那台服务器下面**的会话——
         * 界面上什么都不动。作者报的正是这句：*「连接服务器的对话，不能挪动。」*
         *
         * 本地那些的 `connection_id` 是 NULL，`IS ?` 同样成立——**一条规则管两边**。
         */
        `SELECT id, sort_order FROM sessions
          WHERE project_id IS ? AND connection_id IS ? AND pinned = ? AND archived_at IS NULL AND sort_order ${更大 ? ">" : "<"} ?
          ORDER BY sort_order ${更大 ? "ASC" : "DESC"} LIMIT 1`,
      )
      .get(me.projectId ?? null, me.connectionId ?? null, me.pinned ? 1 : 0, me.sortOrder) as
      | { id: string; sort_order: number }
      | undefined
    if (!row) return false
    const swap = this.db.transaction((a: string, av: number, b: string, bv: number) => {
      this.db.prepare(`UPDATE sessions SET sort_order = ? WHERE id = ?`).run(bv, a)
      this.db.prepare(`UPDATE sessions SET sort_order = ? WHERE id = ?`).run(av, b)
    })
    swap(id, me.sortOrder, row.id, row.sort_order)
    return true
  }

  /**
   * 按给定顺序重排一个项目下的会话（拖拽排序，2026-08-10）。
   *
   * ## 为什么是「客户端发完整顺序」
   *
   * 拖拽的落点可以是任意位置，而在客户端算一个「插在 A 与 B 之间」的
   * `sort_order` 需要间隙分配，间隙用光了还得重排——**那是把服务端的活
   * 搬到客户端，再把重排的时机变成一个偶发事件**。
   * 直接发一份完整顺序，服务端一次写完，没有间隙、没有偶发。
   *
   * ## 两条纪律
   *
   * - **不属于这个项目的 id 一律忽略**，不是报错也不是照写：
   *   照写会让一条会话被挪进别人的项目里。
   * - **没被提到的会话保持相对顺序，排在给定顺序之后**——
   *   界面只发它看得见的那一组时，剩下的不该被打乱。
   *
   * @returns 真正被重排的条数
   */
  reorder(projectId: string, orderedIds: readonly string[]): number {
    const mine = new Set(this.listByProject(projectId).map((r) => r.id))
    const 有效 = orderedIds.filter((id) => mine.has(id))
    if (有效.length === 0) return 0

    // 其余的排在后面，保持它们原有的相对顺序
    const 其余 = this.listByProject(projectId)
      .map((r) => r.id)
      .filter((id) => !有效.includes(id))
    const 全序 = [...有效, ...其余]

    const 写 = this.db.transaction((ids: string[]) => {
      const st = this.db.prepare(`UPDATE sessions SET sort_order = ? WHERE id = ?`)
      // 列表是 `sort_order DESC`，所以第一个拿最大的
      ids.forEach((id, i) => st.run(ids.length - i, id))
    })
    写(全序)
    return 有效.length
  }

  /**
   * 记下 ACP 那边的会话 id 与当时的指纹（A3）。
   * **两个一起写**：只有 id 没有指纹时，下次不敢用它（见 schema 里那段）。
   */
  setAcpSession(id: string, acpSessionId: string, fingerprint: string): void {
    this.db
      .prepare(`UPDATE sessions SET acp_session_id = ?, acp_fingerprint = ? WHERE id = ?`)
      .run(acpSessionId, fingerprint, id)
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
