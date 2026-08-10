/**
 * 环境快照的存储（②-B · S17）。
 *
 * **内容寻址**：主键就是快照的 SHA-256 指纹，所以同一个环境反复开会话
 * 只会有一行。「这两次运行的环境一样吗」因此退化成一次 id 比对，
 * 而不是一次内容比对。
 *
 * **只写一次。** 已经存在的 id 直接跳过——快照是证据，
 * 覆盖一份已入库的证据没有任何正当理由。
 */
import type Database from "better-sqlite3"
import { fingerprintOf, type EnvironmentSnapshot } from "../kernel/environment.js"

export interface StoredEnvironment extends EnvironmentSnapshot {
  id: string
  /** 第一次见到这个环境是什么时候。**不参与指纹** */
  capturedAt: string
}

export class EnvironmentStore {
  constructor(private readonly db: Database.Database) {}

  /**
   * 存一份快照，返回它的 id。
   *
   * 已存在就**原样返回旧的**——包括旧的 `captured_at`。
   * 把它刷新成「现在」等于说「这个环境是刚刚才有的」，那是假话。
   */
  put(snap: EnvironmentSnapshot, capturedAt: string): string {
    const id = fingerprintOf(snap)
    this.db
      .prepare(
        `INSERT OR IGNORE INTO environment_snapshots (id, language, captured_at, payload)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, snap.language, capturedAt, JSON.stringify(snap))
    return id
  }

  /** 取一份。**没有就是 undefined**——不造一个空快照顶上 */
  get(id: string): StoredEnvironment | undefined {
    const row = this.db
      .prepare(`SELECT * FROM environment_snapshots WHERE id = ?`)
      .get(id) as { id: string; language: string; captured_at: string; payload: string } | undefined
    if (!row) return undefined
    let parsed: EnvironmentSnapshot
    try {
      parsed = JSON.parse(row.payload) as EnvironmentSnapshot
    } catch {
      // 库里那一行坏了。**返回 undefined 而不是抛**——
      // 界面会说「取不到」，而不是整个面板炸掉
      return undefined
    }
    return { ...parsed, id: row.id, capturedAt: row.captured_at }
  }

  /** 有多少个不同的环境。去重效果靠它看得见 */
  count(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM environment_snapshots`).get() as { n: number }).n
  }
}
