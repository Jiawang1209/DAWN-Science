import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationView, EmptyConversation, type 图片来源 } from '../../src/ui/views.js'
import { setDraft } from '../../src/ui/state/view.js'
import type { SessionSummary } from '../../src/protocol/index.js'

const session: SessionSummary = { sessionId: 'recovery-A', projectId: 'p', agentId: 'ds-chat', kind: 'native', pinned: false, sortOrder: 0, state: 'alive', createdAt: '2026-11-16' }
const plan = [{ id: 'dawn.plan', name: '先出方案', category: 'plan', kind: 'boolean' as const, current: '', options: [] }]
function deferred() {
  let reject!: (error: Error) => void
  const promise = new Promise<void>((_resolve, fail) => { reject = fail })
  return { promise, reject }
}
const box = () => screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
async function submit(text: string) {
  fireEvent.change(box(), { target: { value: text } })
  await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
}
async function attach(name: string, type: string) {
  const file = new File(['data'], name, { type })
  await act(async () => { fireEvent.paste(box(), { clipboardData: { files: [file], items: [{ kind: 'file', type, getAsFile: () => file }], getData: () => '' } }) })
}
const images = () => [...document.querySelectorAll('.attached-one button[aria-label^="不发这张"]')].map(node => node.getAttribute('aria-label'))
afterEach(() => { cleanup(); delete window.dawn })

describe('late composer failures preserve newer drafts', () => {
  it.each(['send', 'compact', 'plan'] as const)('%s restores before newer input without losing pasted reference guards', async mode => {
    const pending = deferred()
    const action = () => pending.promise
    const original = mode === 'send' ? 'first @\u2060data.csv' : mode === 'compact' ? '/compact keep X' : '/plan'
    render(<ConversationView session={session} items={[]} onSend={mode === 'send' ? action : () => {}}
      {...(mode === 'compact' ? { onCompact: action } : mode === 'plan' ? { onSetPlan: action, 会话开关们: plan } : {})} />)
    await submit(original)
    fireEvent.change(box(), { target: { value: 'new unsent draft' } })
    await act(async () => { pending.reject(new Error('late failure')) })
    expect(box().value).toBe(`${original}\n\nnew unsent draft`)
    expect(screen.getByText(/late failure/)).toBeTruthy()
  })

  it.each(['send', 'compact', 'plan', 'welcome'] as const)('%s waits for active composition before restoring failed text', async mode => {
    const pending = deferred()
    const action = () => pending.promise
    const original = mode === 'compact' ? '/compact keep X' : mode === 'plan' ? '/plan' : 'first request'
    render(mode === 'welcome'
      ? <EmptyConversation agents={['ds-chat']} onStart={action} onOpenSettings={() => {}} />
      : <ConversationView session={session} items={[]} onSend={mode === 'send' ? action : () => {}}
          {...(mode === 'compact' ? { onCompact: action } : mode === 'plan' ? { onSetPlan: action, 会话开关们: plan } : {})} />)
    await submit(original)
    fireEvent.compositionStart(box())
    fireEvent.change(box(), { target: { value: 'zhong' } })
    await act(async () => { pending.reject(new Error('late failure')) })
    expect(box().value).toBe('zhong')
    box().value = '中文'
    fireEvent.compositionEnd(box())
    expect(box().value).toBe(`${original}\n\n中文`)
  })

  it.each(['send', 'attachSave'] as const)('%s failure keeps old and newly attached images and file tokens', async failure => {
    const pending = deferred()
    const attachSave = vi.fn(async (_workspace: string, _sessionId: string, files: { 名: string }[]) => {
      if (failure === 'attachSave') await pending.promise
      return { 相对路径们: files.map(file => `attachments/${file.名}`) }
    })
    const onSend = vi.fn((_text: string, _images?: readonly 图片来源[]) => failure === 'send' ? pending.promise : Promise.resolve())
    window.dawn = { pathForFile: (file: File) => `/tmp/${file.name}`, attachSave } as unknown as NonNullable<typeof window.dawn>
    render(<ConversationView session={session} items={[]} workspace="/work" onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'first' } })
    await attach('first.csv', 'text/csv'); await attach('first.png', 'image/png')
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    fireEvent.change(box(), { target: { value: 'new' } })
    await attach('new.csv', 'text/csv'); await attach('new.png', 'image/png')
    await act(async () => { pending.reject(new Error('late failure')) })
    expect(box().value).toBe('first @first.csv\n\nnew @new.csv ')
    expect(images()).toEqual(['不发这张：first.png', '不发这张：new.png'])
    attachSave.mockImplementation(async (_workspace, _sessionId, files) => ({ 相对路径们: files.map(file => `attachments/${file.名}`) }))
    onSend.mockResolvedValue(undefined)
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    expect(attachSave.mock.calls.at(-1)?.[2].map(file => file.名)).toEqual(['first.csv', 'new.csv'])
    expect(onSend.mock.calls.at(-1)?.[1]).toEqual([{ from: 'path', path: '/tmp/first.png' }, { from: 'path', path: '/tmp/new.png' }])
  })

  it('holds a failed submission for its original session while another composer is mounted', async () => {
    const pending = deferred()
    const attachSave = vi.fn(async (_workspace: string, _sessionId: string, files: { 名: string }[]) => ({ 相对路径们: files.map(file => `attachments/${file.名}`) }))
    window.dawn = { pathForFile: (file: File) => `/tmp/${file.name}`, attachSave } as unknown as NonNullable<typeof window.dawn>
    const onSend = vi.fn(() => pending.promise)
    const view = render(<ConversationView key="A" session={session} items={[]} workspace="/work" onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'first' } })
    await attach('first.csv', 'text/csv'); await attach('first.png', 'image/png')
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    const other = { ...session, sessionId: 'recovery-B' }
    view.rerender(<ConversationView key="B" session={other} items={[]} workspace="/other" onSend={() => {}} />)
    fireEvent.change(box(), { target: { value: 'B draft' } })
    await attach('B.png', 'image/png')
    act(() => { setDraft(session.sessionId, 'new A draft') })
    await act(async () => { pending.reject(new Error('late A failure')) })
    expect(box().value).toBe('B draft')
    expect(images()).toEqual(['不发这张：B.png'])
    view.rerender(<ConversationView key="A" session={session} items={[]} workspace="/work" onSend={() => {}} />)
    expect(box().value).toBe('first @first.csv\n\nnew A draft')
    expect(images()).toEqual(['不发这张：first.png'])
    // Further renders must not consume the same returned image twice.
    fireEvent.change(box(), { target: { value: `${box().value} more` } })
    expect(images()).toEqual(['不发这张：first.png'])
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    expect(attachSave.mock.calls.at(-1)?.[2].map(file => file.名)).toEqual(['first.csv'])
  })

  it('lets the remounted original session finish composition before claiming an older send failure', async () => {
    const pending = deferred()
    const view = render(<ConversationView key="A" session={session} items={[]} onSend={() => pending.promise} />)
    await submit('first request')
    view.rerender(<ConversationView key="B" session={{ ...session, sessionId: 'recovery-B' }} items={[]} onSend={() => {}} />)
    view.rerender(<ConversationView key="A" session={session} items={[]} onSend={() => {}} />)
    fireEvent.compositionStart(box())
    fireEvent.change(box(), { target: { value: 'zhong' } })
    await act(async () => { pending.reject(new Error('old request failed')) })
    expect(box().value).toBe('zhong')
    box().value = '中文'
    fireEvent.compositionEnd(box())
    expect(box().value).toBe('first request\n\n中文')
  })

  it('preserves newer welcome input when creating the first session fails', async () => {
    const pending = deferred()
    render(<EmptyConversation agents={['ds-chat']} onStart={() => pending.promise} onOpenSettings={() => {}} />)
    await submit('first request')
    fireEvent.change(box(), { target: { value: 'new request' } })
    await act(async () => { pending.reject(new Error('create failed')) })
    expect(box().value).toBe('first request\n\nnew request')
  })

  it('keeps newer welcome attachments alongside the failed first submission', async () => {
    const pending = deferred()
    window.dawn = { pathForFile: (file: File) => `/tmp/${file.name}` } as NonNullable<typeof window.dawn>
    const onStart = vi.fn<React.ComponentProps<typeof EmptyConversation>['onStart']>(() => pending.promise)
    render(<EmptyConversation agents={['ds-chat']} onStart={onStart} onOpenSettings={() => {}} />)
    await attach('first.csv', 'text/csv'); await attach('first.png', 'image/png')
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    await attach('new.csv', 'text/csv'); await attach('new.png', 'image/png')
    await act(async () => { pending.reject(new Error('create failed')) })
    expect(box().value).toBe('@first.csv\n\n@new.csv ')
    expect(images()).toEqual(['不发这张：first.png', '不发这张：new.png'])
    onStart.mockResolvedValue(undefined)
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    expect(onStart.mock.calls.at(-1)?.[3]).toEqual([{ from: 'path', path: '/tmp/first.png' }, { from: 'path', path: '/tmp/new.png' }])
    expect(onStart.mock.calls.at(-1)?.[4]?.map(file => file.名)).toEqual(['first.csv', 'new.csv'])
  })
})
