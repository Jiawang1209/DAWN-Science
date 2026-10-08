import { Type } from "typebox"
import { ASK_USER_QUESTION, QuestionsSchema, type Question, type QuestionRecord } from "../protocol/questions.js"

export function createAskUserQuestionTool(ask: (id: string, questions: Question[], signal?: AbortSignal) => Promise<QuestionRecord>) {
  return {
    name: ASK_USER_QUESTION,
    // Pause subsequent tools in the same model message until the human answers.
    executionMode: "sequential" as const,
    label: ASK_USER_QUESTION,
    description: "Ask 1–3 concise questions about missing information, preferences or choices before continuing. Offer options with descriptions or allow free text. A skipped or cancelled question is not permission. Use only when the answer materially affects the task.",
    promptSnippet: "ask_user_question: ask the human for missing information or a choice",
    promptGuidelines: ["需要用户决定的分析范围、分组或方法时，调用 ask_user_question；已有明确指示不重复询问。取消或跳过不代表批准；不得编造答案。"],
    parameters: Type.Object({ questions: Type.Array(Type.Object({
      id: Type.String(), question: Type.String(), header: Type.Optional(Type.String()),
      options: Type.Optional(Type.Array(Type.Object({ label: Type.String(), description: Type.Optional(Type.String()) }), { maxItems: 8 })),
      multi_select: Type.Optional(Type.Boolean()),
    }), { minItems: 1, maxItems: 3 }) }),
    async execute(id: string, params: { questions?: unknown }, signal?: AbortSignal) {
      try {
        const questions = QuestionsSchema.parse(params.questions)
        const record = await ask(id, questions, signal)
        const result = record.state === "answered" ? record.answer : { cancelled: true, state: record.state, message: "用户未提供答案；这不代表授权。不要自行猜测需要用户确认的信息。" }
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: undefined }
      } catch (error) {
        return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true, details: undefined }
      }
    },
  }
}
