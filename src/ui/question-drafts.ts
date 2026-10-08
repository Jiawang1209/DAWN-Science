/** One shared draft per session/request, including across main and side views. */
import { atom } from "nanostores"
import { z } from "zod"
import type { QuestionRecord } from "../protocol/index.js"
const DraftSchema = z.object({ index: z.number().int().nonnegative(), collapsed: z.boolean(), drafts: z.array(z.object({ selected: z.array(z.string()), custom: z.string(), skipped: z.boolean() })) })
export type QuestionDraft = z.infer<typeof DraftSchema>
const stores = new Map<string, ReturnType<typeof atom<QuestionDraft>>>()
export function questionDraftStore(sessionId: string, record: QuestionRecord) {
  const key = `dawn.question-draft.v1:${JSON.stringify([sessionId, record.requestId])}`
  let store = stores.get(key)
  if (!store) {
    const initial: QuestionDraft = { index: 0, collapsed: false, drafts: record.questions.map(() => ({ selected: [], custom: "", skipped: false })) }
    let draft = initial
    try {
      const parsed = DraftSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"))
      if (parsed.success && parsed.data.drafts.length === record.questions.length && parsed.data.index < record.questions.length
        && parsed.data.drafts.every((d, i) => d.selected.every((label) => record.questions[i]?.options?.some((o) => o.label === label)))) draft = parsed.data
    } catch { /* Storage unavailable: the live session still works. */ }
    store = atom(draft)
    store.listen((value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Keep in-memory draft. */ } })
    stores.set(key, store)
  }
  return store
}
export function clearQuestionDraft(sessionId: string, requestId: string): void {
  const key = `dawn.question-draft.v1:${JSON.stringify([sessionId, requestId])}`
  stores.delete(key)
  try { localStorage.removeItem(key) } catch { /* Optional local draft persistence. */ }
}
