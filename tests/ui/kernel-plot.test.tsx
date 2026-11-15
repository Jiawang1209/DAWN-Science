import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { CodeEditorPanel } from '../../src/ui/code-editor.js'
import { KernelOutputRow } from '../../src/ui/views.js'
import { createCodeEditorStore, type EditorScope } from '../../src/ui/state/code-editor.js'
import type { Cell } from '../../src/protocol/notebook-cells.js'

const scope: EditorScope = { key: 's', owner: { sessionId: 's' }, sessionId: 's', kind: 'native', label: '本机' }
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
function rich(id: string, mediaType = 'image/png', data = png, tooLarge = false): Cell['outputs'][number] {
  return { type: 'kernelOutput', id, kernelInstanceId: 'kernel', kernelRevision: 1, language: 'python', output: { kind: 'display', mediaType, data, bytes: data.length, alsoAvailable: [], ...(tooLarge ? { tooLarge: true } : {}) } }
}
function cell(id: string, n: number, outputs: Cell['outputs'], code = `plot(${n})`): Cell {
  return { id, n, who: 'you', language: 'python', languageKnown: true, code, status: 'ok', outputs }
}
function setup() {
  const run = vi.fn(async () => ({ cellId: 'latest' }))
  const save = vi.fn(), store = createCodeEditorStore({ read: vi.fn(), run, save })
  const id = store.openSource(scope, 'source', 'value = 42\nprint(value)', 'python')
  store.toggleOutput(id)
  return { store, id, run, save }
}
Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
})
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, writable: true, value() {} },
  close: { configurable: true, writable: true, value() {} },
})
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(() => vi.restoreAllMocks())

describe('kernel image inspection', () => {
  it('opens a native dialog, toggles original size, and restores image focus on Escape, close, and backdrop', () => {
    render(<KernelOutputRow item={rich('image')} />)
    const trigger = screen.getByRole('button', { name: /^放大图形$/ })
    trigger.focus(); fireEvent.click(trigger)
    let dialog = screen.getByRole('dialog', { name: /^图形预览$/ })
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    fireEvent.click(within(dialog).getByRole('button', { name: /^实际尺寸$/ }))
    expect(within(dialog).getByRole('button', { name: /^适应窗口$/ })).toBeTruthy()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^关闭图形预览$/ }))
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clears export feedback when the inspected image changes', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const panel = render(<KernelOutputRow item={rich('image')} />)
    fireEvent.click(screen.getByRole('button', { name: /^导出图片$/ }))
    expect(screen.getByRole('status')).toBeTruthy()
    panel.rerender(<KernelOutputRow item={rich('image', 'image/png', 'bmV3')} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([
    ['image/png', png, 'png'], ['image/jpeg', '/9j/AA==', 'jpg'],
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><text>中文 &amp; Δ</text></svg>', 'svg'],
  ])('exports the original %s payload only on click with a safe native extension', (mime, data, extension) => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<KernelOutputRow item={rich('unsafe/../image', mime, data)} />)
    expect(click).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^导出图片$/ }))
    const anchor = click.mock.instances[0]! as HTMLAnchorElement
    expect(anchor.download).toMatch(new RegExp(`^dawn-plot-[a-zA-Z0-9_-]+\\.${extension}$`))
    const source = anchor.getAttribute('href')!
    const payload = source.slice(source.indexOf(',') + 1)
    expect(mime === 'image/svg+xml' ? decodeURIComponent(payload) : payload).toBe(data)
    expect(source).toMatch(mime === 'image/svg+xml' ? /^data:image\/svg\+xml;charset=utf-8,/ : new RegExp(`^data:${mime};base64,`))
    expect(screen.getByRole('status').textContent).toBe('已发起图片导出')
    fireEvent.click(screen.getByRole('button', { name: /^放大图形$/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^导出图片$/ }))
    expect(click).toHaveBeenCalledTimes(2)
  })
})

describe('conversation plot history', () => {
  it('follows latest, pins an older selection on incoming plots, and resumes follow when latest is chosen', () => {
    const { store, run, save } = setup()
    const first = cell('one', 1, [rich('a'), rich('b', 'image/jpeg', '/9j/AA==')])
    const panel = render(<CodeEditorPanel store={store} scopeKey="s" cells={[first]} onClose={() => {}} />)
    const gallery = () => screen.getByRole('region', { name: /^会话图形历史$/ })
    expect(within(gallery()).getAllByRole('img')).toHaveLength(1)
    expect(within(gallery()).getByRole('img').getAttribute('src')).toContain('/9j/AA==')
    expect(gallery().textContent).toContain('2 / 2')
    fireEvent.click(within(gallery()).getByRole('button', { name: /^上一张图$/ }))
    expect(within(gallery()).getByRole('img').getAttribute('src')).toContain(png)
    const second = cell('two', 2, [rich('c', 'image/png', 'bmV3')])
    panel.rerender(<CodeEditorPanel store={store} scopeKey="s" cells={[first, second]} onClose={() => {}} />)
    expect(gallery().textContent).toContain('1 / 3')
    fireEvent.click(within(gallery()).getByRole('button', { name: /^图形列表$/ }))
    const select = within(gallery()).getByRole('combobox', { name: /^选择历史图形$/ })
    fireEvent.change(select, { target: { value: select.querySelectorAll('option')[2]!.value } })
    const third = cell('three', 3, [rich('d', 'image/png', 'bGF0ZXN0')])
    panel.rerender(<CodeEditorPanel store={store} scopeKey="s" cells={[first, second, third]} onClose={() => {}} />)
    expect(gallery().textContent).toContain('4 / 4')
    expect(within(gallery()).getByRole('img').getAttribute('src')).toContain('bGF0ZXN0')
    expect(run).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  })

  it('keeps navigation and export together above the compact preview', () => {
    const { store } = setup()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[cell('one', 1, [rich('a'), rich('b')])]} onClose={() => {}} />)
    const gallery = screen.getByRole('region', { name: /^会话图形历史$/ })
    const previous = within(gallery).getByRole('button', { name: /^上一张图$/ })
    const next = within(gallery).getByRole('button', { name: /^下一张图$/ })
    const exportImage = within(gallery).getByRole('button', { name: /^导出图片$/ })
    const image = within(gallery).getByRole('img')
    expect(previous.parentElement).toBe(exportImage.parentElement)
    expect(next.parentElement).toBe(exportImage.parentElement)
    expect(exportImage.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(previous.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('browses adjacent figures inside the enlarged gallery without closing the dialog', () => {
    const { store } = setup()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[cell('one', 1, [rich('a'), rich('b', 'image/png', 'c2Vjb25k')])]} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^放大图形$/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^上一张图$/ }))
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(within(dialog).getByRole('img').getAttribute('src')).toContain(png)
    fireEvent.click(within(dialog).getByRole('button', { name: /^下一张图$/ }))
    expect(within(dialog).getByRole('img').getAttribute('src')).toContain('c2Vjb25k')
  })

  it('keeps transcript history for unrelated files and after remount while preserving draft and selection', () => {
    const { store, id, run, save } = setup()
    const plots = [cell('one', 1, [rich('a')])]
    const panel = render(<CodeEditorPanel store={store} scopeKey="s" cells={plots} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }))
    const originalSelection = view.state.selection.toJSON()
    fireEvent.click(screen.getByRole('button', { name: /^放大图形$/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^关闭图形预览$/ }))
    expect(EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))).toBe(view)
    expect(view.state.selection.toJSON()).toEqual(originalSelection)
    expect(store.$documents.get()[id]?.text).toBe('value = 42\nprint(value)')
    act(() => { const other = store.openSource(scope, 'unrelated', 'other = 10', 'python'); store.toggleOutput(other) })
    expect(screen.getByRole('region', { name: /^会话图形历史$/ }).textContent).toContain('执行 1')
    panel.unmount()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={plots} onClose={() => {}} />)
    expect(screen.getByRole('region', { name: /^会话图形历史$/ })).toBeTruthy()
    expect(run).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  })

  it('resets gallery selection and closes its dialog when the conversation scope changes', () => {
    const { store } = setup()
    const first = cell('one', 1, [rich('a'), rich('b')])
    const panel = render(<CodeEditorPanel store={store} scopeKey="s" cells={[first]} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^上一张图$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^放大图形$/ }))
    act(() => { const id = store.openSource({ ...scope, key: 'other' }, 'other', 'print(2)', 'python'); store.toggleOutput(id) })
    panel.rerender(<CodeEditorPanel store={store} scopeKey="other" cells={[cell('new', 1, [rich('c', 'image/png', 'bmV3')])]} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const gallery = screen.getByRole('region', { name: /^会话图形历史$/ })
    expect(gallery.textContent).toContain('1 / 1')
    expect(within(gallery).getByRole('img').getAttribute('src')).toContain('bmV3')
  })

  it('preserves text, errors, and oversized notes while the old session plot remains clearly labeled', async () => {
    const { store, id } = setup()
    await store.run(id)
    const latest = cell('latest', 2, [
      rich('text', 'text/plain', 'current stdout'), rich('huge', 'image/png', '', true),
      { type: 'kernelOutput', id: 'error', kernelInstanceId: 'kernel', kernelRevision: 1, output: { kind: 'error', ename: 'ValueError', evalue: 'bad input', traceback: [] } },
    ])
    latest.status = 'error'
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[cell('old', 1, [rich('old-image')]), latest]} onClose={() => {}} />)
    const gallery = screen.getByRole('region', { name: /^会话图形历史$/ })
    expect(gallery.textContent).toContain('会话图形')
    expect(gallery.textContent).toContain('执行 1')
    expect(screen.getByText('current stdout')).toBeTruthy()
    expect(screen.getByText(/超过上限没有显示/)).toBeTruthy()
    expect(screen.getByText('ValueError: bad input')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('does not duplicate the current execution plot inside the console', async () => {
    const { store, id } = setup()
    await store.run(id)
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[cell('latest', 1, [rich('a'), rich('text', 'text/plain', 'kept text')])]} onClose={() => {}} />)
    expect(within(screen.getByRole('region', { name: /^会话图形历史$/ })).getByRole('img')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByText('kept text')).toBeTruthy()
  })
})
