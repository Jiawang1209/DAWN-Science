/**
 * 应用级设置的读写（②-A 后续，2026-08-10）。
 *
 * 目前只有两个键：Python 与 R 的解释器路径。
 *
 * ## 这两个路径是**机制**，不是提示
 *
 * 作者 2026-08-10：*「我不是要求你扫描整个电脑，而是直接提供一个 R 解释器
 * 和 Python 解释器的路径即可。**只有配置了，我们才能调用** R 或者 Python。」*
 *
 * 所以它们不是「扫描结果的一个补充」——**没配就是不能用**，
 * 而界面要明说「还没配」，不是悄悄退回某个猜出来的默认。
 * 猜一个的后果不是跑不起来，是**跑在了另一个环境里而不自知**。
 */
import type Database from "better-sqlite3"

/** 认得的设置键。**闭集**——写进一个拼错的键等于静默丢配置 */
export type SettingKey = "interpreter.python" | "interpreter.r"

export class SettingsStore {
  constructor(private readonly db: Database.Database) {}

  /** 读一个。**没配就是 `undefined`**，不给空串——空串会被读成「配了一个空路径」 */
  get(key: SettingKey): string | undefined {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    const v = row?.value?.trim()
    return v ? v : undefined
  }

  /**
   * 写一个。**传空串等于清除**——那是「我不想配了」，
   * 与「配了一个空路径」是两回事，后者根本不该存在。
   */
  set(key: SettingKey, value: string, now: string): void {
    const v = value.trim()
    if (!v) {
      this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(key)
      return
    }
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, v, now)
  }

  /** 两个解释器路径。**没配的那个不给字段**，而不是给空串 */
  interpreters(): { python?: string; r?: string } {
    const python = this.get("interpreter.python")
    const r = this.get("interpreter.r")
    return { ...(python ? { python } : {}), ...(r ? { r } : {}) }
  }
}
