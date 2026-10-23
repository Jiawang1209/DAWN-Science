import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TerminalControlBar } from '../../src/ui/terminal-control.js'
import { $lang } from '../../src/ui/i18n/index.js'
$lang.set('zh')
const initial = { id: 't', instanceId: 'i', pid: 42, cwd: '/work', command: '/bin/bash', alive: true, controlled: false, mode: 'shell' as const, cols: 80, rows: 24, revision: 0 }

it('grants only the selected terminal to the current conversation and can take it back', async () => {
  let state = { ...initial, ownerSessionId: 'chat' }
  const get = vi.fn(async (op: string, p: any) => {
    if (op === 'setTerminalControl') state = { ...state, controlled: p.enabled, mode: p.mode ?? state.mode }
    return state
  })
  render(<TerminalControlBar client={{ get: get as never }} terminalId="t" ownerSessionId="chat" />)
  fireEvent.change(await screen.findByRole('combobox', { name: '当前终端程序' }), { target: { value: 'python' } })
  fireEvent.click(screen.getByRole('button', { name: '交给当前对话' }))
  await screen.findByRole('button', { name: '接回控制' })
  expect(get).toHaveBeenCalledWith('setTerminalControl', { terminalId: 't', ownerSessionId: 'chat', enabled: true, mode: 'python' })
  fireEvent.click(screen.getByRole('button', { name: '接回控制' }))
  await screen.findByRole('button', { name: '交给当前对话' })
  expect(state.controlled).toBe(false)
})

it('does not offer write access without a local native conversation', async () => {
  render(<TerminalControlBar client={{ get: vi.fn(async () => initial) as never }} terminalId="t" />)
  await waitFor(() => expect((screen.getByRole('button', { name: '交给当前对话' }) as HTMLButtonElement).disabled).toBe(true))
  expect(screen.getByText('打开本地内置模型对话后可交给 AI')).toBeTruthy()
})

it('ignores a late control reply after switching terminal and conversation', async () => {
  let finish!: (value: unknown) => void
  const get = vi.fn(async (_op: string, params: any) => params.terminalId === 'old'
    ? new Promise(resolve => { finish = resolve })
    : { ...initial, id: 'new', ownerSessionId: 'next' })
  const { rerender } = render(<TerminalControlBar client={{ get: get as never }} terminalId="old" ownerSessionId="chat" />)
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  rerender(<TerminalControlBar client={{ get: get as never }} terminalId="new" ownerSessionId="next" />)
  await waitFor(() => expect((screen.getByRole('button', { name: '交给当前对话' }) as HTMLButtonElement).disabled).toBe(false))
  finish({ ...initial, id: 'old', controlled: true, ownerSessionId: 'chat' })
  await waitFor(() => expect(screen.queryByText('AI 协助中')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: '交给当前对话' }))
  await waitFor(() => expect(get).toHaveBeenCalledWith('setTerminalControl', { terminalId: 'new', ownerSessionId: 'next', enabled: true, mode: 'shell' }))
})
