import { ASK_USER_QUESTION, QuestionsSchema, validateQuestionAnswer } from "../protocol/questions.js"
/**
 * pi 的会话记录 → 界面认识的历史条目（会话续接 2026-08-11；2026-09-27 从 `native.ts` 搬出来）。
 *
 * **两处共用**：主对话续接（`native.ts` 的 `history()`）、子 agent 的会话文件读回（`subagent/run-dir.ts`）。
 * 抄一份就是第二个家——两份翻法迟早各自漂。
 *
 * 取舍见 `native.ts` 的 `history()` 文件注释：thinking 不还原、工具调用还原成「已完成」、压缩条目还原成一条压缩标记。
 *
 * **第三个读者**（2026-09-27，会话全文搜索）：搜索在**不起运行时**时读旧对话（`pi-record.ts`），
 * 它数出来的第几条必须与点进去之后转录里的第几条是同一个数——否则「跳到那一处」跳到的是别处。
 * 所以三处都调 `还原历史`，由结构保证一致，而不是由几份相似的代码碰巧一致。
 */
import type { RestoredItem } from "./types.js"
import { 出方案工具名, type 方案 } from "../protocol/plan.js"

/** pi 记下的一条消息。**只声明我们真的读的那几个字段** */
export type 历史消息 =
  | { role: "user"; content: string | { type: string; text?: string }[]; timestamp?: number }
  | {
      role: "assistant"
      content: ({ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: unknown } | { type: "thinking" })[]
      timestamp?: number
    }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: { type: string; text?: string }[]; timestamp?: number }
  /** 不是 pi 的消息：`getBranch()` 里的 `compaction` 条目，`history()` 自己造的记号（2026-09-27） */
  | { role: "compaction"; summary: string; tokensBefore: number }

/** 内容可能是一段字符串，也可能是一串块。**图片不还原成文字**，如实标一下 */
export function 取文本(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content
  return content
    .map((c) => (c.type === "text" ? (c.text ?? "") : c.type === "image" ? "（图片）" : ""))
    .join("")
}

/** pi 的 `timestamp` 是毫秒数；缺了、坏了就不给——**缺失不等于 0**（2026-09-27） */
function 时刻(m: { timestamp?: unknown }): { at: number } | Record<string, never> {
  return typeof m.timestamp === "number" && Number.isFinite(m.timestamp) && m.timestamp > 0 ? { at: m.timestamp } : {}
}

/**
 * `SessionManager.getBranch()`（从根到当前叶子的全部条目）→ 历史消息。
 * 走完整的那条路径、不走 `buildSessionContext()`（那是给模型的，压缩过就只剩摘要），见 `native.ts` 的 `history()`。
 */
export function 分支转消息(分支: readonly unknown[]): 历史消息[] {
  return (分支 as { type: string; message?: unknown; summary?: string; tokensBefore?: number }[]).flatMap((x): 历史消息[] =>
    x.type === "message" && x.message
      ? [x.message as 历史消息]
      : x.type === "compaction"
        ? [{ role: "compaction", summary: x.summary ?? "", tokensBefore: x.tokensBefore ?? 0 }]
        : [],
  )
}

export function 消息转历史(消息: readonly 历史消息[]): RestoredItem[] {
  const 出: RestoredItem[] = []
  const 待补结果 = new Map<string, RestoredItem & { kind: "tool" }>()

  for (const m of 消息) {
    if (m.role === "compaction") {
      出.push({ kind: "compaction", summary: m.summary, tokensBefore: m.tokensBefore })
      continue
    }
    if (m.role === "user") {
      const text = 取文本(m.content)
      if (text.trim()) 出.push({ kind: "text", who: "user", text, ...时刻(m) })
      continue
    }
    if (m.role === "assistant") {
      const text = (m.content ?? [])
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
      if (text.trim()) 出.push({ kind: "text", who: "agent", text, ...时刻(m) })
      for (const c of m.content ?? []) {
        if (c.type !== "toolCall") continue
        const 条: RestoredItem & { kind: "tool" } = {
          kind: "tool",
          id: c.id,
          name: c.name,
          input: c.arguments,
          ...时刻(m),
        }
        出.push(条)
        待补结果.set(c.id, 条)
      }
      continue
    }
    if (m.role === "toolResult") {
      const 条 = 待补结果.get(m.toolCallId)
      // **没见过对应调用的结果也照记**——宁可多一条，不可丢一条
      if (!条) {
        出.push({
          kind: "tool",
          id: m.toolCallId,
          name: m.toolName,
          input: undefined,
          result: 取文本(m.content),
          ...时刻(m),
        })
        continue
      }
      条.result = 取文本(m.content)
    }
  }
  return 出.map((item): RestoredItem => {
    if (item.kind !== "tool" || item.name !== ASK_USER_QUESTION) return item
    const parsed = QuestionsSchema.safeParse((item.input as { questions?: unknown } | undefined)?.questions)
    if (!parsed.success) return item
    let question: import("../protocol/questions.js").QuestionRecord = { requestId: item.id, questions: parsed.data, state: "interrupted" }
    if (item.result) {
      try {
        const result = JSON.parse(item.result)
        if (result.answers) question = { ...question, state: "answered", answer: validateQuestionAnswer(parsed.data, result) }
        else if (result.state === "cancelled") question = { ...question, state: "cancelled" }
      } catch { /* Unreadable or interrupted results stay visibly interrupted. */ }
    }
    return { kind: "question", question, ...(item.at ? { at: item.at } : {}) }
  })
}

/**
 * `getBranch()` 的条目 → 恢复条目（2026-09-27）。续接（`native.ts`）、子 agent 读回（`run-dir.ts`）、
 * 全文搜索（`pi-record.ts`）都调这一个——见文件头「第三个读者」。
 */
export function 还原历史(分支: readonly unknown[]): RestoredItem[] {
  return 消息转历史(分支转消息(分支))
}

/**
 * 先出方案（2026-09-27；2026-09-28 从 `native.ts` 的 `history()` 搬到这里）：方案簿里记着的那次 `propose_plan` 调用**原位**换成方案卡，
 * 簿里没有的（簿读坏了、老记录、交失败的那次）照旧是工具行，不编一个状态。一换一，条数不变。
 *
 * **续接（`history()`）与全文搜索（`pi-record.ts` 的 `读记录`）都调这一个**——搜索此前不换，同一次调用在搜索那边是 id `<toolCallId>` 的工具行，
 * 点开后却是 `plan:<toolCallId>` 的卡片：按 id 找不到、按 nth 数也歪（卡片之后的每一处都错一位）。
 */
export function 换上方案卡(条: readonly RestoredItem[], 找: (planId: string) => 方案 | undefined): RestoredItem[] {
  return 条.map((x) => {
    if (x.kind !== "tool" || x.name !== 出方案工具名) return x
    const 记 = 找(x.id)
    return 记 ? { kind: "plan" as const, plan: 记 } : x
  })
}
