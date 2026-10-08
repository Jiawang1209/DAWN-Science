import { expect, it } from "vitest"
import { TranscriptItemSchema } from "../../src/protocol/events.js"
it("结构化问题是可同步的转录条目", () => {
  expect(TranscriptItemSchema.safeParse({ type: "question", id: "question:c1", requestId: "c1", state: "pending", questions: [{ id: "q1", question: "选择分析范围", options: [{ label: "全数据" }] }] }).success).toBe(true)
})
it("历史条目不能把缺失或伪造答案标为已回答", () => {
 const base = { type: "question", id: "question:c", requestId: "c", state: "answered", questions: [{ id: "q", question: "范围？", options: [{ label: "全部" }] }] }
 expect(TranscriptItemSchema.safeParse(base).success).toBe(false)
 expect(TranscriptItemSchema.safeParse({ ...base, answer: { answers: [{ id: "q", selected: ["伪造"] }] } }).success).toBe(false)
})
