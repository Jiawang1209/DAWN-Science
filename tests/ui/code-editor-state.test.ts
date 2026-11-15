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
  it('binds a selected edit request to the full unsaved document without saving it', () => {
    const api = services(), store = createCodeEditorStore(api)
    const text = 'library(ggplot2)\np <- 1\nprint(p)'
    const id = store.openSource(scope, 'ai-source', text, 'R')
    store.setSelection(id, { from: text.indexOf('print'), to: text.length, text: 'print(p)' })
    const request = store.prepareEdit(id, 'analysis.R')
    expect(request).toMatchObject({ documentId: id, scopeKey: scope.key, baseline: text, label: 'analysis.R' })
    expect(request.prompt).toContain(text)
    expect(store.$editRequests.get()).toEqual([request])
    expect(Object.keys(store.$documents.get())).toEqual([id])
    expect(api.save).not.toHaveBeenCalled(); expect(api.run).not.toHaveBeenCalled()
  })

  it('applies a reviewed reply to the original document and preserves its disk identity and save baseline', async () => {
    const api = services(), store = createCodeEditorStore(api)
    const id = await store.openFile(scope, 'a.py')
    store.setSelection(id, { from: 0, to: 5, text: 'x = 1' })
    const request = store.prepareEdit(id, 'a.py')
    store.reviewEdit(request.id, scope.key, 'x = 2\n', 'python')
    expect(store.$documents.get()[id]?.text).toBe('x = 1\n')
    store.applyEdit(request.id, scope.key, 'x = 2\n', 'document', (_before, after) => store.edit(id, after))
    expect(store.$documents.get()[id]).toMatchObject({ id, path: '/work/a.py', version: 'v1', text: 'x = 2\n', savedText: 'x = 1\n' })
    expect(store.current(scope.key)?.id).toBe(id)
    expect(store.$editPreview.get()).toBeUndefined()
    expect(() => store.applyEdit(request.id, scope.key, 'x = 2\n', 'document', vi.fn())).toThrow()
    expect(api.save).not.toHaveBeenCalled(); expect(api.run).not.toHaveBeenCalled()
  })

  it('rejects stale edits both during AI generation and after a diff has been opened', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'ai-stale', 'print(1)', 'python')
    store.setSelection(id, { from: 0, to: 8, text: 'print(1)' })
    const request = store.prepareEdit(id, 'a.py')
    store.reviewEdit(request.id, scope.key, 'print(2)', 'python')
    store.edit(id, 'print(3)')
    const commit = vi.fn()
    expect(store.editProblem(request.id, scope.key)).toMatch(/改变|变化/)
    expect(() => store.applyEdit(request.id, scope.key, 'print(2)', 'document', commit)).toThrow()
    expect(commit).not.toHaveBeenCalled()
    expect(store.current(scope.key)?.text).toBe('print(3)')
  })

  it('rejects other scopes, mismatched languages, superseded requests and in-flight documents', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'ai-scope', 'print(1)', 'python')
    store.setSelection(id, { from: 0, to: 8, text: 'print(1)' })
    const first = store.prepareEdit(id, 'a.py')
    expect(() => store.reviewEdit(first.id, 'other-session', 'print(2)', 'python')).toThrow()
    expect(() => store.reviewEdit(first.id, scope.key, 'print(2)', 'R')).toThrow()
    const latest = store.prepareEdit(id, 'a.py')
    expect(() => store.reviewEdit(first.id, scope.key, 'print(2)', 'python')).toThrow()
    store.$documents.set({ ...store.$documents.get(), [id]: { ...store.$documents.get()[id]!, saving: true } })
    expect(() => store.applyEdit(latest.id, scope.key, 'print(2)', 'document', vi.fn())).toThrow()
  })

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


describe('chat script associations', () => {
  it('keeps its original document through visible switches and snapshots the latest unsaved edits after apply', () => {
    const api = services(), store = createCodeEditorStore(api)
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'analysis.py')
    expect(store.$linkedScripts.get()[scope.key]).toEqual({ documentId: id, label: 'analysis.py' })
    const firstPrompt = store.prepareLinkedEdit(scope.key, '改为 2')
    const first = store.$editRequests.get().at(-1)!
    expect(firstPrompt).toBe(first.prompt)
    store.reviewEdit(first.id, scope.key, 'print(2)', 'python')
    store.applyEdit(first.id, scope.key, 'print(2)', 'document', (_before, after) => store.edit(id, after))
    store.edit(id, 'print(2)\n# 手动调整')
    const visible = store.openSource(scope, 'other', 'unrelated', 'python')
    expect(store.current(scope.key)?.id).toBe(visible)
    expect(store.linkedScript(scope.key)?.document.id).toBe(id)
    store.prepareLinkedEdit(scope.key, '继续改标题')
    const second = store.$editRequests.get().at(-1)!
    expect(second).toMatchObject({ documentId: id, baseline: 'print(2)\n# 手动调整', source: 'linked' })
    expect(store.linkedScript(scope.key)?.document.id).toBe(id)
    expect(api.save).not.toHaveBeenCalled(); expect(api.run).not.toHaveBeenCalled()
  })

  it('leaves ordinary text untouched without a binding, after unlink, and with explicit one-shot context', () => {
    const store = createCodeEditorStore(services())
    expect(store.prepareLinkedEdit(scope.key, '普通问题')).toBe('普通问题')
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    store.setSelection(id, { from: 0, to: 8, text: 'print(1)' })
    const oneShot = store.prepareEdit(id, 'a.py')
    expect(store.prepareLinkedEdit(scope.key, oneShot.prompt + '\n改颜色')).toBe(oneShot.prompt + '\n改颜色')
    expect(store.$editRequests.get()).toEqual([oneShot])
    store.unlinkScript(scope.key)
    expect(store.linkedScript(scope.key)).toBeUndefined()
    expect(store.prepareLinkedEdit(scope.key, '普通问题')).toBe('普通问题')
  })

  it('keeps literal and unknown marker questions attached to the latest draft', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    store.edit(id, 'print(2) # 最新草稿')
    const instruction = '解释 <!-- dawn-script-edit:example --> 是什么意思'
    const prompt = store.prepareLinkedEdit(scope.key, instruction)
    expect(prompt).not.toBe(instruction)
    expect(prompt).toContain('print(2) # 最新草稿')
    expect(store.$editRequests.get().at(-1)).toMatchObject({ source: 'linked', baseline: 'print(2) # 最新草稿', prompt })
  })

  it('preserves actual pending one-shot precedence after textarea newline normalization', () => {
    const store = createCodeEditorStore(services())
    const text = 'x = 1\r\nprint(x)\r\n'
    const id = store.openSource(scope, 'linked-crlf', text, 'python')
    store.linkScript(id, 'a.py')
    store.setSelection(id, { from: 6, to: 14, text: 'print(x)' })
    const oneShot = store.prepareEdit(id, 'a.py')
    const textarea = document.createElement('textarea')
    textarea.value = oneShot.prompt + '\r\n修改颜色'
    expect(textarea.value).not.toContain('\r')
    expect(store.prepareLinkedEdit(scope.key, textarea.value)).toBe(textarea.value)
    expect(store.$editRequests.get()).toEqual([oneShot])
  })

  it('ignores expired and other-scope one-shot prompts for automatic snapshot precedence', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    store.setSelection(id, { from: 0, to: 8, text: 'print(1)' })
    const expired = store.prepareEdit(id, 'a.py')
    store.prepareEdit(id, 'a.py')
    const otherScope = { ...scope, key: 'other-session', sessionId: 'other-session' }
    const other = store.openSource(otherScope, 'one-shot', 'print(3)', 'python')
    store.setSelection(other, { from: 0, to: 8, text: 'print(3)' })
    const outside = store.prepareEdit(other, 'b.py')
    for (const instruction of [expired.prompt, outside.prompt]) {
      const prompt = store.prepareLinkedEdit(scope.key, instruction)
      expect(prompt).not.toBe(instruction)
      expect(store.$editRequests.get().at(-1)).toMatchObject({ source: 'linked', documentId: id, baseline: 'print(1)' })
    }
  })

  it('rejects copied prior linked envelopes without creating nested snapshots or disturbing queued requests', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)\r\n', 'python')
    store.linkScript(id, 'a.py')
    const previous = store.prepareLinkedEdit(scope.key, '改颜色')
    const retained = store.$editRequests.get()
    for (const pasted of [previous, previous.replace(/\r\n/g, '\n') + '\n继续改标题']) {
      expect(() => store.prepareLinkedEdit(scope.key, pasted)).toThrow('请只填写本轮要求，脚本草稿会自动附上')
      expect(store.$editRequests.get()).toEqual(retained)
    }
    // Rejection also covers a prior request no longer retained in this window.
    store.$editRequests.set([])
    expect(() => store.prepareLinkedEdit(scope.key, previous)).toThrow('请只填写本轮要求，脚本草稿会自动附上')
    expect(store.$editRequests.get()).toEqual([])
  })

  it('supports empty drafts and uses the saved path as its current label', async () => {
    const api = services(), store = createCodeEditorStore(api)
    const id = store.openSource(scope, 'linked-empty', '', 'python')
    store.linkScript(id, '未命名脚本')
    store.prepareLinkedEdit(scope.key, '创建脚本')
    expect(store.$editRequests.get().at(-1)?.baseline).toBe('')
    await store.save(id, 'analysis.py')
    expect(store.linkedScript(scope.key)?.label).toBe('/work/a.py')
    store.prepareLinkedEdit(scope.key, '继续')
    expect(store.$editRequests.get().at(-1)?.label).toBe('/work/a.py')
  })

  it('isolates associations by full scope and rejects non-native sessions', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    const remote = { ...scope, key: 'remote-same-session', owner: { ...scope.owner, connectionId: 'remote' } }
    store.openSource(remote, 'linked', 'print(2)', 'python')
    expect(store.linkedScript(remote.key)).toBeUndefined()
    expect(store.prepareLinkedEdit(remote.key, 'remote message')).toBe('remote message')
    store.$linkedScripts.set({ ...store.$linkedScripts.get(), [remote.key]: { documentId: id, label: 'a.py' } })
    expect(store.linkedScript(remote.key)).toBeUndefined()
    expect(() => store.prepareLinkedEdit(remote.key, 'remote message')).toThrow()
    store.unlinkScript(remote.key)
    const terminal = store.openSource({ ...scope, key: 'terminal', kind: 'pty' }, 'linked', 'print(1)', 'python')
    expect(() => store.linkScript(terminal, 'a.py')).toThrow()
    const noSession = store.openSource({ ...scope, key: 'no-session', sessionId: undefined }, 'linked', '', 'python')
    expect(() => store.linkScript(noSession, 'a.py')).toThrow()
    const freshWindow = createCodeEditorStore(services())
    expect(freshWindow.linkedScript(scope.key)).toBeUndefined()
  })

  it('retains independent pending requests, including linked requests when a one-shot request is prepared', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    store.prepareLinkedEdit(scope.key, 'first')
    const first = store.$editRequests.get().at(-1)!
    store.prepareLinkedEdit(scope.key, 'second')
    const second = store.$editRequests.get().at(-1)!
    store.setSelection(id, { from: 0, to: 8, text: 'print(1)' })
    const oneShot = store.prepareEdit(id, 'a.py')
    expect(store.$editRequests.get()).toEqual([first, second, oneShot])
    store.reviewEdit(first.id, scope.key, 'print(2)', 'python')
    store.applyEdit(first.id, scope.key, 'print(2)', 'document', (_before, after) => store.edit(id, after))
    expect(store.editProblem(second.id, scope.key)).toBe('原脚本草稿已改变，请在对话中重新提出修改要求，避免覆盖后续修改')
    expect(store.$editRequests.get()).toEqual([second, oneShot])
  })

  it('bounds retained requests and keeps each latest snapshot intact', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', '', 'python')
    store.linkScript(id, 'a.py')
    for (let i = 0; i < 35; i++) { store.edit(id, String(i)); store.prepareLinkedEdit(scope.key, 'modify ' + i) }
    expect(store.$editRequests.get()).toHaveLength(32)
    expect(store.$editRequests.get()[0]?.baseline).toBe('3')
    expect(store.$editRequests.get().at(-1)?.baseline).toBe('34')
  })

  it('fails before submission for invalid associations, busy documents or oversized drafts', () => {
    const store = createCodeEditorStore(services())
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    store.edit(id, '研'.repeat(50_000))
    expect(() => store.prepareLinkedEdit(scope.key, '修改')).toThrow(/128/)
    expect(store.$editRequests.get()).toEqual([])
    store.edit(id, 'print(1)')
    store.$documents.set({ ...store.$documents.get(), [id]: { ...store.$documents.get()[id]!, running: true } })
    expect(() => store.prepareLinkedEdit(scope.key, '修改')).toThrow()
    store.$documents.set({})
    expect(() => store.prepareLinkedEdit(scope.key, '修改')).toThrow()
  })

  it('returning to the association invalidates an in-flight file selection', async () => {
    const api = services(), store = createCodeEditorStore(api)
    const id = store.openSource(scope, 'linked', 'print(1)', 'python')
    store.linkScript(id, 'a.py')
    const pending = deferred<{ path: string; text: string; version: string }>()
    api.read = vi.fn(() => pending.promise)
    const opening = store.openFile(scope, 'other.py')
    store.openLinkedScript(scope.key)
    pending.resolve({ path: '/work/other.py', text: 'unrelated', version: 'v1' })
    await opening
    expect(store.current(scope.key)?.id).toBe(id)
  })
})
