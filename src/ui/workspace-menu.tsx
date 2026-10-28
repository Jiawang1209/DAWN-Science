import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TaskSummary } from '../protocol/index.js'
import { Button } from './primitives.js'
import { 文件夹描边图标, 下拉图标, 勾图标, 搜索图标 } from './icons.js'
import { 目录显示名 } from './format.js'
import { t, tf } from './i18n/index.js'

export interface WorkspaceMenuData {
  defaultPath?: string | undefined
  recentPaths: readonly string[]
  error?: string | undefined
  onOpen?: (() => void) | undefined
}

/** Only explicit local project paths belong in recents; scratch paths never become projects. */
export function recentWorkspacePaths(tasks: readonly TaskSummary[]): string[] {
  const paths = new Set<string>()
  for (const task of [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!task.connectionId && task.workspace) paths.add(task.workspace)
  }
  return [...paths].slice(0, 8)
}

export function WorkspaceMenu({ workspace, onPick, data, onSelect }: {
  workspace?: string | undefined
  onPick?: (() => void) | undefined
  data: WorkspaceMenuData
  onSelect: (path: string | undefined) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  const paths = [...new Set([...(workspace ? [workspace] : []), ...data.recentPaths])]
    .filter(path => path !== data.defaultPath)
    .filter(path => path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const show = () => { setQuery(''); setError(undefined); setOpen(true); data.onOpen?.() }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!popup.current || !trigger.current) return
      const rect = trigger.current.getBoundingClientRect()
      const menu = popup.current
      menu.style.width = `${Math.min(420, window.innerWidth - 24)}px`
      menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12))}px`
      const above = rect.top - menu.offsetHeight - 8
      menu.style.top = `${Math.max(12, above >= 12 ? above : Math.min(rect.bottom + 8, window.innerHeight - menu.offsetHeight - 12))}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    if (popup.current) observer?.observe(popup.current)
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, query, data.defaultPath, paths.length, error, data.error])
  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const outside = (event: MouseEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])
  const select = async (path: string | undefined) => {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await onSelect(path); close() }
    catch (problem) { setError(problem instanceof Error ? problem.message : String(problem)) }
    finally { setBusy(false) }
  }
  return <span className="ws-chip-group">
    <Button ref={trigger} variant="ghost" size="sm" className="ws-chip" data-ready={workspace ? '1' : undefined}
      aria-label={tf("工作目录：{0}", workspace ?? t("默认工作目录"))} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => open ? close() : show()}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show() } }}>
      <文件夹描边图标 /><span className="ws-chip-label">{workspace ? 目录显示名(workspace) : t("默认工作目录")}</span><下拉图标 />
    </Button>
    {open ? createPortal(<div ref={popup} className="ws-pop workspace-menu" role="dialog" aria-label={t("工作目录")}
      onBlur={event => {
        if (event.relatedTarget instanceof Node && !popup.current?.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        if (event.target === search.current && !['ArrowDown', 'ArrowUp'].includes(event.key)) return
        event.preventDefault()
        const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : current < 0 ? (event.key === 'ArrowUp' ? buttons.length - 1 : 0)
            : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }}>
      <label className="workspace-menu-search"><搜索图标 />
        <input ref={search} className="control control-integrated" type="search"
        aria-label={t("搜索工作目录")} placeholder={t("搜索工作目录")} value={query} onChange={event => setQuery(event.target.value)} /></label>
      {error || data.error ? <p className="caveat workspace-menu-error" role="alert">{error ?? data.error}</p> : null}
      <div className="workspace-menu-options" role="menu" aria-label={t("选择工作目录")}>
        <div className="workspace-menu-recent" role="group" aria-label={t("最近工作目录")}>
          {paths.map(path => <Button key={path} variant="ghost" size="menu-row" role="menuitemradio" aria-label={path}
            aria-checked={workspace === path} disabled={busy} onClick={() => void select(path)}>
            <文件夹描边图标 /><span className="workspace-menu-label"><span>{目录显示名(path)}</span></span>
            {workspace === path ? <勾图标 /> : null}
          </Button>)}
          {!paths.length ? <p className="hint workspace-menu-empty">{query ? t("没有匹配的工作目录") : t("暂无最近工作目录")}</p> : null}
        </div>
        <div className="workspace-menu-actions" role="group">
        {onPick ? <Button variant="ghost" size="menu-row" className="workspace-menu-browse" role="menuitem" disabled={busy}
          onClick={() => { close(); onPick() }}><文件夹描边图标 /><span>{t("另选文件夹…")}</span></Button> : null}
        <Button variant="ghost" size="menu-row" className="workspace-menu-default" role="menuitemradio"
          aria-checked={!workspace} disabled={busy || !data.defaultPath} onClick={() => void select(undefined)}>
          <文件夹描边图标 /><span className="workspace-menu-label"><span>{t("默认工作目录")}</span>
            {!data.defaultPath ? <span className="workspace-menu-path">{data.error ? t("默认工作目录暂不可用") : t("正在读取默认工作目录…")}</span> : null}</span>
          {!workspace ? <勾图标 /> : null}
        </Button>
        </div>
      </div>
    </div>, document.body) : null}
  </span>
}
