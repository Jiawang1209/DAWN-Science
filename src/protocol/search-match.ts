/**
 * 会话全文搜索的匹配规则（2026-09-27，spec `2026-09-27-会话全文搜索-design.md` §5）。
 *
 * **后端找、界面跳，用的是这一份。** 两边各写一份的话，后端说「第 3 处」、界面数出来是第 2 处，
 * 点了就跳到别处去——而那种错不报错，只是「跳歪了」。
 *
 * 规则：
 * - 词按空白切开（最多 8 个），**同一条里都要出现**（与的关系）；大小写不敏感；
 * - **中文不分词，子串就是命中**：FTS5 的 unicode61 把一串汉字当一个词、trigram 要三个字起（spec §5 的实测），
 *   而最常搜的正是两个字的中文词；
 * - 一条 = 一句你说的 / 一段 agent 的回复 / 一次工具调用（名字 + 参数 + 输出算一条）/ 一张方案卡（标题 + 正文，2026-09-28）；
 * - **全角与半角算同一个字**：查询与正文都先过 NFKC（「ＣＯＸ」＝「cox」）。spec 与计划没提这条，2026-09-27 按
 *   「中文输入法里打出全角字母很常见，搜不到又不报错」定下；片段显示的也是 NFKC 之后的字，这样标记的位置才对得上。
 */
import type { TranscriptItem } from "./events.js"

export const 最多词数 = 8
/** 一个字（「的」「R」）几乎段段命中，列出来没有信息 */
export const 最短查询 = 2
export const 片段字数 = 120
/** 片段从最早那个词往前留多少字——让人看得出是在说什么 */
const 前留字数 = 40

export type 命中处 = "user" | "agent" | "toolInput" | "toolResult"

/** NFKC + 小写：查询与正文都走这一个，免得两边规整得不一样 */
function 规整小写(s: string): string {
  return s.normalize("NFKC").toLowerCase()
}

/** 不把 emoji 这类代理对切成半个：落在低位代理上就往前挪一格 */
function 退到字首(s: string, i: number): number {
  const c = s.charCodeAt(i)
  return i > 0 && i < s.length && c >= 0xdc00 && c <= 0xdfff ? i - 1 : i
}

export function 拆词(query: string): string[] {
  const 词们 = 规整小写(query).trim().split(/\s+/).filter(Boolean)
  return [...new Set(词们)].slice(0, 最多词数)
}

/**
 * 够不够「两个字」（2026-09-28 审查补）：按拆出来的词**连起来的字数**（码点，不是 UTF-16 单元）数。
 * 协议的请求校验与界面「至少两个字」都调它——一个生僻字 / emoji 占两个 UTF-16 单元，按 `.length` 数会把一个字放过去。
 */
export function 够长(query: string): boolean {
  return [...拆词(query).join("")].length >= 最短查询
}

/** 工具参数 → 一段人读得懂的字：对象取它的字符串字段（code / command / path…），别的 JSON 化 */
export function 参数文本(input: unknown): string {
  if (input === undefined || input === null) return ""
  if (typeof input === "string") return input
  if (typeof input === "object" && !Array.isArray(input)) {
    const 串 = Object.values(input as Record<string, unknown>).filter((v): v is string => typeof v === "string")
    if (串.length > 0) return 串.join("\n")
  }
  try {
    return JSON.stringify(input) ?? ""
  } catch {
    return ""
  }
}

interface 段 {
  where: 命中处
  text: string
}

/** 一条里能搜的几段。**只有说的话、工具调用与方案卡**——notice、内核输出、子 agent 那几种不参与 */
function 可搜段(x: TranscriptItem): 段[] | undefined {
  if (x.type === "turn") return [{ where: x.who, text: x.text }]
  // 方案卡（2026-09-28）：标题 + 正文，算 agent 说的（方案是它交的）。续接与搜索都把那次 `propose_plan` 换成它（`换上方案卡`），
  // 活会话里它也是一张卡——三边数的是同一条
  if (x.type === "question") return [
    { where: "toolInput", text: `ask_user_question\n${JSON.stringify(x.questions)}` },
    ...(x.answer ? [{ where: "toolResult" as const, text: JSON.stringify(x.answer) }] : []),
  ]
  if (x.type === "plan") return [{ where: "agent", text: `${x.title}\n${x.markdown}` }]
  if (x.type === "tool") {
    return [
      { where: "toolInput", text: `${x.name}\n${参数文本(x.input)}` },
      ...(x.result ? [{ where: "toolResult" as const, text: x.result }] : []),
    ]
  }
  return undefined
}

/** 这一条的小写全文（后端缓存它，省得每次搜都重新小写一遍）。不参与的 → undefined */
export function 可搜小写(x: TranscriptItem): string | undefined {
  const 段们 = 可搜段(x)
  return 段们 ? 段们.map((d) => 规整小写(d.text)).join("\n") : undefined
}

/** 词们都在这段小写全文里。**词里没有空白**（按空白切的），所以段与段之间那个 `\n` 不会让词跨段 */
export function 命中小写(小: string | undefined, 词们: readonly string[]): boolean {
  return 小 !== undefined && 词们.length > 0 && 词们.every((w) => 小.includes(w))
}

export function 命中(x: TranscriptItem, 词们: readonly string[]): boolean {
  return 命中小写(可搜小写(x), 词们)
}

export interface 片段 {
  where: 命中处
  text: string
  /** `text` 里要标出来的 [起, 止)，按起点排、重叠的并起来 */
  marks: [number, number][]
}

/**
 * 从最早出现任一词的那一段、那一处起取一截。空白压成一个空格。
 * `toLowerCase` 改了长度的极少数字符（土耳其语的 İ）出现时不标——免得标歪；命中照算。
 */
export function 取片段(x: TranscriptItem, 词们: readonly string[], 字数 = 片段字数): 片段 | undefined {
  const 段们 = 可搜段(x)
  if (!段们 || 词们.length === 0) return undefined
  for (const d of 段们) {
    const 规整 = d.text.normalize("NFKC").replace(/\s+/g, " ").trim()
    const 小 = 规整.toLowerCase()
    const 位 = Math.min(
      ...词们.map((w) => {
        const i = 小.indexOf(w)
        return i < 0 ? Number.POSITIVE_INFINITY : i
      }),
    )
    if (!Number.isFinite(位)) continue
    const 前 = 退到字首(规整, Math.max(0, 位 - 前留字数))
    const 后 = 退到字首(规整, Math.min(规整.length, 前 + 字数))
    const 头 = 前 > 0 ? "…" : ""
    const 尾 = 后 < 规整.length ? "…" : ""
    const marks: [number, number][] = []
    if (小.length === 规整.length) {
      for (const w of 词们) {
        for (let i = 小.indexOf(w, 前); i >= 0 && i + w.length <= 后; i = 小.indexOf(w, i + w.length)) {
          marks.push([i - 前 + 头.length, i - 前 + 头.length + w.length])
        }
      }
    }
    marks.sort((a, b) => a[0] - b[0])
    const 并: [number, number][] = []
    for (const m of marks) {
      const 末 = 并.at(-1)
      if (末 && m[0] <= 末[1]) 末[1] = Math.max(末[1], m[1])
      else 并.push([m[0], m[1]])
    }
    return { where: d.where, text: 头 + 规整.slice(前, 后) + 尾, marks: 并 }
  }
  return undefined
}

/** 界面要跳到的那一处（App 在点结果时造它；`起` 既是这一次的身份，也是「等多久算找不到」的起点） */
export interface 跳转目标 {
  sessionId: string
  itemId: string
  nth: number
  词们: string[]
  起: number
}

/**
 * 在手上的转录里找那一条（spec §7）。
 * 1. 先按 id：旧对话点开时由 `还原成条目` 恢复，id 与搜索那一侧同一套；那条也确实命中才算。
 * 2. 再按 nth：这次运行里早就活着的对话，转录是实时事件长出来的，id 不同——按同一个规则数到第 nth 处。
 */
export function 定位命中(
  items: readonly TranscriptItem[],
  目标: Pick<跳转目标, "itemId" | "nth" | "词们">,
): string | undefined {
  const 按id = items.find((x) => x.id === 目标.itemId)
  if (按id && 命中(按id, 目标.词们)) return 按id.id
  let 第 = 0
  for (const x of items) {
    if (!命中(x, 目标.词们)) continue
    if (第 === 目标.nth) return x.id
    第++
  }
  return undefined
}
