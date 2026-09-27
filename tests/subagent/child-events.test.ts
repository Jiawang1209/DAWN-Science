/** pi 事件 → 子事件（2026-09-27，spec §4.1）。只翻译，不解释；工具结果在子进程里就截（16 KiB），截了要说 */
import { describe, expect, it } from "vitest"
import { 翻成子事件, 子事件上限 } from "../../src/subagent/child-events.js"

describe("翻成子事件", () => {
  it("文字、思考、工具开始、轮次结束", () => {
    expect(翻成子事件({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "好" } })).toEqual({ kind: "output", data: "好" })
    expect(翻成子事件({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "想" } })).toEqual({ kind: "thinking", delta: "想" })
    expect(翻成子事件({ type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: "a.py" } })).toEqual({
      kind: "tool_start", toolCallId: "t1", toolName: "read", input: { path: "a.py" },
    })
    expect(翻成子事件({ type: "turn_end" })).toEqual({ kind: "turn_end" })
  })
  it("工具结束：顶层或结果上任一说失败就是失败（与 native 的判据同一句）", () => {
    const e = 翻成子事件({ type: "tool_execution_end", toolCallId: "t1", toolName: "bash", isError: false, result: { isError: true, content: [{ type: "text", text: "boom" }] } })
    expect(e).toEqual({ kind: "tool_end", toolCallId: "t1", toolName: "bash", isError: true, text: "boom", truncated: false, bytes: 4 })
  })
  it("**超过 16 KiB 就截**，带原始字节数、正文里说省了多少——不静默截断", () => {
    const 长 = "汉".repeat(子事件上限.工具结果字节) // 每个 3 字节
    const e = 翻成子事件({ type: "tool_execution_end", toolCallId: "t", toolName: "read", result: { content: [{ type: "text", text: 长 }] } })
    expect(e?.kind).toBe("tool_end")
    if (e?.kind !== "tool_end") return
    expect(e.truncated).toBe(true)
    expect(e.bytes).toBe(Buffer.byteLength(长, "utf8"))
    expect(e.text).toContain("字节没显示")
    expect(e.text).not.toContain("�")
  })
  it("别的事件不吐（用量、队列、agent_end……）", () => {
    expect(翻成子事件({ type: "queue_update" })).toBeUndefined()
    expect(翻成子事件({ type: "message_update", assistantMessageEvent: { type: "toolcall_delta" } })).toBeUndefined()
  })
})
