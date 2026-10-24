import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'
import { readFileSync } from 'node:fs'

test.use({ dawnOptions: { reply: Array.from({ length: 28 }, (_, i) => `历史正文 SEARCH_BODY_${i}。`).join('\n\n') } })
async function open(page: Page, agent = false) {
  await 在项目里开会话(page); await 等进了对话(page)
  await page.locator('.composer-card .attach-trigger').click(); await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
  if (agent) { await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click(); await expect(page.locator('.dock .xterm-screen')).toContainText('> DAWN') }
}
async function input(page: Page, text: string, send = false) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(text)
  if (send) await page.keyboard.press('Enter')
}

test('DAWN searches offscreen history and finds prior input without submitting or losing drafts', async ({ dawn }) => {
  const { page } = dawn; await open(page, true)
  await expect(page.getByRole('button', { name: '搜索历史', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出会话', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '找回输入', exact: true })).toHaveCount(0)
  await input(page, 'DAWN_SEARCH_OLD 中文历史', true)
  const screen = page.locator('.dock .xterm-screen')
  await expect(screen).toContainText('1 轮'); await expect(screen).not.toContainText('生成中')
  const terminalId = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}'))[0]!)
  const sessionId = await page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data.sessionId, terminalId)
  const turns = () => page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items.filter((x: any) => x.type === 'turn' && x.who === 'user').length, sessionId)
  await expect(screen).not.toContainText('❯ DAWN_SEARCH_OLD 中文历史')
  await input(page, 'KEEP_SEARCH_DRAFT')
  await page.getByRole('button', { name: '搜索历史', exact: true }).click(); await page.keyboard.type('DAWN_SEARCH_OLD')
  await expect(screen).toContainText('1/1'); await page.keyboard.press('Enter'); expect(await turns()).toBe(1)
  await page.keyboard.press('Escape'); await expect(screen).not.toContainText('↑ Shift+Enter'); await expect(screen).toContainText('> DAWN KEEP_SEARCH_DRAFT')
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.press('Control+r'); await expect(screen).toContainText('搜索输入历史')
  await page.keyboard.type('中文历史'); await expect(screen).toContainText('1/1'); await page.keyboard.press('Enter')
  await expect(screen).toContainText('> DAWN DAWN_SEARCH_OLD 中文历史'); expect(await turns()).toBe(1)
  await page.keyboard.press('Control+c'); await page.keyboard.press('Meta+f'); await page.keyboard.type('NO_SUCH_CONTENT')
  await expect(screen).toContainText('No matches'); await page.keyboard.press('Escape'); await expect(screen).not.toContainText('No matches')
  await expect(screen).toContainText('> DAWN'); expect(await turns()).toBe(1)
  await page.getByRole('button', { name: '导出会话', exact: true }).click()
  const toast = page.locator('.terminal-conversation-actions [role="status"]')
  await expect(toast).toContainText('已导出 1 轮到 ')
  const path = (await toast.innerText()).replace(/^已导出 1 轮到 /, '')
  const exported = readFileSync(path, 'utf8')
  expect(exported).toContain('DAWN_SEARCH_OLD 中文历史'); expect(exported).toContain('SEARCH_BODY_27')
  expect(exported).not.toContain('KEEP_SEARCH_DRAFT'); expect(await turns()).toBe(1)
})

test('Normal searches retained output with matches and no-results while preserving the Shell draft', async ({ dawn }) => {
  const { page } = dawn; await open(page)
  await expect(page.getByRole('button', { name: '导出会话', exact: true })).toBeDisabled()
  await input(page, "printf 'NORMAL_SEARCH_ROW_A\\nNORMAL_SEARCH_ROW_B\\n'", true)
  const screen = page.locator('.dock .xterm-screen')
  await expect(screen).toContainText('NORMAL_SEARCH_ROW_B')
  await input(page, 'printf UNSENT_SHELL_DRAFT')
  await page.getByRole('button', { name: '搜索历史', exact: true }).click()
  const query = page.getByRole('textbox', { name: '搜索终端历史内容', exact: true })
  await query.fill('NORMAL_SEARCH_ROW_A'); await expect(page.locator('.terminal-find [role="status"]')).toContainText(/\d+\/\d+/)
  await query.press('Enter'); await query.press('Shift+Enter')
  await query.fill('不存在的内容'); await expect(page.locator('.terminal-find [role="status"]')).toContainText('没有匹配结果')
  await query.press('Escape'); await expect(query).toBeHidden(); await expect(screen).toContainText('printf UNSENT_SHELL_DRAFT')
  await page.keyboard.press('Control+u'); await page.keyboard.press('Meta+f'); await expect(query).toBeVisible()
  await query.fill('NORMAL_SEARCH_ROW_B'); await expect(page.locator('.terminal-find [role="status"]')).toContainText(/\d+\/\d+/)
  await page.getByRole('button', { name: '关闭终端搜索', exact: true }).click()
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.press('Control+r'); await page.keyboard.type('NORMAL_SEARCH_ROW_A')
  await expect(screen).toContainText(/(?:reverse|bck)-i-search/); await page.keyboard.press('Escape'); await page.keyboard.press('Control+u')
})

test('search state stays local when switching modes and closing the last terminal', async ({ dawn }) => {
  const { page } = dawn; await open(page)
  await page.getByRole('button', { name: '搜索历史', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索终端历史内容', exact: true }).fill('OLD_SEARCH')
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock .xterm-screen')).toContainText('> DAWN'); await expect(page.locator('.terminal-find')).toHaveCount(0)
  await page.getByRole('button', { name: '搜索历史', exact: true }).click(); await page.keyboard.type('agent-search')
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click(); await expect(page.locator('.dock')).toContainText('还没有终端')
  await expect(page.getByRole('button', { name: '搜索历史', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '返回会话', exact: true }).click(); await expect(page.locator('.main .composer-card')).toBeVisible()
  await page.locator('.main .composer-card .attach-trigger').click(); await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .xterm-screen')).toBeVisible(); await expect(page.locator('.dock')).not.toContainText('OLD_SEARCH')
})
