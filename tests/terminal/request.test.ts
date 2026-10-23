import { expect, it } from 'vitest'
import { terminalRequestMessage, terminalRequestTarget, displayTerminalRequest } from '../../src/terminal/request.js'
import { 指令文本 } from '../../src/policy/execution-boundary.js'
import { 消息转历史 } from '../../src/runtime/history.js'
it('scopes terminal targeting to the latest user request and preserves visible original text', () => {
  const input = terminalRequestMessage('读取数据\n继续分析', 'terminal-one')
  expect(terminalRequestTarget([{ role: 'user', content: input }])).toBe('terminal-one')
  expect(displayTerminalRequest(input)).toBe('读取数据\n继续分析')
  expect(指令文本(input)).toBe('读取数据\n继续分析')
  expect(消息转历史([{ role: 'user', content: input }])[0]).toMatchObject({ text: '读取数据\n继续分析' })
  expect(terminalRequestTarget([{ role: 'user', content: input }, { role: 'user', content: '现在只讨论' }])).toBeUndefined()
  expect(displayTerminalRequest('普通主对话')).toBe('普通主对话')
})
