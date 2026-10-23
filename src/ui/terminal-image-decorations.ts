import type { Terminal } from '@xterm/xterm'
import { t, tf } from './i18n/index.js'
import { terminalViewportImages } from './terminal-viewport-images.js'

export interface TerminalPicture { id: string; name: string; thumbnail: string; dataUrl: string }

/** Only a scoped opaque ID is interpreted; image data never enters the terminal byte buffer. */
export function terminalImageDecorations(term: Terminal, read: (id: string) => Promise<TerminalPicture>, open: (image: TerminalPicture) => void) {
  let disposed = false
  const viewport = terminalViewportImages(term, read, open)
  const decorations = new Set<{ dispose(): void }>()
  const parser = term.parser.registerOscHandler(777, value => {
    if (viewport.handle(value)) return true
    const match = /^dawn-image;([0-9a-f-]{36})$/.exec(value)
    if (!match) return false
    const marker = term.registerMarker(0)
    if (!marker) return true
    const decoration = term.registerDecoration({ marker, x: 0, width: Math.max(1, Math.min(36, term.cols - 1)), height: 7, layer: 'top' })
    if (!decoration) { marker.dispose(); return true }
    decorations.add(decoration)
    const button = document.createElement('button')
    button.type = 'button'; button.className = 'terminal-inline-image'; button.textContent = t("正在载入图片…")
    decoration.onRender(element => { if (button.parentNode !== element) element.replaceChildren(button) })
    decoration.onDispose(() => { decorations.delete(decoration); marker.dispose() })
    const unavailable = (error: unknown) => {
      if (!disposed && !marker.isDisposed) { button.textContent = error instanceof Error ? error.message : String(error); button.disabled = true }
    }
    // Keep only the small preview with the scrollback decoration. The host owns
    // the bounded original cache; re-read it when opening, including eviction.
    void read(match[1]!).then(({ name, thumbnail }) => {
      if (disposed || marker.isDisposed) return
      button.setAttribute('aria-label', tf("放大 {0}", name))
      button.title = tf("放大 {0}", name)
      const img = document.createElement('img'); img.src = thumbnail; img.alt = name
      img.draggable = false; button.replaceChildren(img)
      button.onclick = event => {
        event.preventDefault(); event.stopPropagation(); button.disabled = true
        void read(match[1]!).then(image => {
          if (disposed || marker.isDisposed) return
          button.disabled = false; open(image)
        }).catch(unavailable)
      }
    }).catch(unavailable)
    return true
  })
  return () => { disposed = true; viewport.dispose(); parser.dispose(); for (const decoration of decorations) decoration.dispose(); decorations.clear() }
}
