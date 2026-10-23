import { expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { terminalImageDecorations } from '../../src/ui/terminal-image-decorations.js'

const id = '58b52380-f46a-4a64-8450-f66a696571c4'
const picture = { id, name: 'plot.png', thumbnail: 'data:image/png;base64,thumb', dataUrl: 'data:image/png;base64,original' }

function fixture(read: ReturnType<typeof vi.fn>) {
  let parse!: (value: string) => boolean
  const element = document.createElement('div'), marker = { isDisposed: false, dispose() { this.isDisposed = true } }
  let disposed = () => {}
  const term = {
    cols: 80,
    parser: { registerOscHandler: (_: number, receive: typeof parse) => { parse = receive; return { dispose() {} } } },
    registerMarker: () => marker,
    registerDecoration: () => ({ onRender: (render: (element: HTMLElement) => void) => render(element), onDispose: (callback: () => void) => { disposed = callback }, dispose: () => disposed() }),
  } as unknown as Terminal
  const open = vi.fn(), dispose = terminalImageDecorations(term, read as never, open)
  parse('dawn-image;' + id)
  return { element, open, dispose }
}

it('reads the current full image only when opening a thumbnail, rather than retaining an old original', async () => {
  const current = { ...picture, dataUrl: 'data:image/png;base64,current' }
  const read = vi.fn().mockResolvedValueOnce(picture).mockResolvedValueOnce(current)
  const f = fixture(read)
  await vi.waitFor(() => expect(f.element.querySelector('img')).not.toBeNull())
  expect(f.open).not.toHaveBeenCalled()
  f.element.querySelector('button')!.click()
  await vi.waitFor(() => expect(f.open).toHaveBeenCalledWith(current))
  expect(read).toHaveBeenCalledTimes(2)
  f.dispose()
})

it('reports an evicted image instead of opening an original retained by its old thumbnail', async () => {
  const read = vi.fn().mockResolvedValueOnce(picture).mockRejectedValueOnce(new Error('图片已不在缓存中'))
  const f = fixture(read)
  await vi.waitFor(() => expect(f.element.querySelector('img')).not.toBeNull())
  f.element.querySelector('button')!.click()
  await vi.waitFor(() => expect(f.element.textContent).toContain('图片已不在缓存中'))
  expect(f.open).not.toHaveBeenCalled()
  f.dispose()
})

it('does not open a late original after the terminal decoration has been disposed', async () => {
  let finish!: (image: typeof picture) => void
  const read = vi.fn().mockResolvedValueOnce(picture).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const f = fixture(read)
  await vi.waitFor(() => expect(f.element.querySelector('img')).not.toBeNull())
  f.element.querySelector('button')!.click()
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  f.dispose(); finish(picture)
  await Promise.resolve()
  expect(f.open).not.toHaveBeenCalled()
})
