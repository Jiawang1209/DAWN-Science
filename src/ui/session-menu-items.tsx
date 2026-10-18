/** 会话行与顶部分栏共用动作顺序、文案及可见条件。动作闭包只指向被操作的会话。 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button } from "./primitives.js"
import { 在组词 } from "./ime.js"
import { t, tf } from "./i18n/index.js"

export type 会话额外动作 = "fork" | "openDir" | "copyPath" | "copyTitle" | "copyId"
export interface SessionMenuActions {
  onPin?: (() => void) | undefined
  onRename?: ((title: string) => void) | undefined
  onMove?: ((direction: "up" | "down") => void) | undefined
  onArchive?: (() => void) | undefined
  onMarkUnread?: (() => void) | undefined
  onExtra?: ((action: 会话额外动作) => void) | undefined
  onDelete?: (() => void) | undefined
}

export function hasSessionMenuActions(actions: SessionMenuActions | undefined) {
  return actions !== undefined && Object.values(actions).some(value => typeof value === "function")
}

export function SessionMenuItems({ pinned, unread, actions, onRename, onClose, onPutInDock }: {
  pinned?: boolean | undefined
  unread?: boolean | undefined
  actions: SessionMenuActions
  onRename: () => void
  onClose: () => void
  onPutInDock?: (() => void) | undefined
}) {
  const item = (label: string, action: () => void, danger = false) => (
    <Button key={label} variant={danger ? "text" : "ghost"} size="inline" role="menuitem" {...(danger ? { className: "menu-danger" } : {})} onClick={() => { onClose(); action() }}>{label}</Button>
  )
  return <>
    {actions.onPin ? item(pinned ? t("取消置顶") : t("置顶"), actions.onPin) : null}
    {actions.onRename ? item(t("重命名"), onRename) : null}
    {actions.onMove ? <>{item(t("上移"), () => actions.onMove!("up"))}{item(t("下移"), () => actions.onMove!("down"))}</> : null}
    {actions.onArchive ? item(t("收进归档"), actions.onArchive) : null}
    {actions.onMarkUnread && !unread ? item(t("标为未读"), actions.onMarkUnread) : null}
    {actions.onExtra ? <>
      {item(t("在新会话中继续"), () => actions.onExtra!("fork"))}
      {item(t("在访达中打开工作目录"), () => actions.onExtra!("openDir"))}
      {item(t("复制工作目录"), () => actions.onExtra!("copyPath"))}
      {item(t("复制标题"), () => actions.onExtra!("copyTitle"))}
      {item(t("复制会话 ID"), () => actions.onExtra!("copyId"))}
    </> : null}
    {onPutInDock ? item(t("放进坞里"), onPutInDock) : null}
    {actions.onDelete ? item(t("删除"), actions.onDelete, true) : null}
  </>
}

/** 脱离滚动容器，并按渲染后的真实尺寸收进视口；短窗口通过内部滚动保持每项可达。 */
export function SessionMenu({ label, position, onClose, restoreFocus, onContextMenu, children }: {
  label: string
  position: { top: number; left: number }
  onClose: () => void
  restoreFocus: () => void
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined
  children: ReactNode
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState(position)
  const callbacks = useRef({ onClose, restoreFocus })
  callbacks.current = { onClose, restoreFocus }
  useLayoutEffect(() => {
    const place = () => {
      const rect = menu.current?.getBoundingClientRect()
      if (rect) setPlaced({ top: Math.max(8, Math.min(position.top, window.innerHeight - (menu.current?.offsetHeight || rect.height) - 8)), left: Math.max(8, Math.min(position.left, window.innerWidth - (menu.current?.offsetWidth || rect.width) - 8)) })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [position.top, position.left])
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        callbacks.current.onClose()
        callbacks.current.restoreFocus()
      }
    }
    document.addEventListener("keydown", key)
    return () => document.removeEventListener("keydown", key)
  }, [])
  return createPortal(<>
    <div className="menu-scrim" onClick={onClose} onContextMenu={e => { e.preventDefault(); if (onContextMenu) onContextMenu(e); else onClose() }} />
    <div ref={menu} className="row-menu session-context-menu" role="menu" aria-label={label} style={placed} onKeyDown={e => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
      e.preventDefault()
      const items = [...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
      const index = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }}>{children}</div>
  </>, document.body)
}

/** Esc 与 Enter 后忽略随卸载发生的 blur，避免取消变成保存或重复提交。 */
export function SessionRenameInput({ title, initialValue, onSubmit, onCancel }: {
  title: string
  initialValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const finished = useRef(false)
  const submit = () => { if (!finished.current) { finished.current = true; onSubmit(value) } }
  return <input className="control sess-rename" autoFocus value={value} aria-label={tf("重命名会话：{0}", title)} onChange={e => setValue(e.target.value)} onKeyDown={e => {
    if (在组词(e)) return
    if (e.key === "Enter") { e.preventDefault(); submit() }
    else if (e.key === "Escape") { e.preventDefault(); finished.current = true; onCancel() }
  }} onBlur={submit} />
}
