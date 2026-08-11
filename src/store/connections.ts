/**
 * 远端连接名单的读写（②-B · R3）。
 *
 * 作者要的形状：*「左边搞一个固定的『远端连接』，可以增加分组，
 * 分组里面是 ssh 的服务器，类似 XTerminal 的那种登陆效果。」*
 *
 * ## 这里**没有口令**
 *
 * 只有主机、端口、用户名、私钥路径、分组——那些不是秘密，而且**必须回显**：
 * 看不见自己配了什么等于没配（与两个解释器路径同一条理由）。
 * 口令与私钥 passphrase 进系统钥匙串，由 `CredentialsPort` 管，键是 `ssh:<id>`。
 *
 * 这条不是洁癖：**`models.json` 那次就是把 key 写进了明文文件**。
 * `tests/store/no-secret-columns.test.ts` 现在盯着它。
 *
 * ## 状态不在这里
 *
 * 「连着没有」是**此刻**的事实，不是配置。写进库里的话，
 * 应用崩一次，下次打开就会看到一台「连着」的服务器——而它并没有连着。
 * 状态归 `src/remote/connections.ts` 的管理器，进程内，随进程消失。
 */
import type Database from "better-sqlite3"

export interface ConnectionRecord {
  id: string
  label: string
  /** **缺省 = 没分组**，不是一个叫「未分组」的分组 */
  group?: string
  host: string
  port: number
  username: string
  privateKeyPath?: string
  sortOrder: number
  createdAt: string
}

interface Row {
  id: string
  label: string
  group_name: string | null
  host: string
  port: number
  username: string
  private_key_path: string | null
  sort_order: number
  created_at: string
}

const toRecord = (r: Row): ConnectionRecord => ({
  id: r.id,
  label: r.label,
  // **只在真有值时给这个字段**：null 与空串都读作「没分组」
  ...(r.group_name ? { group: r.group_name } : {}),
  host: r.host,
  port: r.port,
  username: r.username,
  ...(r.private_key_path ? { privateKeyPath: r.private_key_path } : {}),
  sortOrder: r.sort_order,
  createdAt: r.created_at,
})

export class ConnectionStore {
  constructor(private readonly db: Database.Database) {}

  /** 全部，**按分组再按次序**——同一分组的挨在一起，界面才不用自己重排 */
  list(): ConnectionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM remote_connections
         ORDER BY (group_name IS NULL) DESC, group_name ASC, sort_order ASC`,
      )
      .all() as Row[]
    return rows.map(toRecord)
  }

  get(id: string): ConnectionRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM remote_connections WHERE id = ?`).get(id) as
      | Row
      | undefined
    return row ? toRecord(row) : undefined
  }

  insert(rec: ConnectionRecord): void {
    this.db
      .prepare(
        `INSERT INTO remote_connections
           (id, label, group_name, host, port, username, private_key_path, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.id,
        rec.label,
        rec.group ?? null,
        rec.host,
        rec.port,
        rec.username,
        rec.privateKeyPath ?? null,
        rec.sortOrder,
        rec.createdAt,
      )
  }

  /**
   * 覆盖式更新。**改完之后那条记录就是传进来的样子**——
   * 「不传的字段保持原样」那种半更新语义，会让「清掉私钥路径」无从表达。
   */
  update(rec: ConnectionRecord): void {
    const r = this.db
      .prepare(
        `UPDATE remote_connections
            SET label = ?, group_name = ?, host = ?, port = ?, username = ?,
                private_key_path = ?, sort_order = ?
          WHERE id = ?`,
      )
      .run(
        rec.label,
        rec.group ?? null,
        rec.host,
        rec.port,
        rec.username,
        rec.privateKeyPath ?? null,
        rec.sortOrder,
        rec.id,
      )
    // **改不到就出声**：静默的 0 行更新会让界面显示「已保存」，而库里什么都没变
    if (r.changes === 0) throw new Error(`没有这台服务器：${rec.id}`)
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM remote_connections WHERE id = ?`).run(id)
  }

  /** 下一个排序号。**同分组内接着排** */
  nextSortOrder(group: string | undefined): number {
    const row = this.db
      .prepare(
        `SELECT MAX(sort_order) AS m FROM remote_connections
          WHERE (group_name IS ?) OR (group_name = ?)`,
      )
      .get(group ?? null, group ?? "") as { m: number | null }
    return (row.m ?? 0) + 1
  }
}
