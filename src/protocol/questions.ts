import { z } from "zod"

export const ASK_USER_QUESTION = "ask_user_question"
const short = z.string().trim().min(1).max(200)
export const QuestionSchema = z.object({
  id: short,
  question: z.string().trim().min(1).max(4000),
  header: short.optional(),
  options: z.array(z.object({ label: short, description: z.string().max(2000).optional() }).strict()).max(8).optional(),
  multi_select: z.boolean().optional(),
}).strict().refine((q) => new Set(q.options?.map((o) => o.label)).size === (q.options?.length ?? 0), "选项标签不能重复")
export const QuestionsSchema = z.array(QuestionSchema).min(1).max(3)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, "问题 id 不能重复")
export const QuestionAnswerSchema = z.object({
  answers: z.array(z.object({ id: short, selected: z.array(short).max(8), custom: z.string().trim().min(1).max(12000).optional() }).strict()).min(1).max(3),
}).strict()
export const QuestionRecordSchema = z.object({
  requestId: z.string().min(1),
  questions: QuestionsSchema,
  state: z.enum(["pending", "answered", "cancelled", "interrupted"]),
  answer: QuestionAnswerSchema.optional(),
}).strict().superRefine((record, ctx) => {
  if (record.state !== "answered") {
    if (record.answer) ctx.addIssue({ code: "custom", message: "未回答的提问不能带已提交答案" })
    return
  }
  try { validateQuestionAnswer(record.questions, record.answer) }
  catch { ctx.addIssue({ code: "custom", message: "已回答提问必须带完整有效的答案" }) }
})
export type Question = z.infer<typeof QuestionSchema>
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>
export type QuestionRecord = z.infer<typeof QuestionRecordSchema>

/** Validate against the original request, never against client-supplied choices. */
export function validateQuestionAnswer(questions: readonly Question[], value: unknown): QuestionAnswer {
  const answer = QuestionAnswerSchema.parse(value)
  if (answer.answers.length !== questions.length || new Set(answer.answers.map((a) => a.id)).size !== questions.length) throw new Error("答案必须包含每题且不能重复")
  for (const q of questions) {
    const a = answer.answers.find((x) => x.id === q.id)
    if (!a || new Set(a.selected).size !== a.selected.length || a.selected.some((label) => !q.options?.some((o) => o.label === label))) throw new Error("答案含未知问题或选项")
    if (!q.multi_select && (a.selected.length > 1 || (a.custom && a.selected.length > 0))) throw new Error("单选题只能选择一项或自行输入")
  }
  return { answers: questions.map((q) => answer.answers.find((a) => a.id === q.id)!) }
}
