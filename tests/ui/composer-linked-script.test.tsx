import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConversationView } from '../../src/ui/views.js'
import { resetAllState } from '../../src/ui/state/index.js'
import { createCodeEditorStore } from '../../src/ui/state/code-editor.js'
import { 请求内核语言, 扫引用, 剥掉粘贴标记 } from '../../src/files/mentions.js'
import { scriptEditForReply, splitLinkedScriptPrompt } from '../../src/ui/code-editor-ai.js'
import type { SessionSummary } from '../../src/protocol/index.js'

const session: SessionSummary = { sessionId: 'linked', projectId: 'p', agentId: 'ds-chat', kind: 'native', pinned: false, sortOrder: 1, state: 'alive', createdAt: '2026-11-15T00:00:00Z' }
beforeEach(resetAllState)
afterEach(() => { cleanup(); delete window.dawn })
const payload = (text: string) => `${text}\n\nCURRENT DRAFT SNAPSHOT`
function setup(over: Partial<React.ComponentProps<typeof ConversationView>> = {}) {
  const onSend = vi.fn(), onEcho = vi.fn((_text: string) => vi.fn()), prepareMessage = vi.fn(payload)
  render(<ConversationView session={session} items={[]} onSend={onSend} onEcho={onEcho} prepareMessage={prepareMessage} {...over} />)
  const box = screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
  const send = async (text: string) => { fireEvent.change(box, { target: { value: text } }); await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) }) }
  return { onSend, onEcho, prepareMessage, box, send }
}
describe('linked script at the composer submission boundary', () => {
  it('prepares once before echo and send and leaves the composer empty', async () => {
    const { send, onEcho, onSend, prepareMessage, box } = setup()
    await send('改成蓝色')
    expect(prepareMessage).toHaveBeenCalledExactlyOnceWith('改成蓝色')
    expect(onEcho.mock.calls[0]?.[0]).toBe(payload('改成蓝色'))
    expect(onSend).toHaveBeenCalledExactlyOnceWith(payload('改成蓝色'))
    expect(box.value).toBe('')
  })
  it('refuses invalid snapshots before clearing input or echoing', async () => {
    const { send, onSend, onEcho, box } = setup({ prepareMessage: () => { throw new Error('脚本过大，无法关联发送') } })
    await send('保留我的要求')
    expect(onSend).not.toHaveBeenCalled()
    expect(onEcho).not.toHaveBeenCalled()
    expect(box.value).toBe('保留我的要求')
    expect(screen.getByText(/脚本过大，无法关联发送/)).toBeTruthy()
  })
  it('restores only original user input when sending the prepared snapshot fails', async () => {
    const { send, box } = setup({ onSend: async () => { throw new Error('网络失败') } })
    await send('再改一下')
    expect(box.value).toBe('再改一下')
    expect(screen.getByText(/网络失败/)).toBeTruthy()
  })
  it('uses the same prepared snapshot in the follow-up queue without echo', async () => {
    const { send, onSend, onEcho } = setup({ items: [{ type: 'turn', id: 'busy', who: 'agent', text: '生成中', final: false }], onAbort: () => {} })
    await send('改标题')
    expect(onSend).toHaveBeenCalledExactlyOnceWith(payload('改标题'), undefined, 'followUp')
    expect(onEcho).not.toHaveBeenCalled()
  })
  it('keeps slash commands outside script preparation', async () => {
    const { send, prepareMessage, onSend } = setup()
    await send('/help')
    expect(prepareMessage).not.toHaveBeenCalled()
    expect(onSend).toHaveBeenCalledWith('/help')
  })
  it('matches replies after attachment paths change and leaves source token literals untouched', async () => {
    const store = createCodeEditorStore({ read: vi.fn(), save: vi.fn(), run: vi.fn() })
    const id = store.openSource({ key: 's', owner: { sessionId: 'linked' }, sessionId: 'linked', kind: 'native', label: '本机' }, 'source', '# source has @data.csv\nprint(1)', 'python')
    store.linkScript(id, 'script.py')
    const attachSave = vi.fn(async () => ({ 相对路径们: ['uploads/data.csv'] }))
    window.dawn = { clipboardFiles: async () => ['/tmp/data.csv'], attachSave } as unknown as NonNullable<typeof window.dawn>
    const { box, onSend } = setup({ workspace: '/work', prepareMessage: text => store.prepareLinkedEdit('s', text) })
    fireEvent.change(box, { target: { value: '参考这个数据' } })
    fireEvent.paste(box, { clipboardData: { files: [], items: [], getData: () => 'data.csv' } })
    await waitFor(() => expect(box.value).toContain('@data.csv'))
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    const sent = onSend.mock.calls[0]![0] as string
    expect(sent).toContain('@uploads/data.csv')
    expect(splitLinkedScriptPrompt(sent)?.context).toContain('# source has @data.csv')
    const request = store.$editRequests.get()[0]!
    expect(scriptEditForReply([request], [{ type: 'turn', who: 'user', id: 'u', text: sent, final: true }, { type: 'turn', who: 'agent', id: 'a', text: 'done', final: true }], 's', 'a')?.id).toBe(request.id)
  })
  it('does not revive removed attachments when their token appears only inside the script snapshot', async () => {
    const store = createCodeEditorStore({ read: vi.fn(), save: vi.fn(), run: vi.fn() })
    const id = store.openSource({ key: 's', owner: { sessionId: 'linked' }, sessionId: 'linked', kind: 'native', label: '本机' }, 'source', '# @data.csv\nprint(1)', 'python')
    store.linkScript(id, 'script.py')
    const attachSave = vi.fn(async () => ({ 相对路径们: ['uploads/data.csv'] }))
    window.dawn = { clipboardFiles: async () => ['/tmp/data.csv'], attachSave } as unknown as NonNullable<typeof window.dawn>
    const { box } = setup({ workspace: '/work', prepareMessage: text => store.prepareLinkedEdit('s', text) })
    fireEvent.paste(box, { clipboardData: { files: [], items: [], getData: () => 'data.csv' } })
    await waitFor(() => expect(box.value).toContain('@data.csv'))
    fireEvent.change(box, { target: { value: '请修改标题' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(attachSave).not.toHaveBeenCalled()
  })
  it.each([false, true])('preserves pasted shortcut/file guards through submission (linked=%s)', async linked => {
    const store = createCodeEditorStore({ read: vi.fn(), save: vi.fn(), run: vi.fn() })
    const id = store.openSource({ key: 's', owner: { sessionId: 'linked' }, sessionId: 'linked', kind: 'native', label: '本机' }, 'source', 'print(1)', 'python')
    if (linked) store.linkScript(id, 'script.py')
    const { send, onSend } = setup({ prepareMessage: text => store.prepareLinkedEdit('s', text) })
    await send('解释 @\u2060R 和 @\u2060data.csv')
    const sent = onSend.mock.calls[0]![0] as string
    expect(请求内核语言(sent)).toEqual([])
    expect(扫引用(sent)).toEqual([])
    expect(剥掉粘贴标记(sent)).toContain('解释 @R 和 @data.csv')
  })

})
