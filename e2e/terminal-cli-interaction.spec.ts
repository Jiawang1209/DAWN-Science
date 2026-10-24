import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'

async function open(page: Page, enterAgent = true) {
  await 在项目里开会话(page); await 等进了对话(page)
  await page.locator('.composer-card .attach-trigger').click(); await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await expect.poll(async () => stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd().endsWith('$')).toBe(true)
  if (enterAgent) {
    await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
    await expect(page.locator('.dock .xterm-screen')).toContainText('> DAWN')
  }
  return page.evaluate(async () => {
    const entries = Object.keys(JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}'))
    const r = await window.dawn!.invoke('getTerminalAgentMode', { terminalId: entries[0]! }) as any
    return { terminalId: entries[0]!, sessionId: r.data.sessionId as string }
  })
}
async function submit(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(text); await page.keyboard.press('Enter')
}
async function final(page: Page, sessionId: string) {
  await expect.poll(async () => {
    const r = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId }) as any).data, sessionId)
    return r.items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)
  }).toBe(true)
}

test('keeps shortcuts above the editor and cumulative statistics centered at the bottom', async ({ dawn }) => {
  const { page } = dawn, target = await open(page)
  await submit(page, 'FOOTER_LAYOUT'); await final(page, target.sessionId)
  const screen = page.locator('.dock .xterm-screen')
  await expect(screen).toContainText('1 轮')
  const contextButton = page.locator('.dock .terminal-context-anchor').getByRole('button', { name: /上下文/ })
  await expect(contextButton).toBeVisible()
  await expect(contextButton.locator('svg')).toHaveCount(1)
  const reading = await page.evaluate(async sessionId => (await window.dawn!.invoke('getContextUsage', { sessionId }) as any).data, target.sessionId)
  expect(reading.usedTokens).toBeGreaterThan(0)
  await expect(screen).toContainText(reading.model)
  const rows = await screen.locator('.xterm-rows > div').allTextContents()
  const prompt = rows.findIndex(row => row.includes('> DAWN')), hint = rows.findIndex(row => row.includes('Enter 发送'))
  const stats = rows.findLastIndex(row => row.includes('命中'))
  const model = rows.findLastIndex(row => row.includes(reading.model))
  expect(hint).toBeGreaterThanOrEqual(0); expect(hint).toBeLessThan(prompt); expect(stats).toBeGreaterThan(prompt)
  expect(model).toBeGreaterThan(prompt)
  expect(rows.slice(stats + 1).every(row => !row.trim())).toBe(true)
  expect(rows.slice(model, stats + 1).join('')).toMatch(/deepseek-flash.*输入.*命中/)
  await expect(screen).not.toContainText('上下文 ')
  await contextButton.click()
  const details = page.locator('.dock').getByRole('dialog', { name: '上下文', exact: true })
  await expect(details).toBeVisible(); await expect(details).toContainText('tokens')
  await contextButton.press('Escape'); await page.locator('.dock .xterm-helper-textarea').focus()
  await expect(details).toBeHidden()
  const turns = await page.evaluate(async sessionId => (await window.dawn!.invoke('subscribeSession', { sessionId }) as any).data.items.filter((x: any) => x.type === 'turn' && x.who === 'user').length, target.sessionId)
  expect(turns).toBe(1)
  await expect(screen).not.toContainText('就绪 · Enter')
  await expect(page.locator('.dock .xterm-helper-textarea')).toHaveCount(1)
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(contextButton).toHaveCount(0)
})

test('Shift-Enter edits multiple lines in one terminal input and sends one native user turn', async ({ dawn }) => {
  const { page } = dawn, target = await open(page)
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type('第一行 MULTILINE_A'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('第二行 MULTILINE_B')
  await expect(page.locator('.dock .xterm-screen')).toContainText('MULTILINE_B')
  const before = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items, target.sessionId)
  expect(before.filter((x: any) => x.type === 'turn' && x.who === 'user')).toHaveLength(0)
  await page.keyboard.press('Enter'); await final(page, target.sessionId)
  const turns = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items, target.sessionId)
  const user = turns.filter((x: any) => x.type === 'turn' && x.who === 'user')
  expect(user).toHaveLength(1); expect(JSON.stringify(user)).toContain('MULTILINE_A\\n第二行 MULTILINE_B')
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(page.locator('.dock .xterm-screen')).not.toContainText('> DAWN')
})

test.describe('formatted transcript', () => {
  test.use({ dawnOptions: { reply: '## 结果 FORMAT_HEADING\n\n读取 **1200 行**，使用 `count()` 检查。\n\n```python\nprint("FORMAT_CODE")\n```\n\n| 字段 | 数量 |\n| --- | --- |\n| 温度 | 12 |' } })
  test('renders Markdown code and tables in a narrow window while keeping one editor', async ({ dawn }) => {
    const { page } = dawn, target = await open(page)
    await dawn.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 700))
    await submit(page, '请格式化回复'); await final(page, target.sessionId)
    const screen = page.locator('.dock .xterm-screen')
    await expect(screen).toContainText('FORMAT_CODE'); await expect(screen).toContainText('温度')
    await expect(screen).toContainText('❯ 请格式化回复')
    await expect(screen).not.toContainText('› 你')
    await expect(screen).not.toContainText('● DAWN')
    await expect(screen).not.toContainText('**1200 行**'); await expect(screen).not.toContainText('```python')
    await expect(page.locator('.dock .xterm-helper-textarea')).toHaveCount(1)
    await expect(page.locator('.main .composer-card')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
})

const longReply = Array.from({ length: 70 }, (_, i) => `步骤 ${i + 1}：这是逐步生成的中文结果 STREAM_${i}。`).join('\n\n') + '\n\nFINAL_STREAM_MARKER'
test.describe('streamed scrolling', () => {
  test.use({ dawnOptions: { reply: longReply } })
  test('shows a partial answer before completion and does not steal scrolling until returning to the end', async ({ dawn }) => {
    const { page } = dawn, target = await open(page)
    await submit(page, '慢慢说，验证流式滚动')
    const screen = page.locator('.dock .xterm-screen')
    await expect(screen).toContainText('STREAM_0'); await expect(screen).toContainText('生成中')
    await expect(screen).toContainText('STREAM_22')
    await page.keyboard.press('PageUp'); await expect(screen).toContainText('回到底部'); await final(page, target.sessionId)
    await expect(screen).not.toContainText('FINAL_STREAM_MARKER')
    await page.keyboard.press('Control+End'); await expect(screen).toContainText('FINAL_STREAM_MARKER')
    await expect(screen).toContainText('> DAWN')
  })
})

test.describe('tool details', () => {
  test.use({ dawnOptions: { reply: '工具执行结束。', toolCall: { when: 'DETAIL_CHECK', toolName: 'bash', args: { command: "printf 'TOOL_HEAD\\nROW_1\\nROW_2\\nROW_3\\nROW_4\\nTOOL_TAIL\\n'" }, perTurn: true } } })
  test('Tab reveals tool output details without introducing a second input', async ({ dawn }) => {
    const { page } = dawn, target = await open(page)
    await submit(page, 'DETAIL_CHECK'); await final(page, target.sessionId)
    const screen = page.locator('.dock .xterm-screen')
    await expect(screen).toContainText('工具 1 次')
    await expect(screen).toContainText('运行命令')
    const hasOutputRow = async () => (await screen.locator('.xterm-rows > div').allTextContents()).some(row => row.trim() === 'ROW_4')
    await expect.poll(hasOutputRow).toBe(false)
    await page.keyboard.press('Tab'); await expect(screen).toContainText('ROW_4')
    await expect.poll(hasOutputRow).toBe(true)
    await page.keyboard.press('Tab')
    await expect.poll(hasOutputRow).toBe(false)
    await expect(page.locator('.dock .xterm-helper-textarea')).toHaveCount(1)
  })
})


test('reopening a trimmed PTY snapshot restores the editor and bracketed multiline paste', async ({ dawn }) => {
  const { page, app } = dawn, first = await open(page, false)
  await submit(page, "(sleep 2; printf '%0240000d' 0) & dawn")
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, first.terminalId)).terminalTrimmed).toBe(true)
  const target = await page.evaluate(async terminalId => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId }) as any).data, first.terminalId)
  await page.getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .composer-card')).toBeVisible()
  await page.locator('.composer-card .attach-trigger').click(); await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .xterm-screen')).toContainText('> DAWN')
  await app.evaluate(({ clipboard }) => clipboard.writeText('RECOVERY_A\nRECOVERY_B'))
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
  await expect(page.locator('.dock .xterm-screen')).toContainText('RECOVERY_B')
  const before = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items, target.sessionId)
  expect(before.filter((x: any) => x.type === 'turn' && x.who === 'user')).toHaveLength(0)
  await page.keyboard.press('Enter'); await final(page, target.sessionId)
  const after = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items, target.sessionId)
  expect(JSON.stringify(after.filter((x: any) => x.type === 'turn' && x.who === 'user'))).toContain('RECOVERY_A\\nRECOVERY_B')
})
