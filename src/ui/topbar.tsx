import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Delegated hints preserve the header's flex layout and portal out of scrolling tabs. */
export function Topbar({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const id = useId()
  const [owner, setOwner] = useState<HTMLButtonElement>()
  const [position, setPosition] = useState({ left: 8, top: 0 })
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined }, [])
  const hide = useCallback(() => { cancel(); setOwner(undefined) }, [cancel])
  const target = useCallback((node: EventTarget | null) => {
    const button = node instanceof Element ? node.closest<HTMLButtonElement>('button[data-tooltip]') : null
    return button && root.current?.contains(button) && !button.disabled && button.getAttribute('data-tooltip')?.trim() ? button : undefined
  }, [])
  const show = useCallback((button: HTMLButtonElement) => {
    cancel()
    if (active && button.isConnected && !button.disabled) setOwner(button)
  }, [active, cancel])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    document.addEventListener('keydown', escape)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      cancel()
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [cancel, hide])
  useEffect(() => { if (!active) hide() }, [active, hide])
  useLayoutEffect(() => {
    if (!owner || !active || !tip.current) return
    const button = owner.getBoundingClientRect(), box = tip.current.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(button.left + button.width / 2 - box.width / 2, window.innerWidth - box.width - 8)),
      top: Math.max(8, button.bottom + 6 + box.height <= window.innerHeight - 8 ? button.bottom + 6 : button.top - box.height - 6),
    })
    const descriptions = owner.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
    owner.setAttribute('aria-describedby', [...descriptions, id].join(' '))
    return () => {
      const remaining = owner.getAttribute('aria-describedby')?.split(/\s+/).filter(value => value && value !== id) ?? []
      if (remaining.length) owner.setAttribute('aria-describedby', remaining.join(' '))
      else owner.removeAttribute('aria-describedby')
    }
  }, [owner, active, id])
  // Native delegation also sees controls rendered here through a React portal.
  useEffect(() => {
    const header = root.current
    if (!header || !active) return
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const button = target(event.target)
      if (button && button === target(event.relatedTarget)) return
      hide()
      if (button) timer.current = setTimeout(() => show(button), 250)
    }
    const out = (event: PointerEvent) => { if (target(event.target) !== target(event.relatedTarget)) hide() }
    const focus = (event: FocusEvent) => { const button = target(event.target); if (button) show(button); else hide() }
    header.addEventListener('pointerover', over)
    header.addEventListener('pointerout', out)
    header.addEventListener('focus', focus, true)
    header.addEventListener('blur', hide, true)
    header.addEventListener('click', hide, true)
    header.addEventListener('contextmenu', hide, true)
    header.addEventListener('pointerdown', hide, true)
    return () => {
      cancel()
      header.removeEventListener('pointerover', over)
      header.removeEventListener('pointerout', out)
      header.removeEventListener('focus', focus, true)
      header.removeEventListener('blur', hide, true)
      header.removeEventListener('click', hide, true)
      header.removeEventListener('contextmenu', hide, true)
      header.removeEventListener('pointerdown', hide, true)
    }
  }, [active, cancel, hide, show, target])
  return <div ref={root} className="topbar">
    {children}
    {active && owner ? createPortal(<span ref={tip} id={id} role="tooltip" className="topbar-tooltip" style={position}>{owner.getAttribute('data-tooltip')}</span>, document.body) : null}
  </div>
}
