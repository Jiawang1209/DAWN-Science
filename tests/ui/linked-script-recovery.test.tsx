import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConversationView } from '../../src/ui/views.js'
import { createCodeEditorStore } from '../../src/ui/state/code-editor.js'
import { draftOf, setDraft, 退回输入框, 领退回的图 } from '../../src/ui/state/view.js'
import { splitLinkedScriptPrompt } from '../../src/protocol/script-context.js'
import { resetAllState } from '../../src/ui/state/index.js'
import type { SessionSummary } from '../../src/protocol/index.js'

const session: SessionSummary = { sessionId: 'recover', projectId: 'p', agentId: 'chat', kind: 'native', pinned: false, sortOrder: 1, state: 'alive', createdAt: '' }
const scope = { key: 'scope', owner: { sessionId: session.sessionId }, sessionId: session.sessionId, kind: 'native', label: '本机' }
beforeEach(resetAllState)
afterEach(cleanup)
function script() {
  const store = createCodeEditorStore({ read: vi.fn(), save: vi.fn(), run: vi.fn() })
  const id = store.openSource(scope, 'source', 'print(1)', 'python')
  store.linkScript(id, 'analysis.py')
  return { store, id }
}

describe('restore linked instructions without stale source snapshots', () => {
  it('recalls queued text and images into the same session and snapshots the latest draft on resend', () => {
    const { store, id } = script()
    const queued = store.prepareLinkedEdit(scope.key, '改成蓝色')
    setDraft(session.sessionId, '保留输入框里的字')
    setDraft('other', '另一段草稿')
    const image = { from: 'path' as const, path: '/work/plot.png' }
    退回输入框(session.sessionId, [{ text: queued, images: [image] }])
    expect(draftOf(session.sessionId)).toBe('保留输入框里的字\n\n改成蓝色')
    expect(draftOf('other')).toBe('另一段草稿')
    expect(领退回的图(session.sessionId)).toEqual([image])
    store.edit(id, 'print(2) # latest unsaved draft')
    const sent = store.prepareLinkedEdit(scope.key, draftOf(session.sessionId))
    expect(splitLinkedScriptPrompt(sent)?.instruction).toBe('保留输入框里的字\n\n改成蓝色')
    expect(store.$editRequests.get().at(-1)?.baseline).toBe('print(2) # latest unsaved draft')
  })
  it('restores several stopped queued instructions and leaves ordinary text unchanged', () => {
    const { store } = script()
    const first = store.prepareLinkedEdit(scope.key, '第一条要求')
    const second = store.prepareLinkedEdit(scope.key, '第二条要求')
    退回输入框(session.sessionId, [{ text: first }, { text: '普通消息' }, { text: second }])
    expect(draftOf(session.sessionId)).toBe('第一条要求\n\n普通消息\n\n第二条要求')
  })
  it('edits only the historical instruction then sends a new snapshot instead of the expired/applied envelope', async () => {
    const { store, id } = script()
    const previous = store.prepareLinkedEdit(scope.key, '改标题')
    store.edit(id, 'print(7) # manually updated')
    const onSend = vi.fn(), onEcho = vi.fn((_text: string) => () => {})
    render(<ConversationView session={session} items={[{ type: 'turn', id: 'u', who: 'user', text: previous, final: true }]} onSend={onSend} onEcho={onEcho} prepareMessage={text => store.prepareLinkedEdit(scope.key, text)} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改$/ }))
    const edit = screen.getByRole('textbox', { name: '修改这段话' }) as HTMLTextAreaElement
    expect(edit.value).toBe('改标题')
    fireEvent.change(edit, { target: { value: '改成新标题' } })
    await act(async () => { fireEvent.keyDown(edit, { key: 'Enter' }) })
    const sent = onSend.mock.calls[0]![0] as string
    expect(splitLinkedScriptPrompt(sent)?.instruction).toBe('改成新标题')
    expect(splitLinkedScriptPrompt(sent)?.context).toContain('print(7) # manually updated')
    expect(sent).not.toBe(previous)
    expect(onEcho.mock.calls[0]?.[0]).toBe(sent)
  })
  it('recalls only instructions with arrow history and preserves the unfinished draft', async () => {
    const { store, id } = script()
    const previous = store.prepareLinkedEdit(scope.key, '改标题')
    setDraft(session.sessionId, '未发送的半句话')
    const onSend = vi.fn()
    render(<ConversationView session={session} items={[{ type: 'turn', id: 'u', who: 'user', text: previous, final: true }]} onSend={onSend} prepareMessage={text => store.prepareLinkedEdit(scope.key, text)} />)
    const composer = screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
    composer.setSelectionRange(0, 0)
    fireEvent.keyDown(composer, { key: 'ArrowUp' })
    expect(composer.value).toBe('改标题')
    fireEvent.keyDown(composer, { key: 'ArrowDown' })
    expect(composer.value).toBe('未发送的半句话')
    fireEvent.keyDown(composer, { key: 'ArrowUp' })
    store.edit(id, 'print(8) # current draft')
    await act(async () => { fireEvent.keyDown(composer, { key: 'Enter' }) })
    const sent = onSend.mock.calls[0]![0] as string
    expect(splitLinkedScriptPrompt(sent)?.instruction).toBe('改标题')
    expect(splitLinkedScriptPrompt(sent)?.context).toContain('print(8) # current draft')
  })

  it.each(['preparation', 'send'] as const)('keeps the edited instruction and existing composer draft on %s failure', async failure => {
    const { store } = script()
    const previous = store.prepareLinkedEdit(scope.key, '改标题')
    setDraft(session.sessionId, '正在输入另一句话')
    const onSend = vi.fn(async () => { if (failure === 'send') throw new Error('发送失败') })
    render(<ConversationView session={session} items={[{ type: 'turn', id: 'u', who: 'user', text: previous, final: true }]} onSend={onSend} prepareMessage={text => { if (failure === 'preparation') throw new Error('草稿不能附上'); return store.prepareLinkedEdit(scope.key, text) }} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改$/ }))
    const edit = screen.getByRole('textbox', { name: '修改这段话' })
    fireEvent.change(edit, { target: { value: '我的新要求' } })
    await act(async () => { fireEvent.keyDown(edit, { key: 'Enter' }) })
    expect(draftOf(session.sessionId)).toBe('正在输入另一句话\n\n我的新要求')
    if (failure === 'preparation') expect(onSend).not.toHaveBeenCalled()
  })
})
