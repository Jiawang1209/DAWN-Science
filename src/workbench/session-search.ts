/**
 * 会话全文搜索（2026-09-27，spec `2026-09-27-会话全文搜索-design.md`）。
 *
 * **不建索引，扫**（spec §5 / §6）：FTS5 搜不到两个字的中文词；写 spec 时量的 130 段 21 MB 冷读 172 ms、热搜 0.35 ms，
 * 500 段外推冷读 ≈ 0.7 s。索引是同一份对话的第二份拷贝——删会话、搬目录、续接追加每一处都得记得改它。
 * 这里只多一层**按文件认的缓存**：`path + mtimeMs + size` 没变就不重读。
 *
 * 读记录只走 `runtime/pi-record.ts`（只读）；还原成条目用与续接同一个 `还原成条目`——所以 `itemId` 就是点开后那一条的 id。
 */
import type { SessionRecord } from "../store/sessions.js"
import type { RestoredItem } from "../runtime/types.js"
import type { TranscriptItem } from "../protocol/events.js"
import type { ResponseOf } from "../protocol/operations.js"
import { 最新记录, 读记录, type 记录文件 } from "../runtime/pi-record.js"
import { 还原成条目 } from "./restored-items.js"
import { 取片段, 可搜小写, 命中小写, 拆词 } from "../protocol/search-match.js"

/** 缓存上限（字符）。缓存里每条存原条目与它的小写全文，所以实际内存约是这个数的两倍多（UTF-16）——40M ≈ 百来 MB 封顶 */
export const 缓存字符上限 = 40_000_000
/** 单个记录超过它就不读（计进 `tooLarge`）：写 spec 时实测最大 4.9 MB，32 MB 是「贴了几百张图」那种 */
export const 单文件上限字节 = 32 * 1024 * 1024
/** 单次搜索的时限：到点交回已经搜过的，`truncated: "time"` */
export const 单次时限毫秒 = 5_000
export const 每段最多处 = 3

type 结果 = ResponseOf<"searchSessionContent">
type 卡 = 结果["sessions"][number]

interface 缓存项 {
  文件: 记录文件
  条目: { item: TranscriptItem; 小: string; at?: number }[]
  字符: number
  用过: number
}

export interface 搜索依赖 {
  /** 库里全部会话（含归档的；删掉的本来就不在） */
  records: () => readonly SessionRecord[]
  /** agent 是哪一种。registry 里已经没有它 → undefined：照样看有没有 pi 记录，有就搜 */
  kindOf: (agentId: string) => string | undefined
  /** 卡上写的「在哪」。普通对话（临时项目）→ undefined */
  placeOf: (r: SessionRecord) => 卡["place"]
  /** 测试替身用 */
  读?: (path: string) => Promise<RestoredItem[]>
  now?: () => number
  单文件上限字节?: number
}

export class 会话全文搜索 {
  private readonly 缓存 = new Map<string, 缓存项>()
  private 总字符 = 0
  private 钟 = 0

  constructor(private readonly deps: 搜索依赖) {}

  get 已缓存段数(): number {
    return this.缓存.size
  }

  async 搜(query: string, limit: number): Promise<结果> {
    const now = this.deps.now ?? Date.now
    const 起 = now()
    const 词们 = 拆词(query)
    /** **先搜新建的**：到了时限被截掉的是最老的那些（「上个月」比「去年」更可能是人要找的） */
    const 全部 = [...this.deps.records()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const 在 = new Set(全部.map((r) => r.id))
    for (const id of [...this.缓存.keys()]) if (!在.has(id)) this.扔(id)

    let scanned = 0
    let notSearchable = 0
    let unreadable = 0
    let tooLarge = 0
    let truncated: 结果["truncated"]
    const 卡们: 卡[] = []

    for (const r of 全部) {
      if (now() - 起 > 单次时限毫秒) {
        truncated = "time"
        break
      }
      const kind = this.deps.kindOf(r.agentId)
      if (kind !== undefined && kind !== "native") {
        notSearchable++
        continue
      }
      // 与续接读同一个文件（按工作目录过滤，见 `最新记录`）——搜到的 itemId / nth 才落在点开后的那份转录里
      const 文件 = await 最新记录(r.sessionDir, r.workspace)
      // 还没有一轮说完（pi 等第一条 assistant 才落盘）：没东西可搜，不是「读不了」
      if (!文件) continue
      if (文件.size > (this.deps.单文件上限字节 ?? 单文件上限字节)) {
        tooLarge++
        continue
      }
      let 项: 缓存项
      try {
        项 = await this.取(r.id, 文件)
      } catch {
        unreadable++
        continue
      }
      scanned++

      const 中: { x: 缓存项["条目"][number]; nth: number }[] = []
      for (const x of 项.条目) if (命中小写(x.小, 词们)) 中.push({ x, nth: 中.length })
      if (中.length === 0) continue

      const 最新毫秒 = Math.max(0, ...中.map((m) => m.x.at ?? 0))
      const place = this.deps.placeOf(r)
      卡们.push({
        sessionId: r.id,
        ...(r.projectId ? { projectId: r.projectId } : {}),
        ...(r.title ? { title: r.title } : {}),
        ...(place ? { place } : {}),
        archived: r.archivedAt !== undefined,
        lastAt: new Date(最新毫秒 > 0 ? 最新毫秒 : 文件.mtimeMs).toISOString(),
        hits: 中.slice(0, 每段最多处).flatMap(({ x, nth }) => {
          const 片 = 取片段(x.item, 词们)
          if (!片) return []
          return [
            {
              itemId: x.item.id,
              nth,
              where: 片.where,
              ...(x.item.type === "tool" ? { toolName: x.item.name } : {}),
              snippet: 片.text,
              marks: 片.marks,
              ...(x.at ? { at: new Date(x.at).toISOString() } : {}),
            },
          ]
        }),
        moreHits: Math.max(0, 中.length - 每段最多处),
      })
    }

    卡们.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    if (卡们.length > limit) truncated ??= "sessions"
    return {
      sessions: 卡们.slice(0, limit),
      matchedSessions: 卡们.length,
      total: 全部.length,
      scanned,
      notSearchable,
      unreadable,
      tooLarge,
      ...(truncated ? { truncated } : {}),
      elapsedMs: Math.max(0, Math.round(now() - 起)),
    }
  }

  private async 取(id: string, 文件: 记录文件): Promise<缓存项> {
    const 有 = this.缓存.get(id)
    if (有 && 有.文件.path === 文件.path && 有.文件.mtimeMs === 文件.mtimeMs && 有.文件.size === 文件.size) {
      有.用过 = ++this.钟
      return 有
    }
    const 还原 = await (this.deps.读 ?? 读记录)(文件.path)
    const 条目 = 还原.map((x, i) => {
      const item = 还原成条目(x, i)
      // 压缩标记：`可搜小写` 给 undefined（摘要是模型写的，不是这段对话里说过的话）——存成空串，永远不中；它也没有时刻
      const at = x.kind === "compaction" ? undefined : x.at
      return { item, 小: 可搜小写(item) ?? "", ...(at ? { at } : {}) }
    })
    const 项: 缓存项 = { 文件, 条目, 字符: 条目.reduce((n, x) => n + x.小.length, 0), 用过: ++this.钟 }
    this.扔(id)
    this.缓存.set(id, 项)
    this.总字符 += 项.字符
    this.收缩(id)
    return 项
  }

  private 扔(id: string): void {
    const 有 = this.缓存.get(id)
    if (!有) return
    this.总字符 -= 有.字符
    this.缓存.delete(id)
  }

  /** 超了上限按最久没用的先扔（刚读的那段不扔）。扔掉的下次重读——慢一点，结果不变 */
  private 收缩(留: string): void {
    while (this.总字符 > 缓存字符上限) {
      let 最旧: string | undefined
      let 值 = Number.POSITIVE_INFINITY
      for (const [k, v] of this.缓存) {
        if (k !== 留 && v.用过 < 值) {
          值 = v.用过
          最旧 = k
        }
      }
      if (!最旧) return
      this.扔(最旧)
    }
  }
}
