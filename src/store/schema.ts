/**
 * SQLite 表结构与迁移（Task 1.3）。
 *
 * 选 SQLite 而非 JSONL：pi-crew 为 JSONL 付出了跨进程锁、手写轮转、流式读、
 * 增量读器、序列号缓存、以及用 worker 线程绕开一个疑似 event-loop 竞态共六项工程代价，
 * 而本项目自带 Electron 运行时、可以携带需编译的原生依赖，用 WAL 后这六项全部不存在。
 * 见规格 7.32。
 */
import type Database from "better-sqlite3"

export const SCHEMA_VERSION = 1

export function migrate(db: Database.Database): void {
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
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
      -- CHECK 约束是第二道防线。应用层的 TypeScript 联合类型只在编译期有效，
      -- 挡不住直接写库的迁移脚本或将来的其它写入方。
      state       TEXT NOT NULL CHECK (state IN ('starting','alive','exited')),
      pid         INTEGER,
      exit_code   INTEGER,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
  `)
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`)
    .run(String(SCHEMA_VERSION))
}
