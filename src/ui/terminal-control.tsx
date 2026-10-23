import { useEffect, useRef, useState } from 'react'
import type { WorkbenchClient } from './client.js'
import type { TerminalControlState, TerminalMode } from '../protocol/terminal.js'
import { Button } from './primitives.js'
import { t } from './i18n/index.js'

export function TerminalControlBar({ client, terminalId, ownerSessionId }: {
  client: Pick<WorkbenchClient, 'get'>; terminalId: string; ownerSessionId?: string | undefined
}) {
  const scope = `${ownerSessionId ?? ''}:${terminalId}`
  const current = useRef(scope)
  current.current = scope
  const [view, setControlView] = useState<{ scope: string; state: TerminalControlState }>()
  const [mode, setMode] = useState<TerminalMode>('shell')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const state = view?.scope === scope ? view.state : undefined
  useEffect(() => {
    let cancelled = false, reading = false
    setError(''); setMode('shell'); setBusy(false)
    const read = async () => {
      if (reading) return
      reading = true
      try {
        const state = await client.get<TerminalControlState>('getTerminalControl', { terminalId })
        if (!cancelled && current.current === scope) {
          setControlView({ scope, state })
          if (state.controlled) setMode(state.mode)
        }
      } catch (e) { if (!cancelled && current.current === scope) setError(e instanceof Error ? e.message : String(e)) }
      finally { reading = false }
    }
    void read()
    const timer = setInterval(() => void read(), 600)
    return () => { cancelled = true; clearInterval(timer) }
  }, [client, terminalId, scope])

  const action = async (enabled: boolean, interrupt = false) => {
    setBusy(true); setError('')
    try {
      const state = await client.get<TerminalControlState>(interrupt ? 'interruptTerminal' : 'setTerminalControl', interrupt
        ? { terminalId, ownerSessionId }
        : { terminalId, ...(ownerSessionId ? { ownerSessionId } : {}), enabled, mode })
      if (current.current === scope) setControlView({ scope, state })
    } catch (e) { if (current.current === scope) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (current.current === scope) setBusy(false) }
  }

  const controlled = state?.controlled && state.ownerSessionId === ownerSessionId
  return <div className="terminal-control" aria-label={t("终端协助")}>
    <label className="terminal-mode">{t("当前程序")}
      <select className="control" aria-label={t("当前终端程序")} value={mode} disabled={busy || controlled} onChange={e => setMode(e.target.value as TerminalMode)}>
        <option value="shell">Shell</option><option value="python">Python</option><option value="R">R</option>
      </select>
    </label>
    <span className={`terminal-control-status${controlled ? ' active' : ''}`} role="status">{controlled ? t("AI 协助中") : t("手动控制")}</span>
    {controlled ? <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void action(false)}>{t("接回控制")}</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void action(true, true)}>{t("Ctrl-C")}</Button>
    </> : <Button variant="outline" size="sm" disabled={busy || !ownerSessionId || !state?.alive} onClick={() => void action(true)}>{t("交给当前对话")}</Button>}
    <span className="terminal-control-hint">{!ownerSessionId ? t("打开本地内置模型对话后可交给 AI") : controlled ? t("直接输入即可接回；收起面板不会停止程序") : t("先选择终端里实际运行的程序，再交给 AI")}</span>
    {error ? <span className="terminal-control-error" role="alert">{error}</span> : null}
  </div>
}
