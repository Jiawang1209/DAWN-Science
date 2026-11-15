import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { closeCompletion, completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete'
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
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
})
function setup() {
  const run = vi.fn(async () => ({ cellId: 'cell-1' }))
  const save = vi.fn(async () => ({ path: '/workspace/analysis.py', version: 'v1', bytes: 8 }))
  const store = createCodeEditorStore({ read: vi.fn(), run, save })
  const id = store.openSource(scope, 'source', 'x = 1\nprint(x)', 'python')
  return { store, id, run, save }
}

describe('chat-first editor', () => {
  it('selection handoff keeps this script connected for subsequent plain chat messages', () => {
    const { store, id } = setup()
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} onAsk={() => {}} />)
    act(() => store.setSelection(id, { from: 6, to: 14, text: 'print(x)' }))
    fireEvent.click(screen.getByRole('button', { name: /^带入对话$/ }))
    expect(store.linkedScript('s')?.document.id).toBe(id)
    expect(screen.queryByRole('button', { name: /^关联当前会话$/ })).toBeNull()
  })

  it('places the script connection controls inside the side editor', () => {
    const { store } = setup()
    const { container } = render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} scriptContext={<div data-testid="script-context">link controls</div>} />)
    expect(container.querySelector('.code-editor-panel [data-testid="script-context"]')).toBeTruthy()
  })

  it('reviews the current saved path when a draft receives its first filename while AI is replying', async () => {
    const { store, id } = setup()
    store.setSelection(id, { from: 6, to: 14, text: 'print(x)' })
    const request = store.prepareEdit(id, 'before-saving.py')
    // A first save assigns this same document its canonical filesystem identity.
    await store.save(id, 'analysis.py')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    act(() => store.reviewEdit(request.id, 's', 'x = 1\nprint(x + 1)', 'python'))
    expect(screen.getByRole('dialog', { name: /^审阅脚本修改$/ }).textContent).toContain('修改目标：/workspace/analysis.py')
    expect(store.$editRequests.get()[0]?.label).toBe('before-saving.py')
    expect(store.current('s')?.id).toBe(id)
  })

  it('reviews an AI revision then applies one undoable edit to the original named draft', async () => {
    const { store, id, save, run } = setup()
    await store.save(id, 'analysis.py')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} onAsk={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => {
      view.dispatch({ changes: { from: 4, to: 5, insert: '2' } })
      view.dispatch({ selection: { anchor: 6, head: 14 } })
    })
    const before = store.$documents.get()[id]!
    const request = store.prepareEdit(id, 'analysis.py')
    act(() => store.reviewEdit(request.id, 's', 'x = 2\nprint(x + 1)\n', 'python'))
    expect(screen.getByRole('dialog', { name: /^审阅脚本修改$/ })).toBeTruthy()
    expect(store.$documents.get()[id]?.text).toBe(before.text)
    fireEvent.click(screen.getByRole('button', { name: /^应用到原脚本$/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.$documents.get()[id]).toMatchObject({ path: '/workspace/analysis.py', version: 'v1', savedText: 'x = 1\nprint(x)', text: 'x = 2\nprint(x + 1)' })
    expect(store.current('s')?.id).toBe(id)
    expect(Object.keys(store.$documents.get())).toEqual([id])
    expect(save).toHaveBeenCalledTimes(1); expect(run).not.toHaveBeenCalled()
    expect(EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))).toBe(view)
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe(before.text)
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe('x = 1\nprint(x)')
  })

  it('blocks applying a reply when the original draft changes while its diff is open', () => {
    const { store, id } = setup()
    store.setSelection(id, { from: 6, to: 14, text: 'print(x)' })
    const request = store.prepareEdit(id, 'analysis.py')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    act(() => store.reviewEdit(request.id, 's', 'x = 1\nprint(x + 2)', 'python'))
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => view.dispatch({ changes: { from: 4, to: 5, insert: '3' } }))
    expect(screen.getByRole('button', { name: /^应用到原脚本$/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^应用到原脚本$/ }))
    expect(store.$documents.get()[id]?.text).toBe('x = 3\nprint(x)')
  })

  it('toggles visual wrapping without changing draft bytes, selection, undo or selected execution', async () => {
    const { store, save, run } = setup()
    const original = 'x = 1\r\nprint("' + 'long text '.repeat(20) + '")'
    const id = store.openSource(scope, 'wrapped-selection', original, 'python')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    const toggle = screen.getByRole('button', { name: /^自动换行$/ })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
    act(() => {
      view.dispatch({ changes: { from: 4, to: 5, insert: '2' } })
      view.dispatch({ selection: { anchor: view.state.doc.line(2).from, head: view.state.doc.length } })
    })
    const edited = store.$documents.get()[id]!
    const selection = view.state.selection.main
    fireEvent.click(toggle)
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false)
    fireEvent.click(toggle)
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
    expect(EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))).toBe(view)
    expect(store.$documents.get()[id]?.text).toBe(edited.text)
    expect(view.state.selection.main.eq(selection)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^运行选区$/ }))
    await waitFor(() => expect(run).toHaveBeenCalledWith(scope, 'python', original.split('\r\n')[1]))
    expect(save).not.toHaveBeenCalled()
    act(() => { undo(view) })
    expect(store.$documents.get()[id]?.text).toBe(original)
  })

  it('remembers the wrap choice when the editor is reopened and another language is opened', () => {
    const { store } = setup()
    const panel = render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^自动换行$/ }))
    panel.unmount()
    store.openSource(scope, 'another-language', 'print("long R line")', 'R')
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /^自动换行$/ }).getAttribute('aria-pressed')).toBe('false')
    expect(EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!.contentDOM.classList.contains('cm-lineWrapping')).toBe(false)
  })

  it.each([['python', 'shared_value = 42\npri', 'print'], ['R', 'shared_value <- 42\nmea', 'mean']])('completes %s builtins and document identifiers without saving or running', async (language, text, builtin) => {
    const { store, save, run } = setup()
    const id = store.openSource(scope, 'completion', text, language)
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const editor = screen.getByRole('textbox', { name: '脚本代码编辑器' })
    const view = EditorView.findFromDOM(editor)!
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }); view.focus(); startCompletion(view) })
    await waitFor(() => expect(currentCompletions(view.state).some(c => c.label === builtin)).toBe(true))
    fireEvent.keyDown(editor, { key: 'Tab', code: 'Tab', keyCode: 9 })
    expect(store.$documents.get()[id]?.text.endsWith(builtin)).toBe(true)
    act(() => { undo(view); closeCompletion(view); view.dispatch({ changes: { from: view.state.doc.line(2).from, to: view.state.doc.length, insert: 'shared_v' }, selection: { anchor: view.state.doc.line(2).from + 8 } }); startCompletion(view) })
    await waitFor(() => expect(currentCompletions(view.state).some(c => c.label === 'shared_value')).toBe(true))
    expect(save).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled()
  })

  it.each([
    ['python', '# pri'], ['python', 'text = "pri'],
    ['R', '# mea'], ['R', 'text <- "mea'], ['R', 'text <- r"(first "\nmea'],
  ])('does not offer completions inside %s comments or literal text: %s', async (language, text) => {
    const { store } = setup()
    store.openSource(scope, 'no-completion', text, language)
    render(<CodeEditorPanel store={store} scopeKey="s" cells={[]} onClose={() => {}} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: '脚本代码编辑器' }))!
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }); view.focus(); startCompletion(view) })
    await waitFor(() => expect(completionStatus(view.state)).toBeNull())
    expect(currentCompletions(view.state)).toEqual([])
  })

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
  it.each([['R', 'r'], ['Python', 'python'], ['PYTHON', 'python']])('keeps the review action for a real-model %s code fence', async (fenceLanguage, language) => {
    const reviewCode = vi.fn()
    render(<CodeEditingContext.Provider value={{ openCode: vi.fn(), openFile: vi.fn(), editReply: () => ({ status: 'pending', requestId: 'case-edit' }), reviewCode }}><AgentMarkdown streaming={false} sourceId="case-reply" text={'```' + fenceLanguage + '\nprint(42)\n```'} /></CodeEditingContext.Provider>)
    fireEvent.click(await screen.findByRole('button', { name: /^查看差异$/ }))
    expect(reviewCode).toHaveBeenCalledWith({ requestId: 'case-edit', code: 'print(42)\n', language })
  })

  it('routes linked replies into diff review and keeps applied or expired replies out of new drafts', async () => {
    const openCode = vi.fn(), reviewCode = vi.fn(), returnToScript = vi.fn()
    const actions = { openCode, openFile: vi.fn(), editReply: () => ({ status: 'pending' as const, requestId: 'edit-1' }), reviewCode, returnToScript }
    const panel = render(<CodeEditingContext.Provider value={actions}><AgentMarkdown streaming={false} sourceId="reply-1" text={'```r\nprint(p)\n```'} /></CodeEditingContext.Provider>)
    fireEvent.click(await screen.findByRole('button', { name: /^查看差异$/ }))
    expect(reviewCode).toHaveBeenCalledWith({ requestId: 'edit-1', code: 'print(p)\n', language: 'r' })
    expect(openCode).not.toHaveBeenCalled()
    panel.rerender(<CodeEditingContext.Provider value={{ ...actions, editReply: () => ({ status: 'applied', requestId: 'edit-1' }) }}><AgentMarkdown streaming={false} sourceId="reply-1" text={'```r\nprint(p)\n```'} /></CodeEditingContext.Provider>)
    fireEvent.click(await screen.findByRole('button', { name: /^回到原脚本$/ }))
    expect(returnToScript).toHaveBeenCalledWith('edit-1')
    panel.rerender(<CodeEditingContext.Provider value={{ ...actions, editReply: () => ({ status: 'expired' }) }}><AgentMarkdown streaming={false} sourceId="reply-1" text={'```r\nprint(p)\n```'} /></CodeEditingContext.Provider>)
    expect((await screen.findByRole('button', { name: /^修改请求已失效$/ })).hasAttribute('disabled')).toBe(true)
    expect(openCode).not.toHaveBeenCalled()
  })

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
