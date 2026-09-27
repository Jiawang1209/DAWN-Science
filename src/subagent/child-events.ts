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

/**
 * 一条工具结果按 16 KiB 截、说清省了多少。**活着的这条路与读盘重建（`读子转录`）共用**（2026-09-27 审查）：
 * 重开后点开一个 `cat` 过大文件的子 agent，不该比它活着时多送几 MB 给界面。
 */
export function 截工具结果(full: string): { text: string; truncated: boolean; bytes: number } {
  const bytes = Buffer.byteLength(full, "utf8")
  if (bytes <= 子事件上限.工具结果字节) return { text: full, truncated: false, bytes }
  const 留 = 按字节截(full, 子事件上限.工具结果字节)
  return {
    text: `${留}\n…（还有 ${bytes - Buffer.byteLength(留, "utf8")} 字节没显示，全文在它的会话文件里）`,
    truncated: true,
    bytes,
  }
}

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
      const 截过 = 截工具结果(full)
      return {
        kind: "tool_end",
        toolCallId: String(e.toolCallId ?? ""),
        toolName: String(e.toolName ?? "?"),
        // **两处任一说失败就是失败**——与 native 那句同一个判据（`||` 不是 `??`：false 不是空值）
        isError: Boolean(e.isError || e.result?.isError),
        ...截过,
      }
    }
    case "turn_end":
      return { kind: "turn_end" }
    default:
      return undefined
  }
}
