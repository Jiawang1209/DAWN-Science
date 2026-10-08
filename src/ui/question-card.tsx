import { useMemo, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import { computed } from "nanostores"
import type { QuestionAnswer, QuestionRecord } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { 返回图标, 下拉图标, 关闭图标 } from "./icons.js"
import { t } from "./i18n/index.js"
import { 在组词 } from "./ime.js"
import { questionDraftStore, type QuestionDraft } from "./question-drafts.js"

/** The same persisted collapse state owns the composer seat in every view. */
export function useQuestionTakeover(sessionId: string, records: readonly QuestionRecord[]) {
  const seat = useMemo(() => computed(records.map((record) => questionDraftStore(sessionId, record)),
    (...drafts) => drafts.some((draft) => !draft.collapsed)), [sessionId, records])
  return useStore(seat)
}

export function QuestionSummary({ record, expanded }: { record: QuestionRecord; expanded?: boolean | undefined }) {
  const status = record.state === "pending" ? t("等你回答") : record.state === "answered" ? t("已回答") : record.state === "cancelled" ? t("已取消提问") : t("提问已中断，请继续对话重新确认")
  return <details className="question-summary" open={expanded || undefined}><summary>{status} · {record.questions[0]?.header ?? t("澄清问题")}</summary>
    {record.questions.map((q) => {
      const a = record.answer?.answers.find((x) => x.id === q.id)
      return <div key={q.id}><p>{q.question}</p>{a ? <p className="hint">{[...a.selected, ...(a.custom ? [a.custom] : [])].join(" · ") || t("已跳过")}</p> : null}</div>
    })}
  </details>
}

export function QuestionCard({ sessionId, record, onAnswer }: {
  sessionId: string
  record: QuestionRecord
  onAnswer: (answer?: QuestionAnswer) => Promise<void>
}) {
  const store = useMemo(() => questionDraftStore(sessionId, record), [sessionId, record.requestId])
  const progress = useStore(store)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState("")
  const locked = useRef(false)
  const index = progress.index
  const q = record.questions[index]!
  const draft = progress.drafts[index]!
  const answered = (d: QuestionDraft["drafts"][number]) => d.selected.length > 0 || d.custom.trim().length > 0 || d.skipped
  const change = (next: Partial<typeof draft>) => {
    store.set({ ...progress, drafts: progress.drafts.map((d, i) => i === index ? { ...d, ...next, skipped: false } : d) })
    setProblem("")
  }
  const submit = async (drafts: QuestionDraft["drafts"], cancel = false) => {
    if (locked.current) return
    const missing = drafts.findIndex((d) => !answered(d))
    if (!cancel && missing >= 0) { store.set({ ...progress, drafts, index: missing }); return }
    locked.current = true; setSending(true); setProblem("")
    try {
      await onAnswer(cancel ? undefined : { answers: record.questions.map((question, i) => {
        const value = drafts[i]!
        const custom = value.custom.trim()
        return { id: question.id, selected: value.skipped || (!question.multi_select && custom) ? [] : value.selected,
          ...(!value.skipped && custom ? { custom } : {}) }
      }) })
      // Stay frozen until the authoritative question event removes this card.
    } catch (error) {
      locked.current = false; setSending(false); setProblem(error instanceof Error ? error.message : String(error))
    }
  }
  const next = () => {
    if (!answered(draft) || sending) return
    if (index < record.questions.length - 1) store.set({ ...progress, index: index + 1 })
    else void submit(progress.drafts)
  }
  const skip = () => {
    const drafts = progress.drafts.map((d, i) => i === index ? { selected: [], custom: "", skipped: true } : d)
    store.set({ ...progress, drafts, index: Math.min(index + 1, record.questions.length - 1) })
    if (index === record.questions.length - 1) void submit(drafts)
  }
  return <section className="question-card" aria-label={t("澄清问题")} data-request-id={record.requestId}>
    <div className="question-card-head"><span>{q.header ?? t("澄清问题")}</span>
      <div className="question-head-actions">
        <Button variant="ghost" size="icon" aria-label={progress.collapsed ? t("展开提问") : t("收起提问")} disabled={sending} onClick={() => store.set({ ...progress, collapsed: !progress.collapsed })}><下拉图标 {...(progress.collapsed ? { className: "question-expand-icon" } : {})} /></Button>
        <Button variant="ghost" size="icon" aria-label={t("不再提问")} disabled={sending} onClick={() => void submit(progress.drafts, true)}><关闭图标 /></Button>
      </div>
    </div>
    {!progress.collapsed ? <>
      <h3>{q.question}</h3>
      <div className="question-options" role="group" aria-label={q.question}>
        {q.options?.map((o, i) => <label key={o.label} className={draft.selected.includes(o.label) ? "question-option selected" : "question-option"}>
          <input className="control question-choice" type={q.multi_select ? "checkbox" : "radio"} name={`${sessionId}:${record.requestId}:${q.id}`} checked={draft.selected.includes(o.label)} disabled={sending}
            onChange={() => change({ selected: q.multi_select ? draft.selected.includes(o.label) ? draft.selected.filter((x) => x !== o.label) : [...draft.selected, o.label] : [o.label], custom: q.multi_select ? draft.custom : "" })} />
          <span className="question-number" aria-hidden>{i + 1}</span><span><strong>{o.label}</strong>{o.description ? <span className="question-description">{o.description}</span> : null}</span>
        </label>)}
      </div>
      <textarea className="control question-answer" aria-label={t("输入你的答案")} placeholder={t("输入你的答案")} value={draft.custom} disabled={sending} rows={1}
        onChange={(e) => change({ custom: e.target.value, selected: q.multi_select ? draft.selected : [] })}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !在组词(e)) { e.preventDefault(); next() } }} />
      <div className="question-card-actions">
        <div className="question-progress">
          <Button variant="ghost" size="icon" aria-label={t("上一题")} disabled={sending || index === 0} onClick={() => store.set({ ...progress, index: index - 1 })}><返回图标 /></Button>
          <span>{index + 1}/{record.questions.length}</span>
          <Button variant="ghost" size="icon" aria-label={t("后一题")} disabled={sending || index === record.questions.length - 1} onClick={() => store.set({ ...progress, index: index + 1 })}><返回图标 className="question-next-icon" /></Button>
        </div>
        <div className="question-primary-actions">
        <Button variant="outline" size="xs" disabled={sending} onClick={skip}>{t("跳过")}</Button>
        <Button variant="primary" size="xs" disabled={sending || !answered(draft)} onClick={next}>{index === record.questions.length - 1 ? t("提交答案") : t("下一题")}</Button>
        </div>
      </div>
    </> : <p className="hint">{t("等你回答")}</p>}
    {problem ? <p className="caveat" role="alert">{problem}</p> : null}
  </section>
}
