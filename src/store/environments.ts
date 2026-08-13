/**
 * 环境快照的存储（②-B · S17；R5 起装两种，2026-08-13）。
 *
 * **内容寻址**：主键就是快照的 SHA-256 指纹，所以同一个环境反复开会话
 * 只会有一行。「这两次运行的环境一样吗」因此退化成一次 id 比对，
 * 而不是一次内容比对。
 *
 * **只写一次。** 已经存在的 id 直接跳过——快照是证据，
 * 覆盖一份已入库的证据没有任何正当理由。
 *
 * ## 一张表装两种，靠 `kind` 分
 *
 * 内核快照（这个解释器里有什么）与 shell 快照（这台机器是什么）
 * **不可比**（计划 §3.4）。它们仍然共用这张表，因为：
 * Run 只认一个 `environment_snapshot_id`，内容寻址与「只写一次」
 * 两条纪律对两种都成立；**分成两张表反而要在 Run 上多一个「去哪张表找」的字段**，
 * 那是把判别子从数据里挪到了接线里。
 *
 * 「不可比」由 `compareEnvironments` 保证，不由存储分家保证。
 */
import type Database from "better-sqlite3"
import { fingerprintOf, type EnvironmentSnapshot } from "../kernel/environment.js"
import { shellFingerprint, type ShellEnvironment } from "../env/snapshot.js"

/** 库里的一份快照。**`kind` 决定 `payload` 是哪一种** */
export type StoredEnvironment =
  | ({ id: string; kind: "kernel"; capturedAt: string } & EnvironmentSnapshot)
  | ({ id: string; kind: "shell"; capturedAt: string } & ShellEnvironment)

export class EnvironmentStore {
  constructor(private readonly db: Database.Database) {}

  /**
   * 存一份内核快照，返回它的 id。
   *
   * 已存在就**原样返回旧的**——包括旧的 `captured_at`。
   * 把它刷新成「现在」等于说「这个环境是刚刚才有的」，那是假话。
   */
  put(snap: EnvironmentSnapshot, capturedAt: string): string {
    const id = fingerprintOf(snap)
    this.db
      .prepare(
        `INSERT OR IGNORE INTO environment_snapshots (id, kind, language, captured_at, payload)
         VALUES (?, 'kernel', ?, ?, ?)`,
      )
      .run(id, snap.language, capturedAt, JSON.stringify(snap))
    return id
  }

  /**
   * 存一份 shell 快照（R5）。
   *
   * **`language` 写 NULL，不写空串**：一台机器不是 Python 也不是 R，
   * 而空串会变成第三种状态——「设了一个空语言」，没人想要那个。
   */
  putShell(snap: ShellEnvironment, capturedAt: string): string {
    const id = shellFingerprint(snap)
    this.db
      .prepare(
        `INSERT OR IGNORE INTO environment_snapshots (id, kind, language, captured_at, payload)
         VALUES (?, 'shell', NULL, ?, ?)`,
      )
      .run(id, capturedAt, JSON.stringify(snap))
    return id
  }

  /** 取一份。**没有就是 undefined**——不造一个空快照顶上 */
  get(id: string): StoredEnvironment | undefined {
    const row = this.db
      .prepare(`SELECT * FROM environment_snapshots WHERE id = ?`)
      .get(id) as
      | { id: string; kind: string | null; captured_at: string; payload: string }
      | undefined
    if (!row) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(row.payload)
    } catch {
      // 库里那一行坏了。**返回 undefined 而不是抛**——
      // 界面会说「取不到」，而不是整个面板炸掉
      return undefined
    }
    /**
     * **`kind` 缺失读作 `kernel`**：R5 之前这张表里只可能有内核快照，
     * 迁移也是照这条把老行补上的。这个默认值是可证的，不是猜的
     * ——与 `compareEnvironments` 里那条必须一致。
     */
    const kind = row.kind ?? "kernel"
    if (kind === "shell") {
      return { ...(parsed as ShellEnvironment), kind: "shell", id: row.id, capturedAt: row.captured_at }
    }
    return { ...(parsed as EnvironmentSnapshot), kind: "kernel", id: row.id, capturedAt: row.captured_at }
  }

  /** 有多少个不同的环境。去重效果靠它看得见 */
  count(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM environment_snapshots`).get() as { n: number }).n
  }
}
