import type { Terminal } from '@xterm/xterm'
import type { TerminalPicture } from './terminal-image-decorations.js'
import { t, tf } from './i18n/index.js'

interface Placement { id: string; row: number; col: number; width: number; height: number }
type Preview = Pick<TerminalPicture, 'name' | 'thumbnail'>
interface VisibleImage { placement: Placement; button: HTMLButtonElement }
const prefix = 'dawn-viewport;'
const placementFields = new Set(['id', 'row', 'col', 'width', 'height'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseFrame(payload: string, cols: number, rows: number): Placement[] | undefined {
  let frame: unknown
  try { frame = JSON.parse(payload) } catch { return }
  if (!frame || typeof frame !== 'object' || Object.keys(frame).length !== 1 || !('images' in frame) || !Array.isArray(frame.images) || frame.images.length > 24) return
  const images: Placement[] = []
  for (const image of frame.images) {
    if (!image || typeof image !== 'object' || Object.keys(image).some(key => !placementFields.has(key))) return
    const { id, row, col, width, height } = image as Record<string, unknown>
    if (typeof id !== 'string' || !uuid.test(id)) return
    if (![row, col, width, height].every(value => typeof value === 'number' && Number.isSafeInteger(value))) return
    const position = { id, row, col, width, height } as Placement
    if (position.row < 0 || position.col < 0 || position.width <= 0 || position.height <= 0 ||
      position.row + position.height > rows || position.col + position.width > cols) return
    images.push(position)
  }
  return images
}

/** Alternate-screen images belong to the latest viewport frame, never scrollback. */
export function terminalViewportImages(term: Terminal, read: (id: string) => Promise<TerminalPicture>, open: (image: TerminalPicture) => void) {
  const screen = term.element?.querySelector<HTMLElement>('.xterm-screen')
  let disposed = false
  const visible = new Map<string, VisibleImage>()
  // Only previews for currently visible IDs survive a frame. A resolved promise
  // contains no original; full images are fetched again only when clicked.
  const previews = new Map<string, Promise<Preview>>()
  const alternate = () => term.buffer.active.type === 'alternate'
  const clear = () => {
    for (const { button } of visible.values()) { button.onclick = null; button.remove() }
    visible.clear(); previews.clear()
  }
  const layout = () => {
    if (disposed || !screen) return
    if (!alternate()) { clear(); return }
    const bounds = screen.getBoundingClientRect()
    const cellWidth = (screen.clientWidth || bounds.width) / term.cols
    const cellHeight = (screen.clientHeight || bounds.height) / term.rows
    for (const { button, placement } of visible.values()) {
      button.hidden = !(cellWidth > 0 && cellHeight > 0)
      button.style.display = button.hidden ? 'none' : ''
      button.style.left = `${placement.col * cellWidth}px`
      button.style.top = `${placement.row * cellHeight}px`
      button.style.width = `${placement.width * cellWidth}px`
      button.style.height = `${placement.height * cellHeight}px`
    }
  }
  // The legacy renderer can also be used before a Terminal has been opened.
  const listeners = screen ? [term.onRender(layout), term.onResize(clear), term.buffer.onBufferChange(() => { if (!alternate()) clear() })] : []
  return {
    handle(value: string) {
      if (!value.startsWith(prefix)) return false
      if (disposed || !screen || !alternate()) return true
      const placements = parseFrame(value.slice(prefix.length), term.cols, term.rows)
      if (!placements) return true
      const next = new Set<string>(), activeIds = new Set(placements.map(image => image.id))
      for (const id of previews.keys()) if (!activeIds.has(id)) previews.delete(id)
      placements.forEach((placement, index) => {
        const key = `${index}:${placement.id}:${placement.row}:${placement.col}:${placement.width}:${placement.height}`
        next.add(key)
        if (visible.has(key)) return
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'terminal-inline-image terminal-viewport-image'
        button.textContent = t('正在载入图片…'); button.disabled = true
        Object.assign(button.style, { position: 'absolute', zIndex: '7' })
        // Mouse reporting belongs to the TUI; opening an image must not also
        // send it a press/release. Wheel events still reach terminal scrolling.
        button.onmousedown = event => event.stopPropagation()
        button.onmouseup = event => event.stopPropagation()
        const entry = { placement, button }
        visible.set(key, entry); screen.append(button)
        const current = () => !disposed && alternate() && visible.get(key) === entry
        const unavailable = (error: unknown) => {
          if (!current()) return
          button.textContent = error instanceof Error ? error.message : String(error)
          button.disabled = true
        }
        let preview = previews.get(placement.id)
        if (!preview) {
          preview = read(placement.id).then(({ name, thumbnail }) => ({ name, thumbnail }))
          previews.set(placement.id, preview)
        }
        void preview.then(({ name, thumbnail }) => {
          if (!current()) return
          button.setAttribute('aria-label', tf('放大 {0}', name)); button.title = tf('放大 {0}', name)
          const img = document.createElement('img'); img.src = thumbnail; img.alt = name; img.draggable = false
          button.replaceChildren(img); button.disabled = false
          button.onclick = event => {
            event.preventDefault(); event.stopPropagation()
            if (!current() || button.disabled) return
            button.disabled = true
            void read(placement.id).then(image => {
              if (!current()) return
              button.disabled = false; open(image)
            }).catch(unavailable)
          }
        }).catch(unavailable)
      })
      for (const [key, { button }] of visible) {
        if (next.has(key)) continue
        button.onclick = null; button.remove(); visible.delete(key)
      }
      layout()
      return true
    },
    dispose() {
      disposed = true; clear()
      for (const listener of listeners) listener.dispose()
    },
  }
}
