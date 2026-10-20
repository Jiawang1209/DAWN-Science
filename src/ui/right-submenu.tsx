import { useLayoutEffect, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { t } from "./i18n/index.js"

/** 右向二级菜单独立于可滚动的主菜单；碰到右边界时将主菜单左移。 */
export function RightSubmenu({ anchor, panelRef, onClose, children, focusOnOpen = true, onMouseEnter, onMouseLeave }: {
  anchor: HTMLElement | null
  panelRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  children: ReactNode
  focusOnOpen?: boolean
  onMouseEnter?: (() => void) | undefined
  onMouseLeave?: (() => void) | undefined
}) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!anchor || !panel) return
    const parent = anchor.closest<HTMLElement>(".attach-menu")
    const originalTranslate = parent?.style.translate ?? ""
    let active = true
    const place = () => {
      if (!active) return
      if (parent) parent.style.translate = originalTranslate
      const margin = 8
      const gap = 6
      const main = (parent ?? anchor).getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const shift = Math.max(0, main.right + gap + width + margin - window.innerWidth)
      if (parent && shift > 0) parent.style.translate = `${-Math.min(shift, Math.max(0, main.left - margin))}px 0`
      const moved = (parent ?? anchor).getBoundingClientRect()
      panel.style.left = `${moved.right + gap}px`
      panel.style.top = `${Math.max(margin, Math.min(anchor.getBoundingClientRect().top, window.innerHeight - height - margin))}px`
    }
    place()
    if (focusOnOpen) panel.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled), [role^="menuitem"]:not(:disabled)')?.focus()
    const frame = requestAnimationFrame(place)
    // 主菜单的入场缩放结束后重新取真实边界。
    void Promise.all(parent?.getAnimations?.().map(animation => animation.finished.catch(() => {})) ?? []).then(place)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      active = false
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      if (parent) parent.style.translate = originalTranslate
    }
  }, [anchor, panelRef, focusOnOpen])

  return createPortal(
    <div ref={panelRef} className="agent-menu enhance-menu enhance-flyout" data-composer-side={anchor?.closest<HTMLElement>(".composer-add-menu")?.dataset.composerSide} role="menu" aria-label={t("选档位")}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={e => {
        e.stopPropagation()
        if (["Escape", "ArrowLeft", "Tab"].includes(e.key)) {
          if (e.key !== "Tab") e.preventDefault()
          onClose()
          return
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
        e.preventDefault()
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'))
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (current + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }}>
      {children}
    </div>, document.body,
  )
}
