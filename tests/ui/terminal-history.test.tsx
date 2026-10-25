import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminalDock } from '../../src/ui/dock.js'
vi.mock('../../src/ui/terminal.js', () => ({ TerminalPane: () => <div /> }))
const record = { sessionId: 'saved', projectId: 'p', agentId: 'chat', kind: 'native' as const, state: 'exited' as const, title: 'SAVED_IMAGE_CONVERSATION', pinned: false, sortOrder: 0, createdAt: '2026-10-23T00:00:00Z' }
function mount() {
  const get = vi.fn(async (op: string) => op === 'listTerminalAgentHistory' ? [record] : op === 'getTerminalAgentAttachments' ? { revision: 0, pending: [] } : { mode: 'normal' })
  render(<TerminalDock client={{ get } as any} terminals={[{ ...record, sessionId: 't', kind: 'pty', state: 'alive' }]} currentId="t" canOpen fullPage onPick={() => {}} onNew={() => {}} onClose={() => {}} onCloseDock={() => {}} onInput={() => {}} />)
  return get
}
it('keeps mode switching and return available without the removed history toolbar entry', async () => {
  const get = mount()
  const agent = screen.getByRole('button', { name: 'DAWN 模式' })
  await waitFor(() => expect((agent as HTMLButtonElement).disabled).toBe(false))
  expect(screen.queryByRole('button', { name: '接续旧对话' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Normal 模式' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '返回会话' })).toBeTruthy()
  expect(get.mock.calls.some(([op]) => op === 'listTerminalAgentHistory')).toBe(false)
  fireEvent.click(agent)
  await waitFor(() => expect(get).toHaveBeenCalledWith('setTerminalAgentMode', { terminalId: 't', mode: 'dawn' }))
})
