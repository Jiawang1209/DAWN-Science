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

export const SCHEMA_VERSION = 2

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

  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`).run(
    String(SCHEMA_VERSION),
  )

  if (from > 0 && from < SCHEMA_VERSION) {
    // 迁移是事实，应当可见。静默升级会让「为什么多了几张表」无从追溯
    console.error(`[store] schema 已从 v${from} 升级到 v${SCHEMA_VERSION}`)
  }
}
