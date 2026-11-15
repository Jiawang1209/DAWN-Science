import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { describe, expect, it, vi } from 'vitest'
import { CodeEditorPanel } from '../../src/ui/code-editor.js'
import { createCodeEditorStore, type EditorScope } from '../../src/ui/state/code-editor.js'
import { AgentMarkdown } from '../../src/ui/markdown.js'
import { ScriptPreview } from '../../src/ui/script-preview.js'
import { CodeEditingContext } from '../../src/ui/code-editing-context.js'

const scope: EditorScope = { key: 's', owner: { sessionId: 's' }, sessionId: 's', kind: 'native', label: '本机' }
// jsdom has no text layout. Real geometry is exercised by the Electron tests.
Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
})
function setup() {
  const run = vi.fn(async () => ({ cellId: 'cell-1' }))
  const save = vi.fn(async () => ({ path: '/workspace/analysis.py', version: 'v1', bytes: 8 }))
  const store = createCodeEditorStore({ read: vi.fn(), run, save })
  const id = store.openSource(scope, 'source', 'x = 1\nprint(x)', 'python')
  return { store, id, run, save }
}

describe('chat-first editor', () => {
  it.each([
    ['r', '', '(', ')'], ['R', '--', '(', ')'],
    ['r', '', '[', ']'], ['R', '-', '[', ']'],
    ['r', '', '{', '}'], ['R', '---', '{', '}'],
  ].flatMap(variant => ['"', "'"].map(quote => [quote, ...variant])))('preserves multiline raw R literal quoted with %s: %s%s%s', (quote, prefix, dashes, open, close) => {
    const { store } = setup()
    const literal = `${prefix}${quote}${dashes}${open}first ${quote}\n    literal spaces\n\n  last${close}${dashes}${quote}`
    const text = `if (TRUE) {\n    x <- ${literal}\n    print(x)\n}`
    const id = store.openSource(scope, 'raw-indent', text, 'R')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    fireEvent.click(screen.getByRole('button', { name: /^整理缩进$/ }))
    expect(store.$documents.get()[id]?.text).toBe(`if (TRUE) {\n  x <- ${literal}\n  print(x)\n}`)
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe(text)
  })

  it.each([
    ['python', 'if True:\n  text = """keep\n    literal spaces\n  """\n  print(text)', 'if True:\n    text = """keep\n    literal spaces\n  """\n    print(text)'],
    ['R', 'if (TRUE) {\n    print("keep # spaces") # comment\n}', 'if (TRUE) {\n  print("keep # spaces") # comment\n}'],
    ['R', 'if (TRUE) {\n    x <- "first\n    inner spaces\n  last"\n    print(x)\n}', 'if (TRUE) {\n  x <- "first\n    inner spaces\n  last"\n  print(x)\n}'],
  ])('tidies %s indentation as one undoable draft edit without saving or running', (language, text, expected) => {
    const { store, save, run } = setup()
    const id = store.openSource(scope, 'indent', text, language)
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    fireEvent.click(screen.getByRole('button', { name: /^整理缩进$/ }))
    expect(store.$documents.get()[id]?.text).toBe(expected)
    expect(save).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe(text)
  })

  it('tidies only selected lines and preserves CRLF', () => {
    const { store } = setup()
    const text = 'if True:\r\n  print("one")\r\n  print("two")'
    const id = store.openSource(scope, 'selection-indent', text, 'python')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.line(3).from } }) })
    fireEvent.click(screen.getByRole('button', { name: /^整理缩进$/ }))
    expect(store.$documents.get()[id]?.text).toBe('if True:\r\n    print("one")\r\n  print("two")')
  })

  it('visually distinguishes keywords, strings, numbers and comments', () => {
    const { store } = setup()
    store.openSource(scope, 'colors', 'if True:\n    print("sample", 42) # note', 'python')
    const { container } = render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    expect(container.querySelector('.cm-code-keyword')?.textContent).toBe('if')
    expect(container.querySelector('.cm-code-string')?.textContent).toBe('"sample"')
    expect(container.querySelector('.cm-code-number')?.textContent).toBe('42')
    expect(container.querySelector('.cm-code-comment')?.textContent).toBe('# note')
  })

  it('maps the selected code through the shortcut edit and keeps undo across parent rerenders', () => {
    const { store } = setup()
    const text = 'if True:\n  print("one")\n  print("two")'
    const id = store.openSource(scope, 'shortcut-indent', text, 'python')
    const panel = render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const editor = screen.getByRole('textbox', { name: '脚本代码编辑器' })
    const view = EditorView.findFromDOM(editor)!
    act(() => { view.dispatch({ selection: { anchor: text.indexOf('print'), head: text.indexOf('\n', 10) } }) })
    fireEvent.keyDown(editor, { key: 'F', code: 'KeyF', keyCode: 70, ctrlKey: true, shiftKey: true })
    expect(store.$documents.get()[id]?.text).toBe('if True:\n    print("one")\n  print("two")')
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('print("one")')
    panel.rerender(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    expect(EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))).toBe(view)
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe(text)
  })

  it('disables syntax indentation for an unsupported language and keeps its text unchanged', () => {
    const { store, save, run } = setup()
    const text = '  plain text\n    keep spaces'
    const id = store.openSource(scope, 'plain-indent', text, 'text')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const button = screen.getByRole('button', { name: /^整理缩进$/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '脚本代码编辑器' }), { key: 'F', code: 'KeyF', keyCode: 70, ctrlKey: true, shiftKey: true })
    expect(store.$documents.get()[id]?.text).toBe(text)
    expect(save).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('saves a named draft and runs exactly the current CodeMirror selection', async () => {
    const { store, save, run } = setup()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: '脚本保存路径' }), { target: { value: 'analysis.py' } })
    fireEvent.click(screen.getByRole('button', { name: '保存脚本' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(scope, 'analysis.py', 'x = 1\nprint(x)', null))
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => view.dispatch({ selection: { anchor: 6, head: 14 } }))
    fireEvent.click(screen.getByRole('button', { name: '运行选区' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith(scope, 'python', 'print(x)'))
    expect(screen.getByRole('button', { name: '运行结果' }).getAttribute('aria-expanded')).toBe('true')
    act(() => view.dispatch({ changes: { from: 4, to: 5, insert: '2' } }))
    expect(screen.getByText('代码已修改，结果待更新')).toBeTruthy()
  })

  it('sends selected code to the original conversation without submitting a message', () => {
    const { store } = setup(), ask = vi.fn()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} onAsk={ask} />)
    expect(screen.queryByRole('button', { name: '带入对话' })).toBeNull()
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => view.dispatch({ selection: { anchor: 6, head: 14 } }))
    fireEvent.click(screen.getByRole('button', { name: '带入对话' }))
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('print(x)'))
    expect(ask.mock.calls[0]?.[0]).toContain('L2')
  })

  it('shows only the matching execution output and keeps errors visible', async () => {
    const { store, id } = setup()
    await store.run(id)
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[
      { id: 'old', n: 1, who: 'you', language: 'python', languageKnown: true, code: 'old', status: 'ok', outputs: [] },
      { id: 'cell-1', n: 2, who: 'you', language: 'python', languageKnown: true, code: 'x = 1\nprint(x)', status: 'error', outputs: [] },
    ]} onClose={() => {}} />)
    expect(screen.getByText('执行失败，请检查当前会话中的错误详情')).toBeTruthy()
  })

  it.each(['reload', 'interrupt'] as const)('does not show a late %s error in another conversation', async operation => {
    let reject!: (error: Error) => void
    const pending = new Promise<never>((_, fail) => { reject = fail })
    const api = {
      read: vi.fn(async () => ({ path: '/work/a.py', text: 'print(1)', version: 'v1' })),
      save: vi.fn(async () => { throw new Error('A save conflict') }),
      run: vi.fn(() => new Promise<{ cellId: string }>(() => {})),
    }
    const store = createCodeEditorStore(api)
    const id = await store.openFile(scope, 'a.py')
    if (operation === 'reload') await store.save(id).catch(() => {})
    else void store.run(id)
    const view = render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} onInterrupt={() => pending} />)
    if (operation === 'reload') {
      api.read.mockImplementation(() => pending)
      fireEvent.click(screen.getByRole('button', { name: '放弃草稿并重读' }))
    } else fireEvent.click(screen.getByRole('button', { name: '中断' }))
    act(() => { store.openSource({ ...scope, key: 'b', sessionId: 'b', owner: { sessionId: 'b' } }, 'b', 'print(2)', 'python') })
    view.rerender(<CodeEditorPanel store={store} scopeKey="b" cells={[]} onClose={() => {}} onInterrupt={() => pending} />)
    await act(async () => { reject(new Error('late A error')); await Promise.resolve() })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('editor entry points', () => {
  it('opens complete conversation code with stable source identity but disables partial streaming code', async () => {
    const openCode = vi.fn(), actions = { openCode, openFile: vi.fn() }
    const view = render(<CodeEditingContext.Provider value={actions}><AgentMarkdown text={'```python\nprint(42)\n```'} streaming={false} /></CodeEditingContext.Provider>)
    fireEvent.click(await screen.findByRole('button', { name: '在旁边编辑' }))
    expect(openCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'print(42)\n', language: 'python', source: expect.any(String) }))
    view.rerender(<CodeEditingContext.Provider value={actions}><AgentMarkdown text={'```python\nprint('} streaming /></CodeEditingContext.Provider>)
    expect(screen.getByRole('button', { name: '在旁边编辑' }).hasAttribute('disabled')).toBe(true)
  })

  it('opens script preview by path so the backend reads full versioned bytes', async () => {
    const openFile = vi.fn()
    render(<CodeEditingContext.Provider value={{ openCode: vi.fn(), openFile }}><ScriptPreview path="/project/data.py" text="preview bytes" mediaType="text/x-python" /></CodeEditingContext.Provider>)
    fireEvent.click(screen.getByRole('button', { name: '编辑脚本' }))
    expect(openFile).toHaveBeenCalledWith('/project/data.py')
  })
})
