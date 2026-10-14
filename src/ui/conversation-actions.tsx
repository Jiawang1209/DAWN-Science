import { useEffect, useRef, useState, type RefObject } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 在组词 } from "./ime.js"

/** 当前对话的低频动作，避免与全局搜索重复使用放大镜入口。 */
export function ConversationActions({ title, triggerRef, onFind, onExport, exporting }: {
  title: string
  triggerRef: RefObject<HTMLButtonElement | null>
  onFind: () => void
  onExport?: (() => void) | undefined
  exporting?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const item = useRef<HTMLButtonElement>(null)
  const openAtEnd = useRef(false)
  useEffect(() => {
    if (!open) return
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    if (openAtEnd.current && buttons?.length) buttons[buttons.length - 1]?.focus()
    else item.current?.focus()
    openAtEnd.current = false
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", outside)
    return () => document.removeEventListener("mousedown", outside)
  }, [open])
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘ F" : "Ctrl F"
  return <div className="conv-actions" ref={root} onKeyDown={e => {
    if (在组词(e)) return
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); triggerRef.current?.focus() }
    if (e.key === "Tab") { setOpen(false); triggerRef.current?.focus() }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || open && (e.key === "Home" || e.key === "End")) {
      e.preventDefault()
      if (!open) { openAtEnd.current = e.key === "ArrowUp"; setOpen(true); return }
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }}>
    <Button ref={triggerRef} variant="ghost" size="icon" className="conv-actions-trigger"
      aria-label={tf("会话操作：{0}", title)} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>⋯</Button>
    {open ? <div className="menu conv-actions-menu" role="menu" aria-label={tf("会话操作：{0}", title)}>
      <Button ref={item} variant="ghost" size="sm" role="menuitem" onClick={() => { setOpen(false); onFind() }}>
        {t("查找当前对话")}<kbd>{shortcut}</kbd>
      </Button>
      {onExport ? <Button variant="ghost" size="sm" role="menuitem" disabled={exporting}
        onClick={() => { setOpen(false); triggerRef.current?.focus(); onExport() }}>{t("导出对话")}</Button> : null}
    </div> : null}
  </div>
}
