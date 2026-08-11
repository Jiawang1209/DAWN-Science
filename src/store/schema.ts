/**
 * SQLite 表结构与迁移。
 *
 * 选 SQLite 而非 JSONL：pi-crew 为 JSONL 付出了跨进程锁、手写轮转、流式读、
 * 增量读器、序列号缓存、以及用 worker 线程绕开一个疑似 event-loop 竞态共六项工程代价，
 * 而本项目自带 Electron 运行时、可以携带需编译的原生依赖，用 WAL 后这六项全部不存在。
 * 见规格 7.32。
 *
 * **纪律（自 ①-A 沿用）**：CHECK 约束是第二道防线。应用层的 TypeScript 联合类型
 * 与 zod schema 只在各自的边界有效，挡不住迁移脚本或将来其它写入方直接写库。
 * v2 把协议层 `superRefine` 的三条约束在数据库层各配了一道 CHECK——
 * 同一条规则，两处独立强制。
 */
import type Database from "better-sqlite3"

export const SCHEMA_VERSION = 11

function currentVersion(db: Database.Database): number {
  const has = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'`)
    .get()
  if (!has) return 0
  const row = db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get() as
    | { value: string }
    | undefined
  return row ? Number(row.value) : 0
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

export function migrate(db: Database.Database): void {
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  const from = currentVersion(db)

  // ── v1：会话表 ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      workspace   TEXT NOT NULL,
      session_dir TEXT NOT NULL,
      state       TEXT NOT NULL CHECK (state IN ('starting','alive','exited')),
      pid         INTEGER,
      exit_code   INTEGER,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
  `)

  // ── v2：项目 / Run / 溯源 ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      -- 一个文件夹只能对应一个项目：再次打开同一目录应命中同一项目，
      -- 而不是每次都新建一个，那会让历史被切成碎片
      workspace  TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id),
      session_id    TEXT NOT NULL,
      parent_run_id TEXT REFERENCES runs(id),
      origin        TEXT NOT NULL CHECK (origin IN ('user','agent','system')),
      -- 开放字符串：①-B 只有 agent_turn，②-A 会加 execute_r / execute_py
      request_type  TEXT NOT NULL,
      status        TEXT NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
      started_at    TEXT NOT NULL,
      finished_at   TEXT,
      terminal_reason TEXT,
      has_error     INTEGER NOT NULL CHECK (has_error IN (0,1)),
      artifact_count INTEGER,

      -- 这一次调用改了/读了哪些文件（JSON 数组）。**不变式 5 的物理载体**。
      -- NULL = **不知道**（非 git 仓库、只读工具、快照失败），
      -- 与「空数组」（确认没改任何文件）是两回事——把"不知道"写成"没有"就是编造
      files_written TEXT,
      files_read    TEXT,
      -- 可能混入作者自己的改动。与 agent 共用工作目录时无法区分谁改的
      may_include_user_edits INTEGER CHECK (may_include_user_edits IN (0,1)),

      -- 退出码是**结构化字段，不是日志文本里的一行**。
      -- 冻结点八项之一：阶段 ④ 要回答「测试过没过」，它必须能直接读，
      -- 不能靠解析输出。NULL = 尚未结束或该类 Run 没有退出码概念
      exit_code     INTEGER,

      -- 成本。cost_visible 为 NULL 表示「尚未记录」，与「不可见」是两回事
      cost_visible           INTEGER CHECK (cost_visible IN (0,1)),
      cost_input_tokens      INTEGER,
      cost_output_tokens     INTEGER,
      cost_cache_read_tokens INTEGER,
      cost_total_usd         REAL,
      cost_invisible_reason  TEXT,

      -- 进行中不得有结束时间；已结束必须有。自相矛盾的记录在这里就被拒
      CHECK (
        (status = 'running'  AND finished_at IS NULL) OR
        (status <> 'running' AND finished_at IS NOT NULL)
      ),

      -- 「不可见」与「零」必须是两种东西（协议层 CostSchema 的同一条约束）。
      -- 不可见时不得有金额，可见时必须有——否则 UI 会把「拿不到」显示成「免费」
      CHECK (
        cost_visible IS NULL OR
        (cost_visible = 1 AND cost_total_usd IS NOT NULL AND cost_invisible_reason IS NULL) OR
        (cost_visible = 0 AND cost_total_usd IS NULL     AND cost_invisible_reason IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_runs_project  ON runs(project_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_session  ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status   ON runs(status);

    CREATE TABLE IF NOT EXISTS provenance (
      resource_id             TEXT PRIMARY KEY,
      producing_run_id        TEXT REFERENCES runs(id),
      environment_snapshot_id TEXT,
      source_path             TEXT,
      provenance_complete     INTEGER NOT NULL CHECK (provenance_complete IN (0,1)),
      incomplete_reason       TEXT,

      -- 溯源链不完整必须写明原因——不隐藏、不留白（规格 7.33）。
      -- 与协议层 ProvenanceLinkSchema 的 superRefine 是同一条规则，两处独立强制
      CHECK (provenance_complete = 1 OR incomplete_reason IS NOT NULL),
      CHECK (provenance_complete = 0 OR incomplete_reason IS NULL)
    );
  `)

  // 从 v1 升级：sessions 补 project_id。
  // **老数据的 project_id 留空**——它们产生时还没有项目概念，
  // 编一个归属等于伪造事实（不变式 5）。
  if (!hasColumn(db, "sessions", "project_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id)`)
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`)

  // 从 v2 升级：runs 补 exit_code。
  // **老数据留 NULL**——它们产生时没记退出码，补一个等于伪造事实（不变式 5）。
  // NULL 的含义是「不知道」，而「不知道」与「成功退出」必须是两种东西
  if (!hasColumn(db, "runs", "exit_code")) {
    db.exec(`ALTER TABLE runs ADD COLUMN exit_code INTEGER`)
  }

  // 从 v3 升级：runs 补文件事实三列。
  // **老数据留 NULL** —— 它们产生时没记，补一个空数组等于宣称"确认没改文件"
  if (!hasColumn(db, "runs", "files_written")) {
    db.exec(`ALTER TABLE runs ADD COLUMN files_written TEXT`)
    db.exec(`ALTER TABLE runs ADD COLUMN files_read TEXT`)
    db.exec(`ALTER TABLE runs ADD COLUMN may_include_user_edits INTEGER`)
  }

  /**
   * 从 v4 升级：sessions 补 `cli_thread_id`（①-C · C3/C4）。
   *
   * **codex 的会话续接凭据。** 它一轮一个进程，多轮全靠
   * `codex exec resume <thread_id>`——**丢了等于会话断了**，
   * 所以它是会话记录，不是内存状态。
   *
   * **老数据留 NULL**：它们产生时还没有这个概念，编一个等于伪造事实。
   * NULL 的含义是「这个会话没有可续接的线程」，claude 会话恒为 NULL（它用不上）。
   */
  if (!hasColumn(db, "sessions", "cli_thread_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN cli_thread_id TEXT`)
  }

  /**
   * 会话标题（2026-08-10）。
   *
   * 作者当天的话：*「我的会话，会话的 ID 怎么都是一个呢？我很难辨别具体是哪个会话了。」*
   * 侧栏此前只画 `agentId`——**同一个 agent 建出来的会话长得一模一样**。
   *
   * **老记录留 NULL，界面显示「新会话」**。编一个标题等于伪造事实：
   * 那些会话产生时没有这个概念，我们不知道它们讲的是什么。
   */
  if (!hasColumn(db, "sessions", "title")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT`)
  }

  /**
   * 会话的置顶与排序（2026-08-10）。
   *
   * 作者：*「要模仿一下 codex app 或者 claude app，就是可以置顶，
   * 可以挪动对话的顺序，可以重命名，可以删除。」*
   *
   * ## 为什么每一条都有显式的 `sort_order`
   *
   * 「手动排过的按手动来，没排过的按创建时间来」听着自然，实现起来是笔烂账：
   * 两种序混在一个列表里，**插入一条新的该放哪**没有确定答案，
   * 而人一旦挪过一次，剩下那些「还没排过的」会开始漂。
   *
   * 所以**建的时候就给一个位置**（比当前最大的再大一档，新的在最上面），
   * 之后只有人挪它才会变。列表永远是一种序，没有例外分支。
   *
   * `pinned` 只是分组，不是另一种序：置顶的和没置顶的**各自按 `sort_order` 排**。
   */
  if (!hasColumn(db, "sessions", "pinned")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`)
  }
  /**
   * **v9（2026-08-11）：项目分「你打开的」与「临时的」。**
   *
   * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
   *
   * 一个临时会话仍然要有工作区——agent 得在某处读写、跑命令，而且
   * **作者选的是「每个临时会话一个独立目录」**。所以它照旧是一条项目记录，
   * 只是打上标记：界面据此把它放在上面那一列（「会话」），
   * 而不是下面那一列（「项目」）。
   *
   * **不靠工作区路径前缀去猜**：那是推断，改一次目录名就全错了，
   * 而且没有任何迹象。显式一列，贵不了什么。
   */
  if (!hasColumn(db, "projects", "temporary")) {
    db.exec(`ALTER TABLE projects ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0`)
  }

  if (!hasColumn(db, "sessions", "sort_order")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN sort_order INTEGER`)
    /**
     * **老数据按创建时间回填**，而不是留 NULL。
     * 留 NULL 就等于把上面那笔烂账原样搬进来。
     */
    db.exec(`
      UPDATE sessions SET sort_order = (
        SELECT COUNT(*) FROM sessions AS s2 WHERE s2.created_at <= sessions.created_at
      ) WHERE sort_order IS NULL
    `)
  }

  /**
   * 环境快照（②-B · S17，2026-08-10）。
   *
   * `provenance.environment_snapshot_id` **早就有这一列，却没有它指向的表**——
   * 一个悬空的外键比没有更糟：它看起来是有出处的。
   *
   * ## 为什么主键是内容指纹
   *
   * 同一个环境反复开会话应当**指向同一行**。用自增 id 的话，一天下来
   * 躺着几十份逐字节相同的 JSON，而「这两次运行的环境一样吗」
   * 还得靠比对内容来回答——**而那正是主键该替我们回答的**。
   *
   * ## `payload` 入库即冻结
   *
   * 学自 Rho 的 admission snapshot：**不得回头探测当前库**。
   * 比对只解析这一列里那份不可变 JSON，永不重新去问解释器。
   * `captured_at` 只是「第一次见到这个环境是什么时候」，
   * **不参与指纹**（§3.6：摘要必须确定性且排除时间戳）。
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS environment_snapshots (
      id          TEXT PRIMARY KEY,
      language    TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      payload     TEXT NOT NULL
    );
  `)

  /**
   * 应用级设置（②-A 后续，2026-08-10）。
   *
   * 目前只装两样：**Python 与 R 的解释器路径**。
   *
   * ## 为什么不放 `providers.yaml`
   *
   * 那个文件是**用户手写的**，而且第一行就承诺「DAWN 不会覆盖它」。
   * 界面里改的东西写进一个我们承诺不碰的文件，是自相矛盾。
   *
   * ## 为什么不走凭证那条（safeStorage）
   *
   * **路径不是密钥。** 凭证那条有两条显示纪律（绝不回显、如实告知加密状态），
   * 而路径恰恰**必须回显**——看不见自己配了什么，等于没配。
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  /**
   * **v10（2026-08-11）：远端连接名单**（②-B · R3）。
   *
   * 作者要的形状：*「左边搞一个固定的『远端连接』，可以增加分组，
   * 分组里面是 ssh 的服务器，类似 XTerminal 的那种登陆效果。」*
   *
   * ## 这张表里**没有口令**，而且不能有
   *
   * 只有主机、端口、用户名、私钥路径、分组——那些不是秘密。
   * 口令与私钥 passphrase 进系统钥匙串（`ssh:<id>`），与模型 key 同一套。
   * **这是 `models.json` 那次的直接延伸**：明文落盘的密钥等于没有密钥。
   * `tests/store/no-secret-columns.test.ts` 盯着这一条——
   * 可判定的规则配扫描测试，不靠记性（准入规则 2）。
   *
   * ## 分组是一列字符串，不是一张表
   *
   * 它只是个标签。做成表就要处理「空分组」——而空分组不该存在：
   * 最后一台移走了，那个分组也就没有了，留着只是一排空壳。
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_connections (
      id               TEXT PRIMARY KEY,
      label            TEXT NOT NULL,
      group_name       TEXT,
      host             TEXT NOT NULL,
      port             INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
      username         TEXT NOT NULL,
      private_key_path TEXT,
      sort_order       INTEGER NOT NULL,
      created_at       TEXT NOT NULL
    );
  `)

  /**
   * **v11（2026-08-11）：会话可以长在一台远端服务器上**（②-B · R4′）。
   *
   * `remote_cwd` 是**此刻**的当前目录，随模型 `cd` 变。落库的理由不是持久化
   * （会话本来就活不过重启），而是**列表要显示它**：侧栏那一行的副行写的就是它。
   */
  if (!hasColumn(db, "sessions", "connection_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN connection_id TEXT`)
    db.exec(`ALTER TABLE sessions ADD COLUMN remote_cwd TEXT`)
  }

  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`).run(
    String(SCHEMA_VERSION),
  )

  if (from > 0 && from < SCHEMA_VERSION) {
    // 迁移是事实，应当可见。静默升级会让「为什么多了几张表」无从追溯
    console.error(`[store] schema 已从 v${from} 升级到 v${SCHEMA_VERSION}`)
  }
}
