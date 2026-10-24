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
it('offers the saved conversation and starts its exact identity only after selection', async () => {
  const get = mount()
  const button = screen.getByRole('button', { name: '接续旧对话' })
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(button)
  await screen.findByRole('dialog', { name: '选择历史会话' })
  expect(get).toHaveBeenCalledWith('listTerminalAgentHistory', { terminalId: 't' })
  expect(get.mock.calls.some(([op]) => op === 'setTerminalAgentMode')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'SAVED_IMAGE_CONVERSATION' }))
  await waitFor(() => expect(get).toHaveBeenCalledWith('setTerminalAgentMode', { terminalId: 't', mode: 'dawn', resumeSessionId: 'saved' }))
})
it('cancels history selection without starting or stopping an Agent', async () => {
  const get = mount(), button = screen.getByRole('button', { name: '接续旧对话' })
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button)
  fireEvent.click(await screen.findByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(get.mock.calls.some(([op]) => op === 'setTerminalAgentMode')).toBe(false)
})
