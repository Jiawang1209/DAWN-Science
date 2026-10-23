import { expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { terminalImageDecorations, type TerminalPicture } from '../../src/ui/terminal-image-decorations.js'

const id = '58b52380-f46a-4a64-8450-f66a696571c4'
const otherId = 'c73979c6-5afd-4623-b0da-737a7b023deb'
const picture = { id, name: 'plot.png', thumbnail: 'data:image/png;base64,thumb', dataUrl: 'data:image/png;base64,original' }
const placement = { id, row: 2, col: 3, width: 12, height: 7 }
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

function fixture(read = vi.fn<(id: string) => Promise<TerminalPicture>>().mockResolvedValue(picture)) {
  let parse!: (value: string) => boolean
  const handlers = { render: new Set<() => void>(), resize: new Set<() => void>(), buffer: new Set<() => void>() }
  const event = (name: keyof typeof handlers) => (callback: () => void) => {
    handlers[name].add(callback)
    return { dispose: () => handlers[name].delete(callback) }
  }
  const element = document.createElement('div'), screen = document.createElement('div')
  screen.className = 'xterm-screen'; element.append(screen)
  let screenWidth = 800, screenHeight = 480
  screen.getBoundingClientRect = () => ({ width: screenWidth, height: screenHeight } as DOMRect)
  const active = { type: 'alternate' }
  const term = {
    element, cols: 80, rows: 24, buffer: { active, onBufferChange: event('buffer') },
    onRender: event('render'), onResize: event('resize'),
    parser: { registerOscHandler: (_: number, receive: typeof parse) => { parse = receive; return { dispose: vi.fn() } } },
    registerMarker: vi.fn(), registerDecoration: vi.fn(),
  } as unknown as Terminal
  const open = vi.fn(), dispose = terminalImageDecorations(term, read, open)
  const emit = (name: keyof typeof handlers) => { for (const handler of handlers[name]) handler() }
  return { term, screen, active, read, open, dispose, handlers, parse: (value: string) => parse(value),
    frame: (images: unknown = [placement]) => parse('dawn-viewport;' + JSON.stringify({ images })), emit,
    dimensions: (width: number, height: number) => { screenWidth = width; screenHeight = height },
  }
}

it('mounts an alternate-buffer image in terminal cell coordinates and updates screen measurements on render', async () => {
  const f = fixture()
  expect(f.frame()).toBe(true)
  await settle()
  const button = f.screen.querySelector('button')!
  expect(button).not.toBeNull()
  expect(button.style.position).toBe('absolute')
  expect(button.style.left).toBe('30px'); expect(button.style.top).toBe('40px')
  expect(button.style.width).toBe('120px'); expect(button.style.height).toBe('140px')
  expect(button.querySelector('img')!.getAttribute('src')).toBe(picture.thumbnail)
  f.dimensions(640, 240); f.emit('render')
  expect(button.style.left).toBe('24px'); expect(button.style.top).toBe('20px')
  expect(button.style.width).toBe('96px'); expect(button.style.height).toBe('70px')
  f.dispose()
})

it('keeps thumbnail mouse press and release out of the terminal while wheel events bubble', async () => {
  const f = fixture()
  const press = vi.fn(), release = vi.fn(), wheel = vi.fn()
  f.screen.addEventListener('mousedown', press)
  f.screen.addEventListener('mouseup', release)
  f.screen.addEventListener('wheel', wheel)
  f.frame(); await settle()
  const img = f.screen.querySelector('img')!
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true })
  img.dispatchEvent(down); img.dispatchEvent(up)
  img.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }))
  expect(press).not.toHaveBeenCalled()
  expect(release).not.toHaveBeenCalled()
  expect(wheel).toHaveBeenCalledTimes(1)
  expect(down.defaultPrevented).toBe(false); expect(up.defaultPrevented).toBe(false)
  f.screen.querySelector('button')!.click(); await settle()
  expect(f.open).toHaveBeenCalledWith(picture)
  f.dispose()
})

it.each([[0, 480], [800, 0], [0, 0]])('explicitly hides non-measurable images at %dx%d and restores display after layout', async (width, height) => {
  const f = fixture()
  f.frame(); await settle()
  const button = f.screen.querySelector('button')!
  expect(button.style.display).toBe('')
  f.dimensions(width, height); f.emit('render')
  // An inline rule must override the existing thumbnail class's display:flex.
  expect(button.style.display).toBe('none')
  expect(button.hidden).toBe(true)
  f.dimensions(800, 480); f.emit('render')
  expect(button.style.display).toBe('')
  expect(button.hidden).toBe(false)
  expect(button.style.width).toBe('120px'); expect(button.style.height).toBe('140px')
  expect(f.read).toHaveBeenCalledTimes(1)
  f.dispose()
})

it('handles viewport frames only in the alternate buffer, leaving normal-buffer decorations alone', async () => {
  const f = fixture()
  f.active.type = 'normal'
  expect(f.frame()).toBe(true)
  await settle()
  expect(f.read).not.toHaveBeenCalled(); expect(f.screen.children).toHaveLength(0)
  expect(f.parse('other;message')).toBe(false)
  f.dispose()
})

it.each([
  'not-json', 'null', '{}', '{"images":null}', '{"images":"bad"}',
  JSON.stringify({ images: Array.from({ length: 25 }, () => placement) }),
  ...[
    { id: '../unsafe' }, { id: '------------------------------------' }, { row: -1 }, { col: -1 },
    { row: 0.2 }, { col: '2' }, { width: 0 }, { height: -1 }, { width: 1.5 },
    { row: 23, height: 2 }, { col: 79, width: 2 }, { row: Number.MAX_SAFE_INTEGER },
  ].map(patch => JSON.stringify({ images: [{ ...placement, ...patch }] })),
  JSON.stringify({ images: [placement, null] }),
])('ignores unsafe or malformed frame %s without replacing the current images', async payload => {
  const f = fixture()
  f.frame(); await settle()
  const button = f.screen.querySelector('button')
  expect(f.parse('dawn-viewport;' + payload)).toBe(true)
  await settle()
  expect(f.screen.querySelector('button')).toBe(button)
  expect(f.read).toHaveBeenCalledTimes(1)
  f.dispose()
})

it.each([
  { images: [], token: 'unexpected' },
  { images: [{ ...placement, id: otherId, path: '/untrusted/image.png' }] },
  { images: [{ ...placement, id: otherId, dataUrl: 'data:image/png;base64,unexpected' }] },
  { images: [{ ...placement, id: otherId, unknown: true }] },
  { images: [{ ...placement, id: otherId }, { ...placement, path: '/untrusted/image.png' }] },
])('rejects keys outside the IDs-and-position schema atomically: %j', async frame => {
  const f = fixture()
  f.frame(); await settle()
  const button = f.screen.querySelector('button')
  expect(f.parse('dawn-viewport;' + JSON.stringify(frame))).toBe(true)
  await settle()
  expect(f.screen.querySelectorAll('button')).toHaveLength(1)
  expect(f.screen.querySelector('button')).toBe(button)
  expect(f.read).toHaveBeenCalledTimes(1)
  f.dispose()
})

it('preserves a pending thumbnail when rejecting an unexpected frame field', async () => {
  let finish!: (value: TerminalPicture) => void
  const f = fixture(vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })))
  f.frame()
  const button = f.screen.querySelector('button')
  f.parse('dawn-viewport;' + JSON.stringify({ images: [], token: 'unexpected' }))
  finish(picture); await settle()
  expect(f.screen.querySelector('button')).toBe(button)
  expect(f.screen.querySelector('img')).not.toBeNull()
  expect(f.read).toHaveBeenCalledTimes(1)
  f.dispose()
})

it('accepts edge-aligned cells and up to 24 placements, then clears on an empty frame', async () => {
  const f = fixture()
  f.frame(Array.from({ length: 24 }, (_, row) => ({ id, row, col: 79, width: 1, height: 1 })))
  await settle()
  expect(f.screen.querySelectorAll('button')).toHaveLength(24)
  expect(f.read).toHaveBeenCalledTimes(1)
  f.frame([])
  expect(f.screen.children).toHaveLength(0)
  f.dispose()
})

it('reuses active thumbnails across repeated frames and scroll placements, but drops offscreen cached images', async () => {
  const f = fixture()
  f.frame(); await settle()
  const first = f.screen.querySelector('button')
  for (let i = 0; i < 10; i++) { f.frame(); f.emit('render') }
  expect(f.screen.querySelector('button')).toBe(first)
  expect(f.read).toHaveBeenCalledTimes(1)
  f.frame([{ ...placement, row: 1 }]); await settle()
  expect(first!.parentNode).toBeNull()
  expect(f.screen.querySelector('button')!.style.top).toBe('20px')
  expect(f.read).toHaveBeenCalledTimes(1)
  f.frame([]); f.frame(); await settle()
  expect(f.read).toHaveBeenCalledTimes(2)
  f.dispose()
})

it('clears placements and pending thumbnails on resize until a new frame arrives', async () => {
  let finish!: (value: TerminalPicture) => void
  const f = fixture(vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(picture))
  f.frame(); f.emit('resize'); finish(picture); await settle(); f.emit('render')
  expect(f.screen.children).toHaveLength(0)
  f.frame(); await settle()
  expect(f.screen.querySelector('img')).not.toBeNull()
  expect(f.read).toHaveBeenCalledTimes(2)
  f.dispose()
})

it('clears on normal-buffer return and does not restore an old frame on reentry', async () => {
  const f = fixture()
  f.frame(); await settle()
  expect(f.screen.querySelector('img')).not.toBeNull()
  f.active.type = 'normal'; f.emit('buffer')
  expect(f.screen.children).toHaveLength(0)
  f.active.type = 'alternate'; f.emit('buffer'); f.emit('render')
  expect(f.screen.children).toHaveLength(0)
  f.dispose()
})

it('rereads the current original on click and reports the host cache error accurately', async () => {
  const current = { ...picture, dataUrl: 'data:image/png;base64,current' }
  const f = fixture(vi.fn().mockResolvedValueOnce(picture).mockResolvedValueOnce(current).mockRejectedValueOnce(new Error('图片已不在缓存中')))
  f.frame(); await settle()
  const button = f.screen.querySelector('button')!
  button.click(); await settle()
  expect(f.open).toHaveBeenCalledWith(current)
  button.click(); await settle()
  expect(button.textContent).toContain('图片已不在缓存中')
  expect(button.disabled).toBe(true)
  expect(f.read).toHaveBeenCalledTimes(3)
  expect(f.open).toHaveBeenCalledTimes(1)
  f.dispose()
})

it('renders a thumbnail read failure without opening any image', async () => {
  const f = fixture(vi.fn().mockRejectedValue(new Error('无法读取图片')))
  f.frame(); await settle()
  expect(f.screen.textContent).toContain('无法读取图片')
  expect(f.screen.querySelector('button')!.disabled).toBe(true)
  expect(f.open).not.toHaveBeenCalled()
  f.dispose()
})

it.each(['clear', 'replace', 'move', 'resize', 'buffer', 'dispose'])('ignores late reads and detached clicks after %s', async action => {
  let finish!: (value: TerminalPicture) => void
  const f = fixture(vi.fn().mockResolvedValueOnce(picture).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(picture))
  f.frame(); await settle()
  const old = f.screen.querySelector('button')!
  const click = old.onclick!
  old.click()
  if (action === 'clear') f.frame([])
  if (action === 'replace') f.frame([{ ...placement, id: otherId }])
  if (action === 'move') f.frame([{ ...placement, row: 1 }])
  if (action === 'resize') f.emit('resize')
  if (action === 'buffer') { f.active.type = 'normal'; f.emit('buffer') }
  if (action === 'dispose') f.dispose()
  finish(picture); await settle()
  expect(f.open).not.toHaveBeenCalled()
  const reads = f.read.mock.calls.length
  click.call(old, new MouseEvent('click') as PointerEvent)
  await settle()
  expect(f.read).toHaveBeenCalledTimes(reads)
  f.dispose()
  expect(f.handlers.render.size + f.handlers.resize.size + f.handlers.buffer.size).toBe(0)
})

it('does not revive a removed placement when its thumbnail resolves late', async () => {
  let finish!: (value: TerminalPicture) => void
  const f = fixture(vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })))
  f.frame(); f.frame([]); finish(picture); await settle()
  expect(f.screen.children).toHaveLength(0)
  f.dispose()
})
