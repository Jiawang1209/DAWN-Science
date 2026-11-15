import { describe, expect, it, vi } from 'vitest'
import { createCodeEditorStore, editorDocumentPath, type EditorScope, type EditorServices } from '../../src/ui/state/code-editor.js'

const scope: EditorScope = { key: 'session-a', sessionId: 'session-a', kind: 'native', owner: { sessionId: 'session-a' }, label: '本机' }
const services = (): EditorServices => ({
  read: vi.fn(async () => ({ path: '/work/a.py', text: 'x = 1\n', version: 'v1' })),
  save: vi.fn(async () => ({ path: '/work/a.py', version: 'v2', bytes: 6 })),
  run: vi.fn(async () => ({ cellId: 'cell-a' })),
})
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('conversation code document lifecycle', () => {
  it('preserves canonical document paths and anchors remote relative drafts to their session cwd', () => {
    expect(editorDocumentPath(scope, '/work/a.py')).toBe('/work/a.py')
    expect(editorDocumentPath(scope, 'C:/project/a.py')).toBe('C:/project/a.py')
    const remote = { ...scope, owner: { connectionId: 'remote' }, cwd: '/home/research/project' }
    expect(editorDocumentPath(remote, '/tmp/other.py')).toBe('/tmp/other.py')
    expect(editorDocumentPath(remote, 'analysis.py')).toBe('/home/research/project/analysis.py')
  })
  it('reopening a source retains edits and scopes drafts to their original session', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'message-1:block-1', 'x = 1', 'python')
    store.edit(id, 'x = 2')
    expect(store.openSource(scope, 'message-1:block-1', 'x = 1', 'python')).toBe(id)
    expect(store.current(scope.key)?.text).toBe('x = 2')
    store.openSource({ ...scope, key: 'session-b', sessionId: 'session-b', owner: { sessionId: 'session-b' } }, 'message-1:block-1', 'x = 1', 'python')
    expect(store.current(scope.key)?.text).toBe('x = 2')
    expect(store.current('session-b')?.text).toBe('x = 1')
  })

  it('updates only the saved baseline when saving completes after further edits', async () => {
    const api = services(), pending = deferred<{ path: string; version: string; bytes: number }>()
    api.save = vi.fn(() => pending.promise)
    const store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    store.edit(id, 'x = 2\n')
    const saving = store.save(id)
    store.edit(id, 'x = 3\n')
    pending.resolve({ path: '/work/a.py', version: 'v2', bytes: 6 })
    await saving
    expect(store.current(scope.key)).toMatchObject({ text: 'x = 3\n', savedText: 'x = 2\n', version: 'v2', saving: false })
    expect(api.save).toHaveBeenCalledWith(scope, '/work/a.py', 'x = 2\n', 'v1')
  })

  it('preserves the dirty document and version when disk save conflicts', async () => {
    const api = services(); api.save = vi.fn(async () => { throw new Error('文件已在外部修改') })
    const store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    store.edit(id, 'new text')
    await expect(store.save(id)).rejects.toThrow('外部修改')
    expect(store.current(scope.key)).toMatchObject({ text: 'new text', savedText: 'x = 1\n', version: 'v1', saving: false, error: '文件已在外部修改' })
  })

  it('uses create-only semantics for conversation drafts and requires a save path', async () => {
    const api = services(), store = createCodeEditorStore(api), id = store.openSource(scope, 'code-1', 'print(42)', 'python')
    await expect(store.save(id)).rejects.toThrow()
    expect(api.save).not.toHaveBeenCalled()
    await store.save(id, 'analysis.py')
    expect(api.save).toHaveBeenCalledWith(scope, 'analysis.py', 'print(42)', null)
  })

  it('runs only selected code in the original session and preserves the exact executed snapshot', async () => {
    const api = services(), store = createCodeEditorStore(api), id = store.openSource(scope, 'c', 'x = 1\nprint(x)', 'python')
    await store.run(id, { from: 6, to: 14, text: 'print(x)' })
    expect(api.run).toHaveBeenCalledWith(scope, 'python', 'print(x)')
    expect(store.current(scope.key)?.lastRun).toMatchObject({ cellId: 'cell-a', code: 'print(x)', snapshot: 'x = 1\nprint(x)', selection: true })
    store.edit(id, 'x = 2\nprint(x)')
    expect(store.current(scope.key)?.lastRun?.snapshot).toBe('x = 1\nprint(x)')
  })

  it('does not route shell snippets or non-native sessions into a Python kernel', async () => {
    const api = services(), store = createCodeEditorStore(api)
    const shell = store.openSource(scope, 'sh', 'echo hello', 'bash')
    await expect(store.run(shell)).rejects.toThrow()
    const terminal = store.openSource({ ...scope, key: 'terminal', kind: 'pty' }, 'py', 'print(1)', 'python')
    await expect(store.run(terminal)).rejects.toThrow()
    expect(api.run).not.toHaveBeenCalled()
  })

  it('runs R code through the R kernel without coercing the language', async () => {
    const api = services(), store = createCodeEditorStore(api)
    const id = store.openSource(scope, 'r', 'print(42)', 'r')
    await store.run(id)
    expect(api.run).toHaveBeenCalledWith(scope, 'R', 'print(42)')
    expect(store.current(scope.key)?.lastRun?.language).toBe('R')
  })

  it('a delayed file open cannot replace a more recent source selection', async () => {
    const api = services(), pending = deferred<{ path: string; text: string; version: string }>(); api.read = vi.fn(() => pending.promise)
    const store = createCodeEditorStore(api), opening = store.openFile(scope, 'a.py')
    const latest = store.openSource(scope, 'new', 'print(2)', 'python')
    pending.resolve({ path: '/work/a.py', text: 'print(1)', version: 'v1' })
    await opening
    expect(store.current(scope.key)?.id).toBe(latest)
  })

  it('explicit reload resolves a conflict but never overwrites edits made while reading', async () => {
    const api = services(), store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    store.edit(id, 'unsaved')
    api.read = vi.fn(async () => ({ path: '/work/a.py', text: 'external', version: 'external-version' }))
    await store.reload(id)
    expect(store.current(scope.key)).toMatchObject({ text: 'external', savedText: 'external', version: 'external-version' })
    const pending = deferred<{ path: string; text: string; version: string }>()
    api.read = vi.fn(() => pending.promise)
    const reloading = store.reload(id)
    store.edit(id, 'new edit')
    pending.resolve({ path: '/work/a.py', text: 'older disk', version: 'older' })
    await expect(reloading).rejects.toThrow()
    expect(store.current(scope.key)?.text).toBe('new edit')
  })

  it('refreshes the editor revision for a clean externally changed file', async () => {
    const api = services(), store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    api.read = vi.fn(async () => ({ path: '/work/a.py', text: 'external', version: 'v2' }))
    await store.openFile(scope, 'a.py')
    expect(store.current(scope.key)).toMatchObject({ id, text: 'external', reloadRevision: 1 })
  })

  it('an older file read cannot replace a save completed while it was reading', async () => {
    const api = services(), store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    const pending = deferred<{ path: string; text: string; version: string }>(); api.read = vi.fn(() => pending.promise)
    const opening = store.openFile(scope, 'a.py')
    store.edit(id, 'x = 2\n'); await store.save(id)
    pending.resolve({ path: '/work/a.py', text: 'x = 1\n', version: 'v1' })
    await opening
    expect(store.current(scope.key)).toMatchObject({ text: 'x = 2\n', savedText: 'x = 2\n', version: 'v2' })
  })

  it('reload cannot undo a completed save even when the draft text did not change during the read', async () => {
    const api = services(), store = createCodeEditorStore(api), id = await store.openFile(scope, 'a.py')
    store.edit(id, 'x = 2\n')
    const pending = deferred<{ path: string; text: string; version: string }>(); api.read = vi.fn(() => pending.promise)
    const reloading = store.reload(id)
    await store.save(id)
    pending.resolve({ path: '/work/a.py', text: 'x = 1\n', version: 'v1' })
    await expect(reloading).rejects.toThrow()
    expect(store.current(scope.key)).toMatchObject({ text: 'x = 2\n', savedText: 'x = 2\n', version: 'v2' })
  })
})
