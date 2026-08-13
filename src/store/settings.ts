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
export type SettingKey =
  | "interpreter.python"
  | "interpreter.r"
  /**
   * 工具权限档位（2026-08-13）。取值见 `policy/permissions.ts` 的 `权限档`。
   *
   * **默认（没配）= `allow-all`**，也就是今天的行为。默认改成拦截会让
   * 一个正在干活的人**在毫无预兆的情况下开始撞墙**，而这一版还没有
   * 「问一句、你点允许」那条路——撞了也没法放行。
   * 等询问那条通了，默认再往紧里调。
   */
  | "permission.mode"
  /**
   * **App 的默认工作目录**（2026-08-12，作者要的）。
   *
   * 作者：*「设置里面，其实要增加一个就是 App 默认设置的工作目录，
   * 也就是初始化的目录，windows 的话就默认设置在桌面，
   * mac 默认家目录下设置一个 `DAWN` 的目录就行。」*
   *
   * 两处用它：**没给工作目录的那些对话落在这儿**（此前落在应用数据目录里，
   * 那是个用户永远找不到的地方），以及**选文件夹时从这儿起步**。
   */
  | "workspace.default"

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
