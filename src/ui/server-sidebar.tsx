import { useEffect, useRef, useState, type ReactNode } from "react"
import type { RemoteConnection, TaskSummary } from "../protocol/index.js"
import type { ServerGroup } from "./server-navigation.js"
import { Button } from "./primitives.js"
import { HoverCard, 浮层事件, type 悬停浮层 } from "./hover-card.js"
import { 服务器图标, 服务器描边图标, 三角图标, 加号描边图标, 新建会话图标 } from "./icons.js"
import { 多久之前, 年月日时分 } from "./format.js"
import { t, tf } from "./i18n/index.js"

export interface ServerSidebarProps {
  groups: readonly ServerGroup<TaskSummary>[]
  busyId?: string | undefined
  problem?: string | undefined
  problemId?: string | undefined
  folded: (id: string) => boolean
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (connection: RemoteConnection) => void
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onNewTask: (connection: RemoteConnection) => void
  renderTask: (task: TaskSummary) => ReactNode
  renderSelection: (group: ServerGroup<TaskSummary>) => ReactNode
  headerActions?: ReactNode
  toolbar?: ReactNode
}

/** 同一台机器的连接与会话只有一个入口。请求和任务行仍由调用方拥有。 */
export function ServerSidebar(p: ServerSidebarProps) {
  const [menuId, setMenuId] = useState<string | undefined>()
  const [浮着的, 设浮着的] = useState<悬停浮层 | undefined>()
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuId) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const close = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setMenuId(undefined) }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [menuId])
  const folded = p.folded("服务器")
  return <section className="server-navigation" aria-label={t("服务器")}>
    <HoverCard 浮着的={浮着的} />
    <div className="side-section side-section-primary" data-section="servers">
      <Button variant="text" size="inline" className="side-section-toggle" aria-expanded={!folded} onClick={() => p.onToggle("服务器")}>
        <三角图标 className={`twisty${folded ? "" : " open"}`} />
        {folded ? <服务器图标 className="side-section-icon" /> : <服务器描边图标 className="side-section-icon" />}
        <span className="side-section-title">{t("服务器")}</span>
        {p.groups.length > 0 ? <span className="side-count side-section-count">{p.groups.length}</span> : null}
      </Button>
      <div className="server-head-actions">
        {p.headerActions}
        <Button variant="ghost" size="inline" className="server-add" aria-label={t("添加服务器")} onClick={p.onAdd}>
          <加号描边图标 />
        </Button>
      </div>
    </div>
    {p.toolbar}
    {!folded && p.groups.length === 0 ? <p className="server-empty">{t("还没有服务器")}</p> : null}
    {folded ? null : p.groups.map(group => {
      const c = group.connection
      const busy = p.busyId === group.id || c?.state.kind === "connecting"
      const ready = c?.state.kind === "ready"
      const state = !c ? t("连接已移除") : ready ? t("已连接") : c.state.kind === "connecting" ? t("连接中") : t("未连接")
      const label = c?.label ?? group.id
      const lastConnected = c?.lastConnectedAt ? 多久之前(c.lastConnectedAt, Date.now(), "<1m") : undefined
      const lastConnectedLabel = c?.lastConnectedAt ? tf("上次成功连接：{0}", 年月日时分(c.lastConnectedAt)) : undefined
      const details = c ? [
        { 图: "服务器" as const, 文: `${c.username}@${c.host}:${c.port}` },
        ...(!ready && lastConnectedLabel ? [{ 图: "时钟" as const, 文: lastConnectedLabel }] : []),
      ] : undefined
      return <div key={group.id} className="side-server remote-row" data-connection-id={group.id} data-state={c?.state.kind ?? "removed"}>
        {c?.group ? <span className="remote-group-name">{c.group}</span> : null}
        <div className="side-subhead-row">
            <Button variant="ghost" size="inline" className="side-subhead" {...浮层事件(设浮着的, label, state, details, "服务器", { 标题: ".name", 容器: ".sidebar", 开在: "右边" })} aria-expanded={!p.folded(group.id)} onClick={() => p.onToggle(group.id)}>
              <三角图标 className={`twisty${p.folded(group.id) ? "" : " open"}`} />
              {p.folded(group.id) ? <服务器图标 /> : <服务器描边图标 />}
              <span className="name remote-label">{label}</span>
              {ready ? <span className="server-dot ready" role="img" aria-label={state} /> : <><span className={`server-dot compact${c?.state.kind === "disconnected" ? " failed" : c?.state.kind === "connecting" ? " connecting" : ""}`} role="img" aria-label={state} /><span className="server-meta remote-sub">
                <span className="remote-status">{state}</span>
                {lastConnected ? <span className="server-last" aria-label={lastConnectedLabel}>{lastConnected}</span> : null}
              </span></>}
            </Button>
          {p.renderSelection(group)}
          {c ? <Button variant="ghost" size="inline" className="server-new" aria-label={t("新建远端任务")} disabled={busy} onClick={() => {
            if (p.folded(group.id)) p.onToggle(group.id)
            p.onNewTask(c)
          }}><新建会话图标 /></Button> : null}
          {c ? <div className="server-menu-anchor" ref={menuId === group.id ? menu : undefined}>
            <Button variant="ghost" size="icon" aria-label={tf("管理服务器：{0}", label)} aria-haspopup="menu" aria-expanded={menuId === group.id}
              onClick={() => setMenuId(menuId === group.id ? undefined : group.id)}>⋯</Button>
            {menuId === group.id ? <div className="server-menu" role="menu" onKeyDown={e => {
              if (e.key === "Escape") { setMenuId(undefined); menu.current?.querySelector<HTMLButtonElement>("button")?.focus() }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                buttons[(index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus()
              }
            }}>
              <Button variant="ghost" size="sm" role="menuitem" disabled={busy} onClick={() => { setMenuId(undefined); ready ? p.onDisconnect(c.id) : p.onConnect(c.id) }}>{ready ? t("断开") : t("连接")}</Button>
              <Button variant="ghost" size="sm" role="menuitem" disabled={busy} onClick={() => { setMenuId(undefined); p.onEdit(c) }}>{t("编辑")}</Button>
            </div> : null}
          </div> : null}
        </div>
        {p.folded(group.id) ? null : <>
          <ul className="server-session-list">{group.tasks.map(p.renderTask)}</ul>
        </>}
      </div>
    })}
  </section>
}
