import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminalDock } from '../../src/ui/dock.js'
vi.mock('../../src/ui/terminal.js', () => ({ TerminalPane: ({ onInput }: any) => <textarea aria-label="terminal input" onKeyDown={e => { if (e.key === 'Enter') onInput?.('\r') }} /> }))
function mount(get: any, exited = false) {
  const onInput = vi.fn(), onCloseDock = vi.fn()
  render(<TerminalDock client={{ get }} terminals={[{ sessionId: 't', projectId: 'p', agentId: 'shell', kind: 'pty', state: exited ? 'exited' : 'alive', pinned: false, sortOrder: 0, createdAt: '2026-10-23T00:00:00Z' }]} currentId="t" canOpen fullPage onPick={() => {}} onNew={() => {}} onClose={() => {}} onCloseDock={onCloseDock} onInput={onInput} />)
  return { onInput, onCloseDock }
}
it('clears a transient mode-read error once the connection recovers', async () => {
  let reads = 0
  mount(vi.fn(async () => { if (++reads === 1) throw Error('temporary mode read error'); return { mode: 'normal' } }))
  await screen.findByText('temporary mode read error')
  await waitFor(() => expect((screen.getByRole('button', { name: 'DAWN 模式' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 1500 })
  await waitFor(() => expect(screen.queryByText('temporary mode read error')).toBeNull(), { timeout: 1500 })
})
it('clears an old start error after dawn is successfully entered by typing the command', async () => {
  let mode = 'normal'
  mount(vi.fn(async (op: string) => { if (op === 'setTerminalAgentMode') throw Error('not at a ready prompt'); return { mode } }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'DAWN 模式' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'DAWN 模式' }))
  await screen.findByText('not at a ready prompt')
  mode = 'dawn'
  await waitFor(() => expect(screen.getByRole('button', { name: 'DAWN 模式' }).getAttribute('aria-pressed')).toBe('true'), { timeout: 1500 })
  expect(screen.queryByText('not at a ready prompt')).toBeNull()
})
it('an exited terminal retains its return path but cannot accept input or start an Agent', async () => {
  const f = mount(vi.fn(async () => ({ mode: 'normal' })), true)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Normal 模式' }).getAttribute('aria-pressed')).toBe('true'))
  expect((screen.getByRole('button', { name: 'DAWN 模式' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'terminal input' }), { key: 'Enter' })
  expect(f.onInput).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  expect(f.onCloseDock).toHaveBeenCalledOnce()
})
it('removes both conversation actions and the mode switch after the last terminal closes', async () => {
  const terminal = { sessionId: 't', projectId: 'p', agentId: 'shell', kind: 'pty' as const, state: 'alive' as const, pinned: false, sortOrder: 0, createdAt: '2026-10-24T00:00:00Z' }
  const props = { client: { get: vi.fn(async () => ({ mode: 'dawn', sessionId: 'agent' })) as never }, canOpen: true, fullPage: true, onPick: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), onCloseDock: vi.fn(), onInput: vi.fn() }
  const view = render(<TerminalDock {...props} terminals={[terminal]} currentId="t" />)
  await waitFor(() => expect((screen.getByRole('button', { name: '导出会话' }) as HTMLButtonElement).disabled).toBe(false))
  view.rerender(<TerminalDock {...props} terminals={[]} currentId={undefined} />)
  expect(screen.queryByRole('button', { name: '搜索历史' })).toBeNull()
  expect(screen.queryByRole('button', { name: '导出会话' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Normal 模式' })).toBeNull()
})

it('shows permissions only for the active DAWN Agent and removes them on Normal/last-close', async () => {
  let mode = 'dawn'
  const get = vi.fn(async (op: string) => op === 'getSessionPermission' ? { current: 'ask-risky', effective: 'ask-risky' } : { mode, sessionId: 'agent' })
  mount(get)
  await screen.findByRole('button', { name: '请求批准' })
  mode = 'normal'
  await waitFor(() => expect(screen.queryByRole('button', { name: '请求批准' })).toBeNull(), { timeout: 1800 })
})

it('shows the remote label and full live directory in the existing terminal header', async () => {
  let cwd = '/remote/initial'
  const get = vi.fn(async (_op: string) => ({ mode: 'normal', sessionId: 'owner', remote: { connectionId: 'server', label: 'Research server', cwd } }))
  mount(get)
  await screen.findByText('Research server:/remote/initial')
  cwd = '/remote/new directory'
  await screen.findByText('Research server:/remote/new directory', {}, { timeout: 1600 })
  expect(get.mock.calls.some(([op]) => op === 'selectTerminal')).toBe(false)
})
