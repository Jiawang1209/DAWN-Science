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
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { 最新记录, 读记录, pi记录目录, type 记录文件 } from "../runtime/pi-record.js"
import { 方案簿文件名 } from "../runtime/plan-book.js"
import { 还原成条目 } from "./restored-items.js"
import { 取片段, 可搜小写, 命中小写, 拆词 } from "../protocol/search-match.js"

/** 缓存上限（字符）。缓存里每条存原条目与它的小写全文，所以实际内存约是这个数的两倍多（UTF-16）——40M ≈ 百来 MB 封顶 */
export const 缓存字符上限 = 40_000_000
/**
 * 单个记录超过它就不读（计进 `tooLarge`）：写 spec 时实测最大 4.9 MB，16 MB 是「贴了几百张图」那种。
 * 解析在主进程上同步跑，一个文件是一整段不让出的时间——32 MB 冷读能卡 ~300 ms，16 MB 把它压到一半左右（2026-09-28 审查）
 */
export const 单文件上限字节 = 16 * 1024 * 1024
/** 单次搜索的时限：到点交回已经搜过的，`truncated: "time"` */
export const 单次时限毫秒 = 5_000
export const 每段最多处 = 3

type 结果 = ResponseOf<"searchSessionContent">
type 卡 = 结果["sessions"][number]

interface 缓存项 {
  文件: 记录文件
  /** 方案簿（`plans.json`）的 mtime：批准 / 改正文 / 回退摘版都只改它、不改 pi 记录——不看它的话缓存会一直给旧的卡片（2026-09-28）。没有簿 = 0 */
  簿: number
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
  读?: (path: string, sessionDir?: string) => Promise<RestoredItem[]>
  now?: () => number
  单文件上限字节?: number
}

export class 会话全文搜索 {
  private readonly 缓存 = new Map<string, 缓存项>()
  private 总字符 = 0
  private 钟 = 0
  /** 第几次搜索。新的一次开始后，旧的在下一个文件边界停下（界面本来就丢过期的回复，不必读完） */
  private 代 = 0

  constructor(private readonly deps: 搜索依赖) {}

  get 已缓存段数(): number {
    return this.缓存.size
  }

  async 搜(query: string, limit: number): Promise<结果> {
    const now = this.deps.now ?? Date.now
    const 起 = now()
    const 我 = ++this.代
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

    let 第 = 0
    for (const r of 全部) {
      // 文件之间让一口气：解析是同步的，不让的话一次搜索从头到尾占着主进程的事件循环
      if (第++ > 0) await new Promise<void>((res) => setImmediate(res))
      // 被新的一次搜索取代：停下，交回已经搜过的。协议里没有「被取代」这一档，借 `time`（同样是「没搜完就停了」）；
      // 这份回复界面会当过期的丢掉，不会被人看到
      if (this.代 !== 我 || now() - 起 > 单次时限毫秒) {
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
      if (!文件) {
        this.扔(r.id)
        // 还没有一轮说完（pi 等第一条 assistant 才落盘）：没东西可搜，不是「读不了」。
        // 但目录里明明有记录、只是没有一份对得上这段的工作目录——那是搜不到的一段，要说出来
        if (await 有非空记录(r.sessionDir)) unreadable++
        continue
      }
      if (文件.size > (this.deps.单文件上限字节 ?? 单文件上限字节)) {
        this.扔(r.id)
        tooLarge++
        continue
      }
      let 项: 缓存项
      try {
        项 = await this.取(r.id, 文件, r.sessionDir)
      } catch {
        this.扔(r.id)
        unreadable++
        continue
      }
      scanned++

      const 中: { x: 缓存项["条目"][number]; nth: number }[] = []
      for (const x of 项.条目) if (命中小写(x.小, 词们)) 中.push({ x, nth: 中.length })
      if (中.length === 0) continue

      // 不用 `Math.max(...中.map())`：一段里命中几十万处时展开参数会爆栈
      const 最新毫秒 = 中.reduce((n, m) => Math.max(n, m.x.at ?? 0), 0)
      const place = this.deps.placeOf(r)
      卡们.push({
        sessionId: r.id,
        ...(r.projectId ? { projectId: r.projectId } : {}),
        ...(r.title ? { title: r.title } : {}),
        ...(place ? { place } : {}),
        archived: r.archivedAt !== undefined,
        lastAt: new Date(最新毫秒 > 0 ? 最新毫秒 : 文件.mtimeMs).toISOString(),
        // 列**最新的**几处（转录顺序）：与卡上的时刻（最新那处）一致
        hits: 中.slice(-每段最多处).flatMap(({ x, nth }) => {
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

  private async 取(id: string, 文件: 记录文件, sessionDir: string): Promise<缓存项> {
    const 有 = this.缓存.get(id)
    const 簿 = await stat(join(sessionDir, 方案簿文件名)).then(
      (s) => s.mtimeMs,
      () => 0,
    )
    if (有 && 有.文件.path === 文件.path && 有.文件.mtimeMs === 文件.mtimeMs && 有.文件.size === 文件.size && 有.簿 === 簿) {
      有.用过 = ++this.钟
      return 有
    }
    // 带上会话目录：簿里有的 `propose_plan` 换成方案卡（与续接同一个换法，见 `读记录`）
    const 还原 = await (this.deps.读 ?? 读记录)(文件.path, sessionDir)
    const 条目 = 还原.map((x, i) => {
      const item = 还原成条目(x, i)
      // 压缩标记：`可搜小写` 给 undefined（摘要是模型写的，不是这段对话里说过的话）——存成空串，永远不中；它也没有时刻
      const at = x.kind === "compaction" || x.kind === "plan" ? undefined : x.at
      return { item, 小: 可搜小写(item) ?? "", ...(at ? { at } : {}) }
    })
    const 项: 缓存项 = { 文件, 簿, 条目, 字符: 条目.reduce((n, x) => n + x.小.length, 0), 用过: ++this.钟 }
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

/** 目录里有没有不是空的 `.jsonl`（空文件是 pi 还没写头，不算「有记录」） */
async function 有非空记录(sessionDir: string): Promise<boolean> {
  const dir = pi记录目录(sessionDir)
  let 名们: string[]
  try {
    名们 = (await readdir(dir)).filter((n) => n.endsWith(".jsonl"))
  } catch {
    return false
  }
  for (const n of 名们) {
    try {
      if ((await stat(join(dir, n))).size > 0) return true
    } catch {
      // 列目录与 stat 之间被删了：当它不在
    }
  }
  return false
}
