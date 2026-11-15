import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { CodeEditorPanel } from '../../src/ui/code-editor.js'
import { createCodeEditorStore, type EditorScope } from '../../src/ui/state/code-editor.js'
import { AgentMarkdown } from '../../src/ui/markdown.js'
import { ScriptPreview } from '../../src/ui/script-preview.js'
import { CodeEditingContext } from '../../src/ui/code-editing-context.js'

const scope: EditorScope = { key: 's', owner: { sessionId: 's' }, sessionId: 's', kind: 'native', label: '本机' }
function setup() {
  const run = vi.fn(async () => ({ cellId: 'cell-1' }))
  const save = vi.fn(async () => ({ path: '/workspace/analysis.py', version: 'v1', bytes: 8 }))
  const store = createCodeEditorStore({ read: vi.fn(), run, save })
  const id = store.openSource(scope, 'source', 'x = 1\nprint(x)', 'python')
  return { store, id, run, save }
}

describe('chat-first editor', () => {
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
