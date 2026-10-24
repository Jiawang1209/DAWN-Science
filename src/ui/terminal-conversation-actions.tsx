import { useEffect, useId, useRef, useState } from 'react'
import type { WorkbenchClient } from './client.js'
import type { TerminalAgentState } from '../protocol/terminal.js'
import { Button, 导出提示, type 导出提示态 } from './primitives.js'
import { 搜索图标, 下载图标 } from './icons.js'
import { t, tf } from './i18n/index.js'

/** Conversation-level actions use the Agent bound to this terminal, never its parent view. */
export function TerminalConversationActions({ client, terminalId, sessionId, onFind }: {
  client?: Pick<WorkbenchClient, 'get'> | undefined; terminalId: string; sessionId?: string | undefined; onFind: () => void
}) {
  const findTip = useId(), exportTip = useId(), scope = `${terminalId}:${sessionId ?? ''}`
  const current = useRef({ value: scope })
  if (current.current.value !== scope) current.current = { value: scope }
  const identity = current.current
  const active = useRef(true), pending = useRef<typeof identity | undefined>(undefined)
  const [busy, setBusy] = useState<typeof identity>()
  const [notice, setNotice] = useState<导出提示态 & { scope: typeof identity }>()
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const exporting = busy === identity
  const exportConversation = async () => {
    if (!client || !sessionId || pending.current === identity) return
    pending.current = identity; setBusy(identity); setNotice(undefined)
    try {
      const state = await client.get<TerminalAgentState>('getTerminalAgentMode', { terminalId })
      if (!active.current || current.current !== identity) return
      if (state.sessionId !== sessionId || state.mode === 'starting' || state.mode === 'stopping') throw Error(t('当前终端会话已变化，请稍后重试'))
      const result = await client.get<{ path: string; turns: number }>('exportSession', { sessionId })
      if (active.current && current.current === identity) setNotice({ scope: identity, text: tf('已导出 {0} 轮到 {1}', result.turns, result.path), bad: false, nonce: Date.now() })
    } catch (error) {
      if (active.current && current.current === identity) setNotice({ scope: identity, text: tf('导不了：{0}', error instanceof Error ? error.message : String(error)), bad: true, nonce: Date.now() })
    } finally {
      if (pending.current === identity) pending.current = undefined
      if (active.current && current.current === identity) setBusy(undefined)
    }
  }
  return <span className="export-anchor terminal-conversation-actions">
    <span className="conv-actions" role="group" aria-label={t('终端会话操作')}>
      <span className="conv-action-tip-wrap">
        <Button variant="secondary" size="sm" aria-label={t('搜索历史')} aria-describedby={findTip} aria-keyshortcuts="Meta+f Control+f" onClick={onFind}><搜索图标 />{t('搜索历史')}</Button>
        <span id={findTip} role="tooltip" className="conv-action-tip">{t('搜索当前终端历史内容')}</span>
      </span>
      <span className="conv-action-tip-wrap">
        <Button variant="secondary" size="sm" className="conv-export" aria-label={t('导出会话')} aria-describedby={exportTip} disabled={!client || !sessionId || exporting} aria-busy={exporting} onClick={() => void exportConversation()}><下载图标 />{t('导出会话')}</Button>
        <span id={exportTip} role="tooltip" className="conv-action-tip">{sessionId ? t('导出当前 DAWN 会话') : t('进入 DAWN 模式后可导出会话')}</span>
      </span>
    </span>
    {notice?.scope === identity ? <导出提示 {...notice} onDone={() => setNotice(undefined)} /> : null}
  </span>
}
