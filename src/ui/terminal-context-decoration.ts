import type { Terminal } from '@xterm/xterm'
export interface ContextAnchor { element: HTMLElement; revision: number }
interface Placement { col: number; row: number; width: number; revision: number }

/** Terminal bytes describe geometry only; the button reads its data from the bound session. */
export function terminalContextDecoration(term: Terminal, update: (anchor: ContextAnchor | undefined) => void) {
  const screen = term.element?.querySelector<HTMLElement>('.xterm-screen')
  let element: HTMLDivElement | undefined, placement: Placement | undefined, disposed = false
  const clear = () => { const had = !!element; element?.remove(); element = undefined; placement = undefined; if (had) update(undefined) }
  const layout = () => {
    if (!element || !placement || !screen) return
    if (term.buffer.active.type !== 'alternate') { clear(); return }
    const bounds = screen.getBoundingClientRect(), cw = (screen.clientWidth || bounds.width) / term.cols, ch = (screen.clientHeight || bounds.height) / term.rows
    Object.assign(element.style, { left: `${placement.col * cw}px`, top: `${placement.row * ch}px`, width: `${placement.width * cw}px`, height: `${ch}px` })
    const popWidth = Math.max(0, Math.min(320, bounds.width - 16)), right = bounds.left + (placement.col + placement.width) * cw
    element.style.setProperty('--terminal-context-pop-left', `${Math.max(bounds.left + 8, Math.min(right - popWidth, bounds.right - popWidth - 8))}px`)
    element.style.setProperty('--terminal-context-pop-bottom', `${innerHeight - bounds.top - placement.row * ch + 8}px`)
    element.style.setProperty('--terminal-context-pop-width', `${popWidth}px`)
  }
  const parser = term.parser.registerOscHandler(777, value => {
    if (!value.startsWith('dawn-context;')) return false
    if (disposed || !screen || term.buffer.active.type !== 'alternate') return true
    let next: unknown
    try { next = JSON.parse(value.slice('dawn-context;'.length)) } catch { return true }
    if (next === null) { clear(); return true }
    if (!next || typeof next !== 'object' || Object.keys(next).length !== 4 || Object.keys(next).some(k => !['col', 'row', 'width', 'revision'].includes(k))) return true
    const p = next as Placement
    if (![p.col, p.row, p.width, p.revision].every(Number.isSafeInteger) || p.col < 0 || p.row !== term.rows - 1 || p.width <= 0 || p.col + p.width > term.cols || p.revision < 0) return true
    const changed = !placement || Object.keys(p).some(k => p[k as keyof Placement] !== placement![k as keyof Placement])
    placement = p
    if (!element) {
      element = document.createElement('div'); element.className = 'terminal-context-anchor'
      for (const name of ['mousedown', 'mouseup', 'click']) element.addEventListener(name, event => event.stopPropagation())
      screen.append(element)
    }
    layout(); if (changed) update({ element, revision: p.revision })
    return true
  })
  const listeners = [term.onRender(layout), term.onResize(clear), term.buffer.onBufferChange(() => { if (term.buffer.active.type !== 'alternate') clear() })]
  return () => { disposed = true; clear(); parser.dispose(); for (const listener of listeners) listener.dispose() }
}
