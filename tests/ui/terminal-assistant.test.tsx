import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TerminalAssistant } from '../../src/ui/terminal-assistant.js'
import { $lang } from '../../src/ui/i18n/index.js'
$lang.set('zh')

it('sends natural language to the model operation, never as raw terminal bytes', async () => {
  const get = vi.fn(async () => ({}))
  render(<TerminalAssistant client={{ get: get as never }} terminalId="term" ownerSessionId="chat" items={[]} busy={false} onAbort={vi.fn()} />)
  const input = screen.getByRole('textbox', { name: '终端 AI 输入' })
  fireEvent.change(input, { target: { value: '看看当前目录有哪些数据' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(get).toHaveBeenCalledWith('sendTerminalPrompt', { terminalId: 'term', ownerSessionId: 'chat', text: '看看当前目录有哪些数据' }))
  expect(get).not.toHaveBeenCalledWith('writeToSession', expect.anything())
})

it('keeps the draft on failure and ignores IME Enter', async () => {
  const get = vi.fn(async () => { throw new Error('当前对话不可用') })
  render(<TerminalAssistant client={{ get: get as never }} terminalId="term" ownerSessionId="chat" items={[]} busy={false} onAbort={vi.fn()} />)
  const input = screen.getByRole('textbox', { name: '终端 AI 输入' }) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: '分析数据' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '提交给 AI' }))
  await screen.findByText('当前对话不可用')
  expect(input.value).toBe('分析数据')
})

it('uses the existing permission card and does not submit around it', () => {
  const answer = vi.fn(), get = vi.fn()
  render(<TerminalAssistant client={{ get: get as never }} terminalId="term" ownerSessionId="chat" items={[]} busy={true} onAbort={vi.fn()}
    permission={{ requestId: 'permission', title: '这次要执行代码', options: [{ optionId: 'yes', kind: 'allow_once', name: '允许这一次' }] }} onAnswerPermission={answer} />)
  expect(screen.queryByRole('textbox', { name: '终端 AI 输入' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^允许这一次$/ }))
  expect(answer).toHaveBeenCalledWith('permission', 'yes')
  expect(get).not.toHaveBeenCalled()
})
