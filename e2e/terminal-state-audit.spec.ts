import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'

async function open(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page)
  await panel(page)
  return page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}'))[0]!)
}
async function panel(page: Page) {
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
}
async function type(page: Page, value: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(value); await page.keyboard.press('Enter')
}
async function ready(page: Page) {
  await expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
}
async function enter(page: Page) {
  await ready(page); await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
}
async function mode(page: Page, terminalId: string) {
  return page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, terminalId)
}

test('an Agent terminal can be collapsed from the schedule page without changing that page', async ({ dawn }) => {
  const { page } = dawn; await open(page); await enter(page)
  await page.getByRole('button', { name: '定时', exact: true }).click()
  await page.getByRole('button', { name: '收起面板', exact: true }).click()
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(page.locator('.main')).toContainText('定时')
})

test('returning across a changed CLI directory reopens the original PTY even after reloading the GUI', async ({ dawn }) => {
  const { page } = dawn, terminalId = await open(page)
  await ready(page); await type(page, 'mkdir -p nested; cd nested; dawn')
  await expect.poll(async () => (await mode(page, terminalId)).mode).toBe('dawn')
  const target = await mode(page, terminalId)
  await page.evaluate(async sessionId => {
    const r = await window.dawn!.invoke('renameSession', { sessionId, title: 'AUDIT_NESTED_AGENT' })
    if (!r.ok) throw Error('rename fixture failed')
  }, target.sessionId)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .composer-card')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'nested', exact: true }).click()
  await page.getByRole('button', { name: /^AUDIT_NESTED_AGENT/ }).click()
  await panel(page)
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const count = await page.evaluate(async () => {
    const projects = (await window.dawn!.invoke('listProjects', {}) as any).data
    const sessions = await Promise.all(projects.map(async (p: any) => (await window.dawn!.invoke('listSessions', { projectId: p.projectId }) as any).data))
    return sessions.flat().filter((x: any) => x.kind === 'pty').length
  })
  expect(count).toBe(1)
})

test('an exited terminal cannot restart Agent or accept input, and still returns to the conversation', async ({ dawn }) => {
  const { page } = dawn; await open(page); await ready(page); await type(page, 'exit')
  await expect(page.locator('.dock')).toContainText('已结束')
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toBeDisabled()
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .composer-card')).toBeVisible()
})

test('an archived Agent target reports its absence without navigating to a different conversation', async ({ dawn }) => {
  const { page } = dawn, terminalId = await open(page); await enter(page)
  const target = await mode(page, terminalId)
  await page.evaluate(async sessionId => {
    const r = await window.dawn!.invoke('setSessionArchived', { sessionId, archived: true })
    if (!r.ok) throw Error('archive fixture failed')
  }, target.sessionId)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.getByText('那段对话已经不在了（可能已归档或删除）', { exact: true })).toBeVisible()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await expect(page.locator('.dock').getByRole('button', { name: '返回会话', exact: true })).toBeEnabled()
})

test('closing another tab preserves the selected terminal, and closing the final tab leaves a usable return', async ({ dawn }) => {
  const { page } = dawn; await open(page)
  await page.getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  await expect(page.locator('.dock-tab')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock-tab')).toHaveCount(1)
  await expect(page.locator('.dock-tab.current')).toHaveCount(1)
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .composer-card')).toBeVisible()
})
