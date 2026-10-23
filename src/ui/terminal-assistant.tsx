import { useEffect, useRef, useState } from 'react'
import type { QuestionAnswer, TranscriptItem } from '../protocol/index.js'
import type { WorkbenchClient } from './client.js'
import type { 待答的权限 } from './state/transcript-slot.js'
import { Button } from './primitives.js'
import { AgentMarkdown } from './markdown.js'
import { PermissionCard } from './permission-card.js'
import { QuestionCard } from './question-card.js'
import { 在组词 } from './ime.js'
import { t } from './i18n/index.js'
import { useStore } from '@nanostores/react'
import { $items } from './state/transcript.js'

const drafts = new Map<string, string>()
function observedOutput(result: string): string {
  try { const value = JSON.parse(result); return typeof value.text === 'string' ? value.text : result }
  catch { return result }
}
export function TerminalAssistant({ client, terminalId, ownerSessionId, items: suppliedItems, busy, onAbort, onSent, permission, onAnswerPermission, onAnswerQuestion }: {
  client: Pick<WorkbenchClient, 'get'>; terminalId: string; ownerSessionId: string
  items?: readonly TranscriptItem[] | undefined; busy: boolean; onAbort: () => void
  onSent?: (() => void) | undefined
  permission?: 待答的权限 | undefined
  onAnswerPermission?: ((requestId: string, optionId?: string) => void) | undefined
  onAnswerQuestion?: ((requestId: string, answer?: QuestionAnswer) => Promise<void>) | undefined
}) {
  const liveItems = useStore($items)
  const items = suppliedItems ?? liveItems
  const scope = `${ownerSessionId}:${terminalId}`
  const [draft, setDraft] = useState(() => drafts.get(scope) ?? '')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState('')
  const alive = useRef(true), locked = useRef(false), feed = useRef<HTMLDivElement>(null)
  useEffect(() => () => { alive.current = false }, [])
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight }, [items, permission])
  const change = (text: string) => { setDraft(text); drafts.set(scope, text) }
  const questions = items.filter(i => i.type === 'question' && i.state === 'pending')
  const send = async () => {
    if (!draft.trim() || busy || locked.current || permission || questions.length) return
    locked.current = true; setSending(true); setProblem('')
    try {
      await client.get('sendTerminalPrompt', { terminalId, ownerSessionId, text: draft.trim() })
      drafts.delete(scope)
      if (alive.current) { setDraft(''); onSent?.() }
    } catch (error) { if (alive.current) setProblem(error instanceof Error ? error.message : String(error)) }
    finally { locked.current = false; if (alive.current) setSending(false) }
  }
  const visible = items.filter(i => i.type === 'turn' || i.type === 'notice' || i.type === 'tool' && i.name.startsWith('terminal_')).slice(-12)
  return <div className="terminal-assistant" aria-label={t("终端 AI 对话")}>
    <div className="terminal-ai-feed" ref={feed} role="log" aria-label={t("终端对话记录")}>
      {!visible.length ? <p className="hint">{t("直接描述要做的事，无需先打开 Python 或 R。")}</p> : null}
      {visible.map(item => item.type === 'turn' ? <div className={`terminal-ai-turn ${item.who}`} key={item.id}>
        <span className="terminal-ai-who">{item.who === 'user' ? t("你") : t("AI")}</span>
        {item.who === 'agent' ? <AgentMarkdown text={item.text} streaming={!item.final} /> : <p>{item.text}</p>}
      </div> : item.type === 'tool' ? <details className="terminal-ai-step" key={item.id}>
        <summary>{item.status === 'running' ? t("正在操作终端") : item.status === 'error' ? t("终端操作未完成") : t("终端操作已返回")}</summary>
        {typeof (item.input as { code?: unknown } | undefined)?.code === 'string' ? <pre>{(item.input as { code: string }).code}</pre> : null}
        {item.result ? <pre>{observedOutput(item.result)}</pre> : null}
      </details> : item.type === 'notice' ? <p className="caveat" key={item.id}>{item.text}</p> : null)}
      {permission && onAnswerPermission ? <PermissionCard permission={permission} onAnswer={onAnswerPermission} /> : null}
      {onAnswerQuestion ? questions.map(record => record.type === 'question' ? <QuestionCard key={record.requestId} sessionId={ownerSessionId} record={record} onAnswer={answer => onAnswerQuestion(record.requestId, answer)} /> : null) : null}
    </div>
    {!permission && !questions.length ? <div className="terminal-ai-compose">
      <textarea className="control terminal-ai-input" aria-label={t("终端 AI 输入")} placeholder={t("直接描述你想在这个终端做什么…")} value={draft}
        disabled={sending || Boolean(permission) || questions.length > 0} onChange={e => change(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !在组词(e)) { e.preventDefault(); void send() }
        }} />
      <div className="terminal-ai-actions"><span className="hint">{t("沿用当前对话和权限；发送即授权此终端")}</span>
        {busy ? <Button variant="outline" size="sm" onClick={onAbort}>{t("打断 AI")}</Button>
          : <Button variant="primary" size="sm" disabled={!draft.trim() || sending || Boolean(permission) || questions.length > 0} onClick={() => void send()}>{t("提交给 AI")}</Button>}
      </div>
      {problem ? <p className="terminal-control-error" role="alert">{problem}</p> : null}
    </div> : busy ? <Button variant="outline" size="sm" onClick={onAbort}>{t("打断 AI")}</Button> : null}
  </div>
}
