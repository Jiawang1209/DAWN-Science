import type { TerminalSearchRequest } from './terminal-keys.js'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { WorkbenchClient } from './client.js'
/**
 * 原生终端工作区。对话视图中占满主区，只显示一份 xterm；
 * 原对话隐藏并保留草稿，返回时恢复。输入 dawn 启动 CLI Agent，
 * /exit 回到原 Shell。标签、项目归属和 PTY 生命周期仍由 App 管理。
 */
import { useStore } from "@nanostores/react"
import { Button } from "./primitives.js"
import { TerminalImageShell } from './terminal-images.js'
import type { TerminalAgentState } from '../protocol/terminal.js'
import { TerminalPane } from "./terminal.js"
import { $dockChunks } from "./state/index.js"
import type { SessionSummary } from "../protocol/index.js"

import { t, tf } from "./i18n/index.js"
import { 终端图标, 加号图标, 返回图标 } from './icons.js'
import { TerminalHistoryPicker } from './terminal-history-picker.js'
export function TerminalDock({
  client,
  terminals,
  currentId,
  workspace,
  canOpen,
  onPick,
  onNew,
  onClose,
  onCloseDock,
  onInput,
  onResize,
  fullPage = false,
  returning = false,
}: {
  client?: Pick<WorkbenchClient, 'get'> | undefined
  /** 这个项目里活着的终端会话 */
  terminals: readonly SessionSummary[]
  currentId: string | undefined
  /** 新终端会开在哪。**摆出来**——不摆的话「它到底在哪个目录」只能靠 pwd 猜 */
  workspace?: string | undefined
  /** 能不能开新的。没有项目时不能——**给一个点了必然失败的按钮更坏** */
  canOpen: boolean
  onPick: (sessionId: string) => void
  onNew: () => void
  onClose: (sessionId: string) => void
  onCloseDock: () => void
  onInput: (data: string) => void
  onResize?: ((cols: number, rows: number) => void) | undefined
  returning?: boolean | undefined
  fullPage?: boolean | undefined
}) {
  const chunks = useStore($dockChunks)
  const returnTip = useId()
  const [search, setSearch] = useState<{ terminalId: string; request: TerminalSearchRequest }>()
  const requestSearch = (kind: TerminalSearchRequest['kind']) => { if (currentId) setSearch(old => ({ terminalId: currentId, request: { sequence: (old?.request.sequence ?? 0) + 1, kind } })) }
  useEffect(() => { setSearch(undefined) }, [currentId])
  const searchRequest = search && search.terminalId === currentId ? search.request : undefined
  const [agentState, setAgentState] = useState<{ terminalId: string; state: TerminalAgentState }>()
  const reportState = useCallback((state: TerminalAgentState) => { if (currentId) setAgentState({ terminalId: currentId, state }) }, [currentId])
  const exited = terminals.find(x => x.sessionId === currentId)?.state === 'exited'

  return (
    <section className={`dock${fullPage ? " terminal-workspace" : ""}`} aria-label={t("终端")}>
      <div className="dock-tabs">
        <span className="dock-title"><终端图标 />{t("终端")}</span>
        <div className="dock-terminal-tabs">
        {terminals.map((台, i) => (
          <span key={台.sessionId} className={`dock-tab${台.sessionId === currentId ? " current" : ""}`}>
            <Button
              variant="ghost"
              size="inline"
              aria-current={台.sessionId === currentId}
              onClick={() => onPick(台.sessionId)}
            >
              {/* 终端没有标题可言，**给它一个稳定的序号**比显示一串 id 强 */}
              {tf("终端 {0}", i + 1)}
              {台.state === "exited" ? <span className="hint"> {t("已结束")}</span> : null}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tf("关闭终端 {0}", i + 1)}
              onClick={() => onClose(台.sessionId)}
            >
              ×
            </Button>
          </span>
        ))}
        </div>
        <Button variant="ghost" size="icon" disabled={!canOpen} onClick={onNew} aria-label={t("＋ 新开一个")}><加号图标 /></Button>
        <span className="spacer" />
        {/* **路径要摆出来**：终端开在哪个目录，是它唯一会让人猜错的事 */}
        {workspace ? <span className="dock-cwd" title={workspace}>{fullPage ? workspace.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || workspace : workspace}</span> : null}
        {currentId ? <div className="terminal-search-actions">
          <Button variant="ghost" size="sm" aria-keyshortcuts="Meta+f Control+f" onClick={() => requestSearch('content')}>{t('搜索历史')}</Button>
          <Button variant="ghost" size="sm" disabled={exited} aria-keyshortcuts="Control+r" onClick={() => requestSearch('input')}>{t('找回输入')}</Button>
        </div> : null}
        {client && currentId ? <TerminalModeSwitch key={currentId} client={client} terminalId={currentId} exited={exited} onState={reportState} /> : null}
        {fullPage ? <span className="conv-action-tip-wrap terminal-return">
          <Button variant="outline" size="icon" className="terminal-return-button" disabled={returning} aria-busy={returning} onClick={onCloseDock}
            aria-label={t("返回会话")} aria-describedby={returnTip}>
            <返回图标 />
          </Button>
          <span id={returnTip} role="tooltip" className="conv-action-tip">{t("返回会话")}</span>
        </span> : <Button variant="ghost" size="sm" onClick={onCloseDock}>{t("收起面板")}</Button>}
      </div>

      <div className="dock-content">
        {!canOpen ? (
          /**
           * **只有「配置里没有终端 agent」这一种情况开不了**（2026-08-11）。
           *
           * 「没有打开项目」不再是拦路的理由——那时终端开在家目录
           * （作者：*「如果没有选择的话，那么终端就在家目录下」*）。
           */
          /**
            * **旁边那颗按钮摘掉了**（T4，2026-08-13）。
            *
            * 它接的是「选个目录建项目」——**而这条消息说的是配置里没有
            * pty agent，选目录解决不了它**。上面那段注释自己都写着
            * 「『没有打开项目』不再是拦路的理由」，按钮却留到了今天。
            *
            * 一个解决不了所述问题的入口，比没有更坏：人会按下去，
            * 然后发现终端还是开不了，而且不知道为什么。
            * **这里只说事实，不给假出路。**
            */
          <p className="empty">{t("配置里没有 kind: pty 的 agent，开不了终端。")}</p>
        ) : currentId ? (
          <>
            <div className="dock-shell">
              {client ? <TerminalImageShell searchRequest={searchRequest} key={currentId} client={client} terminalId={currentId}
                state={!exited && agentState?.terminalId === currentId ? agentState.state : { mode: 'normal' }} chunks={chunks} onInput={data => { if (!exited) onInput(data) }} onResize={onResize} />
                : <TerminalPane searchRequest={searchRequest} key={currentId} chunks={chunks} onInput={exited ? undefined : onInput} onResize={onResize} />}
            </div>
          </>
        ) : (
          <p className="empty">{t("还没有终端。点「＋ 新开一个」，它会开在上面那个目录里。")}</p>
        )}
      </div>
    </section>
  )
}

function TerminalModeSwitch({ client, terminalId, exited, onState }: { client: Pick<WorkbenchClient, 'get'>; terminalId: string; exited: boolean; onState: (state: TerminalAgentState) => void }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mode, setMode] = useState<'normal' | 'dawn' | 'starting' | 'stopping'>()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const observed = useRef<TerminalAgentState['mode'] | undefined>(undefined)
  const report = useRef(onState); report.current = onState
  const active = useRef(true), mutation = useRef(0)
  useEffect(() => {
    active.current = true
    let reading = false
    const read = async () => {
      if (reading) return
      reading = true
      const revision = mutation.current
      try {
        const state = await client.get<TerminalAgentState>('getTerminalAgentMode', { terminalId })
        if (active.current && revision === mutation.current) {
          setReadError('')
          if (observed.current !== state.mode) setError('')
          observed.current = state.mode; setMode(state.mode); report.current(state)
        }
      } catch (e) { if (active.current && revision === mutation.current) setReadError(e instanceof Error ? e.message : String(e)) }
      finally { reading = false }
    }
    void read()
    const timer = setInterval(() => { void read() }, 500)
    return () => { active.current = false; clearInterval(timer) }
  }, [client, terminalId])
  const switchMode = async (next: 'dawn' | 'normal', resumeSessionId?: string) => {
    mutation.current++; setBusy(true); setError(''); setReadError(''); report.current({ mode: next === 'dawn' ? 'starting' : 'stopping' })
    try {
      const state = await client.get<TerminalAgentState>('setTerminalAgentMode', { terminalId, mode: next, ...(resumeSessionId ? { resumeSessionId } : {}) })
      if (active.current) { observed.current = state.mode; setMode(state.mode); report.current(state); document.querySelector<HTMLTextAreaElement>('.dock .xterm-helper-textarea')?.focus() }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { mutation.current++; if (active.current) setBusy(false) }
  }
  const disabled = exited || busy || mode === undefined || mode === 'starting' || mode === 'stopping'
  return <div className="terminal-mode-switch">
    <div className="terminal-mode-options" role="group" aria-label={t("终端模式")}>
      <Button variant="ghost" size="sm" aria-pressed={mode === 'dawn'} disabled={disabled} onClick={() => void switchMode('dawn')}>{t("DAWN 模式")}</Button>
      <Button variant="ghost" size="sm" aria-pressed={mode === 'normal'} disabled={disabled} onClick={() => void switchMode('normal')}>{t("Normal 模式")}</Button>
    </div>
    <Button variant="ghost" size="sm" disabled={disabled || mode !== 'normal'} onClick={() => setHistoryOpen(true)}>{t("接续旧对话")}</Button>
    {historyOpen ? <TerminalHistoryPicker client={client} terminalId={terminalId} onCancel={() => setHistoryOpen(false)} onSelect={id => { setHistoryOpen(false); void switchMode('dawn', id) }} /> : null}
    {error || readError ? <span className="terminal-switch-error" role="alert">{error || readError}</span> : null}
  </div>
}
