import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'

async function openTerminal(page: Page) {
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
}
async function submit(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type(text); await page.keyboard.press('Enter')
}
async function invoke(page: Page, operation: string, input: unknown): Promise<any> {
  return page.evaluate(async ({ operation, input }) => {
    const r = await window.dawn!.invoke(operation, input)
    if (!r.ok) throw Error(r.error?.message)
    return r.data
  }, { operation, input })
}
async function start(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page); await openTerminal(page)
  await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock .xterm-rows')).toContainText('> DAWN')
  await submit(page, '请做结构化澄清')
  await expect(page.locator('.dock .xterm-rows')).toContainText('这次需要分析哪些样本？')
}

test('terminal questions separate choices, retain selected answers, return to the same GUI record and restore after closing', async ({ dawn }) => {
  const { page } = dawn
  await start(page)
  const terminal = page.locator('.dock .xterm-rows')
  // innerText collapses empty xterm rows; inspect the actual rendered row sequence.
  const text = await terminal.evaluate(el => Array.from(el.children).map(row => row.textContent).join('\n'))
  expect(text).toMatch(/保留所有符合条件的样本。\n {4}2\. 仅健康组/)
  await submit(page, '1')
  await expect(terminal).toContainText('需要输出哪些指标？')
  await expect(terminal).toContainText('✓ 已选：全部样本（推荐）')
  await expect(terminal).toContainText('1. 全部样本（推荐） · 保留所有符合条件的样本。')
  await expect(terminal).not.toContainText('需要你确认')
  const nextRows = await terminal.evaluate(el => Array.from(el.children).map(row => row.textContent).join('\n'))
  expect(nextRows).toMatch(/✓ 已选：全部样本（推荐）\n\n {2}需要输出哪些指标？/)
  await submit(page, '1,2')
  await expect(terminal).toContainText('还有需要遵守的要求吗？')
  await expect(terminal).toContainText('✓ 已选：多样性、丰度')
  await submit(page, 'NO_IDENTIFIERS')
  await expect(terminal).toContainText('已提交答案')
  await expect(terminal).toContainText('你的回答：NO_IDENTIFIERS')
  const ids = Object.keys(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))
  const mode = await invoke(page, 'getTerminalAgentMode', { terminalId: ids[0] })
  await invoke(page, 'renameSession', { sessionId: mode.sessionId, title: 'TERMINAL_CHOICES_HISTORY' })
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  const summary = page.locator('.question-summary')
  await expect(summary).toContainText('已回答')
  await summary.locator('summary').click()
  await expect(summary).toContainText('多样性 · 丰度')
  await expect(summary).toContainText('NO_IDENTIFIERS')
  await openTerminal(page)
  await page.locator('.dock').getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  await expect.poll(async () => /[$#%]$/.test((await terminal.innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: '接续旧对话', exact: true }).click()
  await page.getByRole('dialog', { name: '选择历史会话' }).getByRole('button', { name: 'TERMINAL_CHOICES_HISTORY', exact: true }).click()
  await expect(terminal).toContainText('已提交答案')
  await expect(terminal).toContainText('你的回答：NO_IDENTIFIERS')
})

test('a question cancelled in the conversation clears the terminal pending state without submitting a choice', async ({ dawn }) => {
  const { page } = dawn
  await start(page)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await page.locator('.question-card').getByRole('button', { name: '不再提问', exact: true }).click()
  await expect(page.locator('.question-summary')).toContainText('已取消提问')
  await openTerminal(page)
  await expect(page.locator('.dock .xterm-rows')).toContainText('已取消提问')
  await expect(page.locator('.dock .xterm-rows')).not.toContainText('已提交答案')
})
