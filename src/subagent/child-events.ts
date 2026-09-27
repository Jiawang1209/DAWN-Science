/**
 * pi 事件 → 子事件（2026-09-27，spec §4.1）。**只翻译，不解释**——与 `native.ts` 的 `translate` 同一套判据，
 * 但只留坞里要画的那几种（文字、思考、工具、轮次）。
 *
 * 工具结果**在子进程里就截**：一条 `cat` 大文件的结果照原样过管道、进中枢、再随快照整份发给界面，是几 MB 的来回。
 * 全文在它的会话文件里（`transcript/`），这里说清省了多少（规格 7.5）。
 */
import type { 子事件 } from "./protocol.js"
import { 按字节截 } from "./clip.js"

export const 子事件上限 = { 工具结果字节: 16 * 1024 } as const

interface Pi事件 {
  type?: string
  assistantMessageEvent?: { type?: string; delta?: string }
  toolCallId?: unknown
  toolName?: unknown
  args?: unknown
  input?: unknown
  isError?: boolean
  result?: { content?: { text?: string }[]; isError?: boolean }
}

export function 翻成子事件(raw: unknown): 子事件 | undefined {
  const e = raw as Pi事件
  switch (e.type) {
    case "message_update":
      if (e.assistantMessageEvent?.type === "text_delta") return { kind: "output", data: e.assistantMessageEvent.delta ?? "" }
      if (e.assistantMessageEvent?.type === "thinking_delta") return { kind: "thinking", delta: e.assistantMessageEvent.delta ?? "" }
      return undefined
    case "tool_execution_start":
      return { kind: "tool_start", toolCallId: String(e.toolCallId ?? ""), toolName: String(e.toolName ?? "?"), input: e.args ?? e.input }
    case "tool_execution_end": {
      const full = (e.result?.content ?? []).map((c) => c.text ?? "").join("")
      const bytes = Buffer.byteLength(full, "utf8")
      const 截 = bytes > 子事件上限.工具结果字节
      const 留 = 截 ? 按字节截(full, 子事件上限.工具结果字节) : full
      return {
        kind: "tool_end",
        toolCallId: String(e.toolCallId ?? ""),
        toolName: String(e.toolName ?? "?"),
        // **两处任一说失败就是失败**——与 native 那句同一个判据（`||` 不是 `??`：false 不是空值）
        isError: Boolean(e.isError || e.result?.isError),
        text: 截 ? `${留}\n…（还有 ${bytes - Buffer.byteLength(留, "utf8")} 字节没显示，全文在它的会话文件里）` : full,
        truncated: 截,
        bytes,
      }
    }
    case "turn_end":
      return { kind: "turn_end" }
    default:
      return undefined
  }
}
