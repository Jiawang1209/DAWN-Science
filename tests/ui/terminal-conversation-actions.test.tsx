import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TerminalConversationActions } from '../../src/ui/terminal-conversation-actions.js'
it('shows only content search and session export, with a reason when no DAWN conversation is bound', () => {
  const find = vi.fn(), get = vi.fn()
  render(<TerminalConversationActions client={{ get: get as never }} terminalId="t" onFind={find} />)
  fireEvent.click(screen.getByRole('button', { name: '搜索历史' })); expect(find).toHaveBeenCalledOnce()
  expect((screen.getByRole('button', { name: '导出会话' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: '找回输入' })).toBeNull()
  expect(screen.getByText('进入 DAWN 模式后可导出会话')).toBeTruthy(); expect(get).not.toHaveBeenCalled()
})
it('exports the bound Agent conversation through the same operation as the GUI', async () => {
  const get = vi.fn(async op => op === 'getTerminalAgentMode' ? { mode: 'dawn', sessionId: 'bound-agent' } : { path: '/work/docs/current.md', turns: 6 })
  render(<TerminalConversationActions client={{ get: get as never }} terminalId="pty" sessionId="bound-agent" onFind={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '导出会话' }))
  await screen.findByText('已导出 6 轮到 /work/docs/current.md')
  expect(get).toHaveBeenCalledWith('getTerminalAgentMode', { terminalId: 'pty' })
  expect(get).toHaveBeenCalledWith('exportSession', { sessionId: 'bound-agent' })
})
it('refuses a changed binding and lets an export failure be retried', async () => {
  let target = 'other'
  const get = vi.fn(async op => op === 'getTerminalAgentMode' ? { mode: 'normal', sessionId: target } : Promise.reject(Error('write failed')))
  render(<TerminalConversationActions client={{ get: get as never }} terminalId="pty" sessionId="bound" onFind={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '导出会话' })); await screen.findByText(/当前终端会话已变化/)
  expect(get.mock.calls.some(([op]) => op === 'exportSession')).toBe(false)
  target = 'bound'; fireEvent.click(screen.getByRole('button', { name: '导出会话' })); await screen.findByText(/write failed/)
  await waitFor(() => expect((screen.getByRole('button', { name: '导出会话' }) as HTMLButtonElement).disabled).toBe(false))
})
it('drops an old export result after switching terminals and ignores duplicate clicks', async () => {
  let finish!: (value: unknown) => void
  const get = vi.fn(async op => op === 'getTerminalAgentMode' ? { mode: 'dawn', sessionId: 'old' } : new Promise(resolve => { finish = resolve }))
  const view = render(<TerminalConversationActions client={{ get: get as never }} terminalId="A" sessionId="old" onFind={() => {}} />)
  const button = screen.getByRole('button', { name: '导出会话' }); fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  expect(get.mock.calls.filter(([op]) => op === 'exportSession')).toHaveLength(1)
  view.rerender(<TerminalConversationActions client={{ get: get as never }} terminalId="B" sessionId="new" onFind={() => {}} />)
  finish({ path: '/old.md', turns: 1 }); await Promise.resolve()
  expect(screen.queryByText(/old.md/)).toBeNull()
  view.rerender(<TerminalConversationActions client={{ get: get as never }} terminalId="A" sessionId="old" onFind={() => {}} />)
  expect((screen.getByRole('button', { name: '导出会话' }) as HTMLButtonElement).disabled).toBe(false)
})
