import { expect, it, vi } from 'vitest'
import { terminalContextDecoration } from '../../src/ui/terminal-context-decoration.js'

function fixture() {
  const screen = document.createElement('div'), root = document.createElement('div'); root.append(screen); document.body.append(root); screen.className = 'xterm-screen'
  Object.defineProperties(screen, { clientWidth: { value: 600 }, clientHeight: { value: 300 } })
  screen.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 300, width: 600, height: 300, toJSON() {} })
  let parse = (_: string) => false
  const handlers: Record<string, () => void> = {}, current = { type: 'alternate' }
  const listen = (name: string, fn: () => void) => { handlers[name] = fn; return { dispose() {} } }
  const term = { element: root, cols: 60, rows: 30, buffer: { active: current, onBufferChange: (fn: () => void) => listen('buffer', fn) },
    onRender: (fn: () => void) => listen('render', fn), onResize: (fn: () => void) => listen('resize', fn),
    parser: { registerOscHandler: (_: number, fn: typeof parse) => { parse = fn; return { dispose() {} } } } }
  const update = vi.fn(), dispose = terminalContextDecoration(term as never, update)
  return { screen, current, handlers, update, dispose, frame: (value: unknown) => parse('dawn-context;' + JSON.stringify(value)) }
}
it('anchors the native button in the reserved footer cells without emitting terminal input', () => {
  const f = fixture(); f.frame({ col: 47, row: 29, width: 10, revision: 1 })
  const anchor = f.screen.querySelector<HTMLElement>('.terminal-context-anchor')!
  expect(anchor).not.toBeNull(); expect(anchor.style.left).toBe('470px'); expect(anchor.style.top).toBe('290px')
  expect(f.update).toHaveBeenLastCalledWith({ element: anchor, revision: 1 })
  f.frame({ col: 47, row: 29, width: 10, revision: 1 }); expect(f.update).toHaveBeenCalledTimes(1)
  f.frame({ col: 47, row: 29, width: 10, revision: 2 }); expect(f.update).toHaveBeenCalledTimes(2)
  f.dispose(); expect(f.screen.children).toHaveLength(0)
})
it('rejects invalid geometry and clears stale controls on resize, Shell and explicit removal', () => {
  const f = fixture()
  for (const value of [{ col: -1, row: 29, width: 10, revision: 1 }, { col: 50, row: 30, width: 10, revision: 1 }, { col: 51, row: 29, width: 10, revision: 1 }, { col: 1, row: 2, width: 10, revision: 1, model: 'untrusted' }]) f.frame(value)
  expect(f.update).not.toHaveBeenCalled()
  f.frame({ col: 47, row: 29, width: 10, revision: 1 }); f.handlers.resize!(); expect(f.update).toHaveBeenLastCalledWith(undefined)
  f.frame({ col: 47, row: 29, width: 10, revision: 2 }); f.current.type = 'normal'; f.handlers.buffer!(); expect(f.screen.children).toHaveLength(0)
  f.current.type = 'alternate'; f.frame({ col: 47, row: 29, width: 10, revision: 3 }); f.frame(null); expect(f.screen.children).toHaveLength(0)
  f.dispose()
})
