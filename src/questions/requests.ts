/** Session-owned question lifecycle. Persist before acknowledging a human answer. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { QuestionRecordSchema, QuestionsSchema, validateQuestionAnswer, type Question, type QuestionAnswer, type QuestionRecord } from "../protocol/questions.js"

export class QuestionRequests {
  private records = new Map<string, QuestionRecord>()
  private waits = new Map<string, { resolve: (r: QuestionRecord) => void; cleanup: () => void }>()
  private file: string
  constructor(private sessionId: string, dir: string, private publish: (record: QuestionRecord) => void) {
    this.file = join(dir, "questions.json")
    if (existsSync(this.file)) {
      const records = z.array(QuestionRecordSchema).parse(JSON.parse(readFileSync(this.file, "utf8")))
      for (const r of records) this.records.set(r.requestId, r.state === "pending" ? { ...r, state: "interrupted" } : r)
      if (records.some((r) => r.state === "pending")) this.save(this.records)
    }
  }
  get(id: string): QuestionRecord | undefined { const r = this.records.get(id); return r ? structuredClone(r) : undefined }
  private save(records: Map<string, QuestionRecord>): void {
    mkdirSync(join(this.file, ".."), { recursive: true })
    writeFileSync(`${this.file}.tmp`, JSON.stringify([...records.values()]), { mode: 0o600 })
    renameSync(`${this.file}.tmp`, this.file)
  }
  private store(r: QuestionRecord): void {
    const next = new Map(this.records); next.set(r.requestId, r)
    this.save(next); this.records = next
  }
  ask(id: string, questions: readonly Question[], signal?: AbortSignal): Promise<QuestionRecord> {
    const qs = QuestionsSchema.parse(questions)
    if (this.records.has(id)) throw new Error("提问请求已存在")
    const r: QuestionRecord = { requestId: id, questions: qs, state: signal?.aborted ? "interrupted" : "pending" }
    this.store(r)
    if (r.state !== "pending") { this.publish(structuredClone(r)); return Promise.resolve(r) }
    return new Promise((resolve) => {
      const abort = () => this.settle(id, { ...r, state: "interrupted" }, true)
      this.waits.set(id, { resolve, cleanup: () => signal?.removeEventListener("abort", abort) })
      signal?.addEventListener("abort", abort, { once: true })
      this.publish(structuredClone(r))
      if (signal?.aborted) abort()
    })
  }
  answer(sessionId: string, id: string, value?: QuestionAnswer): void {
    if (sessionId !== this.sessionId) throw new Error("不能回答其他会话的问题")
    const r = this.records.get(id)
    if (!r) throw new Error("提问请求不存在")
    const answer = value === undefined ? undefined : validateQuestionAnswer(r.questions, value)
    if (r.state !== "pending" || !this.waits.has(id)) {
      if ((r.state === "answered" && answer && JSON.stringify(answer) === JSON.stringify(r.answer)) || (r.state === "cancelled" && !answer)) return
      throw new Error("提问已结束，请继续对话重新确认")
    }
    this.settle(id, { ...r, state: answer ? "answered" : "cancelled", ...(answer ? { answer } : {}) })
  }
  private settle(id: string, r: QuestionRecord, interrupted = false): void {
    const wait = this.waits.get(id)
    if (!wait) return
    // On abort, always release execution even if the disk became unavailable.
    // The on-disk pending request is marked interrupted when next opened.
    try { this.store(r) } catch (error) { if (!interrupted) throw error; this.records.set(id, r) }
    this.waits.delete(id); wait.cleanup()
    try { this.publish(structuredClone(r)) } finally { wait.resolve(structuredClone(r)) }
  }
  interrupt(): void {
    for (const id of [...this.waits.keys()]) this.settle(id, { ...this.records.get(id)!, state: "interrupted" }, true)
  }
}
