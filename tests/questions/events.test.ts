import { expect, it } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"
it("问答卡作为快照中唯一条目，结算就地更新；工具失败仍显示", () => {
 const h = new SessionTranscripts({ terminalMaxChars: 10000 }); h.track("a", "native")
 h.ingest("a", { kind: "tool_start", sessionId: "a", toolCallId: "c", toolName: "ask_user_question", input: {} })
 h.ingest("a", { kind: "question", sessionId: "a", question: { requestId: "c", state: "pending", questions: [{ id: "q", question: "范围？" }] } })
 h.ingest("a", { kind: "question", sessionId: "a", question: { requestId: "c", state: "answered", questions: [{ id: "q", question: "范围？" }], answer: { answers: [{ id: "q", selected: [], custom: "全部" }] } } })
 h.ingest("a", { kind: "tool_end", sessionId: "a", toolCallId: "c", toolName: "ask_user_question", isError: false, text: "done", truncated: false, bytes: 4 })
 expect(h.subscribe("a").items).toHaveLength(1)
 expect(h.subscribe("a").items[0]).toMatchObject({ type: "question", state: "answered" })
 h.ingest("a", { kind: "tool_end", sessionId: "a", toolCallId: "bad", toolName: "ask_user_question", isError: true, text: "invalid", truncated: false, bytes: 7 })
 expect(h.subscribe("a").items[1]).toMatchObject({ type: "tool", status: "error" })
})
