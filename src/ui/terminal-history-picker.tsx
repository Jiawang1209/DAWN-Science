import { useEffect, useState } from 'react'
import type { WorkbenchClient } from './client.js'
import type { TerminalHistoryEntry } from '../protocol/terminal.js'
import { Button } from './primitives.js'
import { t } from './i18n/index.js'

export function TerminalHistoryPicker({ client, terminalId, onCancel, onSelect }: {
  client: Pick<WorkbenchClient, 'get'>; terminalId: string; onCancel: () => void; onSelect: (id: string) => void
}) {
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>(), [query, setQuery] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void client.get<TerminalHistoryEntry[]>('listTerminalAgentHistory', { terminalId }).then(items => {
      if (live) setEntries(items)
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [client, terminalId])
  const shown = entries?.filter(s => (s.title ?? t("新会话")).toLowerCase().includes(query.toLowerCase()))
  return <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-label={t("选择历史会话")} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
    <div className="confirm terminal-history-picker">
      <h2 className="confirm-title">{t("选择历史会话")}</h2>
      <p className="hint">{t("继续当前项目中的原对话，保留消息、图片和工具上下文。")}</p>
      <input autoFocus className="control" aria-label={t("搜索历史会话")} placeholder={t("搜索历史会话")} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="terminal-history-list">
        {error ? <p role="alert">{error}</p> : !entries ? <p>{t("正在读取历史会话")}</p> : !shown?.length ? <p className="hint">{t("没有可恢复的历史会话")}</p> : shown.map(s => <Button key={s.sessionId} variant="ghost" size="sm" aria-label={s.title ?? t("新会话")} onClick={() => onSelect(s.sessionId)}>
          <span>{s.title ?? t("新会话")}</span><span className="hint">{new Date(s.lastActiveAt ?? s.createdAt).toLocaleString()} · {s.sessionId.slice(0, 8)}</span>
        </Button>)}
      </div>
      <div className="confirm-actions"><Button variant="secondary" size="sm" onClick={onCancel}>{t("取消")}</Button></div>
    </div>
  </div>
}
