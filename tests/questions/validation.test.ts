import { expect, it } from "vitest"
import { QuestionsSchema, validateQuestionAnswer } from "../../src/protocol/questions.js"
import { 消息转历史 } from "../../src/runtime/history.js"
import { createAskUserQuestionTool } from "../../src/tools/ask-user-question.js"
import { 方案期判 } from "../../src/policy/plan-mode.js"
const qs = [{ id: "q", question: "范围？", options: [{ label: "全部" }, { label: "部分" }] }]
it("拒绝重复 id/选项、过量问题、错题、重复选项和单选自由输入冲突", () => {
 expect(QuestionsSchema.safeParse([...qs, ...qs]).success).toBe(false)
 expect(QuestionsSchema.safeParse([{ ...qs[0], options: [{ label: "全部" }, { label: "全部" }] }]).success).toBe(false)
 expect(QuestionsSchema.safeParse([]).success).toBe(false)
 for (const answer of [
 { answers: [{ id: "wrong", selected: [] }] }, { answers: [{ id: "q", selected: ["全部", "全部"] }] },
 { answers: [{ id: "q", selected: ["全部", "部分"] }] }, { answers: [{ id: "q", selected: ["全部"], custom: "其他" }] },
 ]) expect(() => validateQuestionAnswer(qs, answer)).toThrow()
 expect(validateQuestionAnswer(qs, { answers: [{ id: "q", selected: [] }] })).toEqual({ answers: [{ id: "q", selected: [] }] })
})
it("真实模型工具结果返回完整答案，不结束回合；无效参数不发事件", async () => {
 const calls: string[] = []
 const tool = createAskUserQuestionTool(async (id, questions) => { calls.push(id); return { requestId: id, questions, state: "answered", answer: { answers: [{ id: "q", selected: ["全部"] }] } } })
 expect(tool.executionMode).toBe("sequential")
 const r = await tool.execute("call", { questions: qs })
 expect(JSON.parse(r.content[0]!.text)).toEqual({ answers: [{ id: "q", selected: ["全部"] }] })
 expect(r).not.toHaveProperty("terminate")
 expect((await tool.execute("bad", { questions: [] })).isError).toBe(true)
 expect(calls).toEqual(["call"])
})
it("问答历史从原始工具参数与结果恢复；无结果为中断，分叉无需伪造执行栈", () => {
 const input = { role: "assistant" as const, content: [{ type: "toolCall" as const, id: "c", name: "ask_user_question", arguments: { questions: qs } }] }
 expect(消息转历史([input])[0]).toMatchObject({ kind: "question", question: { state: "interrupted" } })
 expect(消息转历史([input, { role: "toolResult", toolCallId: "c", toolName: "ask_user_question", content: [{ type: "text", text: JSON.stringify({ answers: [{ id: "q", selected: ["全部"] }] }) }] }])[0]).toMatchObject({ kind: "question", question: { state: "answered" } })
})
it("方案期允许澄清但继续禁止执行和写入", () => {
 const context = { 方案期: true, 已批准: [], workspace: "/tmp" }
 expect(方案期判("ask_user_question", {}, context).kind).toBe("allow")
 expect(方案期判("write", { path: "x" }, context).kind).toBe("deny")
 expect(方案期判("run_code", {}, context).kind).toBe("deny")
})
