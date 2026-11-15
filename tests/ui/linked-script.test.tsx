import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinkedScript, followEditorScript, openEditorFile } from '../../src/ui/linked-script.js'
import { createCodeEditorStore } from '../../src/ui/state/code-editor.js'
import { createLinkedScriptEditRequest } from '../../src/ui/code-editor-ai.js'
import { ConversationView } from '../../src/ui/views.js'

function setup() {
  const store = createCodeEditorStore({ read: vi.fn(), save: async () => ({ path: '/work/final.R', version: 'v1', bytes: 8 }), run: vi.fn() })
  const scope = { key: 'scope', owner: { sessionId: 's' }, sessionId: 's', kind: 'native', label: '本机' }
  const id = store.openSource(scope, 'initial', 'print(1)', 'R')
  return { store, scope, id }
}
describe('chat script association', () => {
  it('automatically follows a newly opened editor draft while preserving old drafts and other sessions', () => {
    const { store, scope, id } = setup()
    followEditorScript(store, scope.key)
    expect(store.linkedScript(scope.key)?.document.id).toBe(id)
    const nextId = store.openSource(scope, 'second', 'print(2)', 'R')
    followEditorScript(store, scope.key)
    expect(store.linkedScript(scope.key)?.document.id).toBe(nextId)
    expect(store.$documents.get()[id]?.text).toBe('print(1)')
    expect(store.linkedScript('another')).toBeUndefined()
    store.unlinkScript(scope.key)
    expect(store.linkedScript(scope.key)).toBeUndefined()
    expect(store.$documents.get()[nextId]?.text).toBe('print(2)')
  })

  it('ending script connection prevents a pending file open from reopening or reconnecting it', async () => {
    let resolve!: (value: { path: string; text: string; version: string }) => void
    const store = createCodeEditorStore({ read: () => new Promise(r => { resolve = r }), save: vi.fn(), run: vi.fn() })
    const scope = { key: 'scope', owner: { sessionId: 's' }, sessionId: 's', kind: 'native', label: '本机' }
    store.openSource(scope, 'a', 'print(1)', 'R')
    followEditorScript(store, scope.key)
    const onOpen = vi.fn()
    const pending = openEditorFile(store, scope, 'b.R', () => true).then(opened => { if (opened) onOpen() })
    render(<LinkedScript store={store} scopeKey={scope.key} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: '结束脚本联动' }))
    await act(async () => { resolve({ path: '/work/b.R', text: 'print(2)', version: 'v1' }); await pending })
    expect(onOpen).not.toHaveBeenCalled()
    expect(store.linkedScript(scope.key)).toBeUndefined()
  })

  it('shows the linked target, follows its saved name and reopens it even when another file is active', async () => {
    const { store, scope, id } = setup()
    const onOpen = vi.fn()
    render(<LinkedScript store={store} scopeKey={scope.key} onOpen={onOpen} />)
    expect(screen.queryByLabelText('会话关联脚本')).toBeNull()
    act(() => store.linkScript(id, 'draft.R'))
    expect(screen.getByText('draft.R')).toBeTruthy()
    await act(async () => { await store.save(id, 'final.R') })
    expect(screen.getByText('final.R')).toBeTruthy()
    act(() => store.openSource(scope, 'another', 'x <- 2', 'R'))
    fireEvent.click(screen.getByRole('button', { name: '打开关联脚本：/work/final.R' }))
    expect(store.current(scope.key)?.id).toBe(id)
    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '结束脚本联动' }))
    expect(screen.queryByLabelText('会话关联脚本')).toBeNull()
  })
  it('keeps connection controls outside the composer, in the editor or compact conversation header', () => {
    const { store, scope, id } = setup()
    followEditorScript(store, scope.key)
    const session = { sessionId: 's', projectId: 'p', agentId: 'ds-chat', kind: 'native' as const, pinned: false, sortOrder: 1, state: 'alive' as const, createdAt: '' }
    const { container, rerender } = render(<ConversationView session={session} items={[]} onSend={() => {}} scriptContext={<LinkedScript store={store} scopeKey={scope.key} placement="header" onOpen={() => {}} />} />)
    expect(container.querySelector('.composer .linked-script')).toBeNull()
    expect(container.querySelector('.conv-head .linked-script')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '结束脚本联动' })).toBeNull()
    rerender(<ConversationView session={session} items={[]} onSend={() => {}} scriptContext={undefined} />)
    expect(container.querySelector('.linked-script')).toBeNull()
  })

  it('collapses exact attached source in the user turn and displays the modification request first', () => {
    const { store, scope, id } = setup()
    const req = createLinkedScriptEditRequest(store.$documents.get()[id]!, '/work/project/plot.R', '请更改标题', 'collapse')
    const { container } = render(<ConversationView session={{ sessionId: 's', projectId: 'p', agentId: 'ds-chat', kind: 'native', pinned: false, sortOrder: 1, state: 'alive', createdAt: '' }} items={[{ type: 'turn', who: 'user', id: 'u', text: req.prompt, final: true }]} onSend={() => {}} />)
    expect(container.querySelector('.turn.user .text')?.textContent).toBe('请更改标题')
    const details = container.querySelector<HTMLDetailsElement>('.linked-script-snapshot')!
    expect(details).toBeTruthy()
    expect(details.open).toBe(false)
    expect(details.querySelector('pre')?.textContent).toContain('print(1)')
    expect(details.querySelector('summary')?.textContent).toBe('本轮脚本快照：plot.R')
    expect(details.querySelector('summary')?.getAttribute('aria-label')).toBe('本轮脚本快照：/work/project/plot.R')
  })
})
