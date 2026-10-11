import { useEffect, useRef, type ReactNode, type KeyboardEvent, type RefObject } from "react"
import { createPortal } from "react-dom"
import type { ProjectSummary, SessionSummary, TaskSummary } from "../protocol/index.js"
import { 搜索图标, 关闭图标, 文件夹描边图标, 对话描边图标 } from "./icons.js"
import { 在组词 } from "./ime.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export interface SearchPanelProps {
  query: string
  mode: "名字" | "内容"
  focusSignal: number
  returnFocusRef?: RefObject<HTMLButtonElement | null>
  projects: readonly ProjectSummary[]
  tasks: readonly TaskSummary[]
  sessionOf: (id: string) => SessionSummary | undefined
  serverName: (id: string) => string | undefined
  onChange: (query: string) => void
  onMode: (mode: "名字" | "内容") => void
  onClose: () => void
  onProject: (id: string) => void
  onTask: (task: TaskSummary) => void
  content: ReactNode
}

/** 搜索独立于导航；结果仍由 App 的统一路由打开。 */
export function SearchPanel(p: SearchPanelProps) {
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const trigger = p.returnFocusRef?.current ?? document.activeElement as HTMLElement | null
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [p.returnFocusRef])
  useEffect(() => { input.current?.focus() }, [p.mode, p.focusSignal])
  const query = p.query.trim().toLocaleLowerCase()
  const matches = (value: string) => value.toLocaleLowerCase().includes(query)
  const projects = p.projects.filter(x => !x.temporary && matches(`${x.name} ${x.workspace}`))
  const title = (x: TaskSummary) => (x.sessionId ? p.sessionOf(x.sessionId) : undefined)?.title ?? x.title ?? t("新会话")
  const detail = (x: TaskSummary) => [x.connectionId ? p.serverName(x.connectionId) : undefined, x.workspace].filter(Boolean).join(" · ")
  const tasks = [...p.tasks].filter(x => matches(`${title(x)} ${detail(x)}`)).sort((a, b) => {
    const time = (x: TaskSummary) => (x.sessionId ? p.sessionOf(x.sessionId) : undefined)?.lastActiveAt ?? x.createdAt
    return time(b).localeCompare(time(a))
  })
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (在组词(e)) return
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); p.onClose(); return }
    const root = panel.current
    if (!root) return
    if (e.key === "Tab") {
      const controls = [...root.querySelectorAll<HTMLElement>('input, button:not(:disabled), [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    const results = [...root.querySelectorAll<HTMLElement>("[data-search-result], [data-cs-nav]")]
    if (e.target === input.current && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault()
      if (e.key === "Enter") results[0]?.click()
      else results[0]?.focus()
    } else if (p.mode === "名字" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const i = results.indexOf(document.activeElement as HTMLElement)
      if (i >= 0) { e.preventDefault(); (results[i + (e.key === "ArrowDown" ? 1 : -1)] ?? input.current)?.focus() }
    }
  }
  return createPortal(
    <div className="search-backdrop" role="dialog" aria-modal="true" aria-label={t("搜索")} onKeyDown={keys}
      onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); p.onClose() } }}>
      <div className="search-panel" ref={panel}>
        <div className="search-panel-input">
          <搜索图标 />
          <input ref={input} className="control side-search-field" value={p.query} onChange={e => p.onChange(e.target.value)}
            placeholder={p.mode === "内容" ? t("搜说过的话、回复、跑过的代码（至少两个字）") : t("搜索项目与会话的名字")} />
          <Button variant="ghost" size="icon" aria-label={t("收起浮层")} onClick={p.onClose}><关闭图标 /></Button>
        </div>
        <div className="search-panel-modes">
          {(["名字", "内容"] as const).map(mode => <Button variant="ghost" size="sm" key={mode}
            aria-pressed={p.mode === mode} onClick={() => p.onMode(mode)}>{mode === "名字" ? t("按名字") : t("按内容")}</Button>)}
        </div>
        <div className="search-panel-results">
          {p.mode === "内容" ? p.content : <>
            {projects.length ? <div className="search-result-group">{t("项目")}</div> : null}
            {projects.map(x => <Button variant="ghost" size="inline" className="search-name-result" data-search-result="" key={x.projectId} onClick={() => p.onProject(x.projectId)}>
              <文件夹描边图标 /><span><strong>{x.name}</strong><small>{x.workspace}</small></span>
            </Button>)}
            {tasks.length ? <div className="search-result-group">{t("会话")}</div> : null}
            {tasks.map(x => <Button variant="ghost" size="inline" className="search-name-result" data-search-result="" key={x.taskId} onClick={() => p.onTask(x)}>
              <对话描边图标 /><span><strong>{title(x)}</strong><small>{detail(x)}</small></span>
            </Button>)}
            {!projects.length && !tasks.length ? <p className="side-empty">{query ? tf("没有匹配「{0}」的项目或会话", p.query.trim()) : t("还没有项目或会话")}</p> : null}
          </>}
        </div>
      </div>
    </div>, document.body)
}
