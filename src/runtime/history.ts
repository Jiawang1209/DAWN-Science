/**
 * pi 的会话记录 → 界面认识的历史条目（会话续接 2026-08-11；2026-09-27 从 `native.ts` 搬出来）。
 *
 * **两处共用**：主对话续接（`native.ts` 的 `history()`）、子 agent 的会话文件读回（`subagent/run-dir.ts`）。
 * 抄一份就是第二个家——两份翻法迟早各自漂。
 *
 * 取舍见 `native.ts` 的 `history()` 文件注释：thinking 不还原、工具调用还原成「已完成」、压缩条目还原成一条压缩标记。
 */
import type { RestoredItem } from "./types.js"

/** pi 记下的一条消息。**只声明我们真的读的那几个字段** */
export type 历史消息 =
  | { role: "user"; content: string | { type: string; text?: string }[] }
  | {
      role: "assistant"
      content: ({ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: unknown } | { type: "thinking" })[]
    }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: { type: string; text?: string }[] }
  /** 不是 pi 的消息：`getBranch()` 里的 `compaction` 条目，`history()` 自己造的记号（2026-09-27） */
  | { role: "compaction"; summary: string; tokensBefore: number }

/** 内容可能是一段字符串，也可能是一串块。**图片不还原成文字**，如实标一下 */
export function 取文本(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content
  return content
    .map((c) => (c.type === "text" ? (c.text ?? "") : c.type === "image" ? "（图片）" : ""))
    .join("")
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
      if (text.trim()) 出.push({ kind: "text", who: "user", text })
      continue
    }
    if (m.role === "assistant") {
      const text = (m.content ?? [])
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
      if (text.trim()) 出.push({ kind: "text", who: "agent", text })
      for (const c of m.content ?? []) {
        if (c.type !== "toolCall") continue
        const 条: RestoredItem & { kind: "tool" } = {
          kind: "tool",
          id: c.id,
          name: c.name,
          input: c.arguments,
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
        })
        continue
      }
      条.result = 取文本(m.content)
    }
  }
  return 出
}
