import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "./primitives.js"
import { 新建会话图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"

/** 项目行直接新建会话；管理菜单沿用原删除确认流程。 */
export function ProjectActions({ name, onNew, onDelete }: {
  name: string
  onNew?: (() => void) | undefined
  onDelete?: (() => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect()
    const bounds = menu.current.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - bounds.height - 8)),
    })
    menu.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false)
    }
    const close = () => setOpen(false)
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) close() }
    document.addEventListener("pointerdown", outside)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", scroll, true)
    return () => {
      document.removeEventListener("pointerdown", outside)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", scroll, true)
    }
  }, [open])
  if (!onNew && !onDelete) return null
  return <div className="row-actions project-actions">
    {onNew ? <Button variant="ghost" size="inline" className="project-new" aria-label={tf("在「{0}」里开一段新对话", name)} onClick={() => { setOpen(false); onNew() }}><新建会话图标 /></Button> : null}
    {onDelete ? <Button ref={trigger} variant="ghost" size="row-action" className="row-more" aria-label={tf("项目操作：{0}", name)} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(!open)} onKeyDown={e => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true) }
      }}>⋯</Button> : null}
    {open && onDelete ? createPortal(<div ref={menu} className="project-actions-menu" role="menu" aria-label={tf("项目操作：{0}", name)} style={position}
      onKeyDown={e => {
        if (e.key === "Escape" || e.key === "Tab") {
          if (e.key === "Escape") e.preventDefault()
          setOpen(false); trigger.current?.focus()
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault()
          const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          items[(index + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus()
        }
      }}>
      {onDelete ? <Button variant="ghost" size="sm" role="menuitem" className="menu-danger" aria-label={tf("删除项目：{0}", name)} onClick={() => { setOpen(false); onDelete() }}>{t("移除项目")}</Button> : null}
    </div>, document.body) : null}
  </div>
}
