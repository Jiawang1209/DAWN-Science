import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

async function open(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page)
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  return terminals(page)
}
async function terminals(page: Page) {
  return page.evaluate(async () => {
    const p = await window.dawn!.invoke('listProjects', {}) as any
    const s = await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any
    return s.data.filter((x: any) => x.kind === 'pty') as { sessionId: string }[]
  })
}
async function type(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type(text); await page.keyboard.press('Enter')
}
async function mode(page: Page, terminalId: string) {
  return page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, terminalId)
}
async function snapshot(page: Page, sessionId: string) {
  return page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, sessionId)
}
async function enter(page: Page, terminalId: string) {
  // Rendering xterm is earlier than the login Shell becoming ready under CPU load.
  await expect.poll(async () => stripVTControlCharacters((await snapshot(page, terminalId)).terminal).trimEnd().endsWith('$')).toBe(true)
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
}

test('the selected terminal returns to its own Agent rather than another live terminal', async ({ dawn }) => {
  const { page } = dawn
  const [first] = await open(page)
  await enter(page, first!.sessionId)
  const a = await mode(page, first!.sessionId)
  await type(page, 'FIRST_TERMINAL_CONTEXT_A')
  await expect.poll(async () => (await snapshot(page, a.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  await expect(page.locator('.dock .dock-tab')).toHaveCount(2)
  const second = (await terminals(page)).find(t => t.sessionId !== first!.sessionId)!
  await enter(page, second.sessionId)
  const b = await mode(page, second.sessionId)
  expect(b.sessionId).not.toBe(a.sessionId)
  await type(page, 'SECOND_TERMINAL_CONTEXT_B')
  await expect.poll(async () => (await snapshot(page, b.sessionId)).items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)).toBe(true)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main')).toContainText('SECOND_TERMINAL_CONTEXT_B')
  await expect(page.locator('.main')).not.toContainText('FIRST_TERMINAL_CONTEXT_A')
  expect((await mode(page, first!.sessionId)).sessionId).toBe(a.sessionId)
})

test('a removed Agent target leaves the terminal open and reports the missing conversation', async ({ dawn }) => {
  const { page } = dawn, [terminal] = await open(page)
  await enter(page, terminal!.sessionId)
  const target = await mode(page, terminal!.sessionId)
  await page.evaluate(async id => {
    const t = await window.dawn!.invoke('listTasks', {}) as any
    const task = t.data.find((x: any) => x.sessionId === id)
    const result = await window.dawn!.invoke('deleteTask', { taskId: task.taskId })
    if (!result.ok) throw new Error('Fixture could not remove the target')
  }, target.sessionId)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.getByText('那段对话已经不在了（可能已归档或删除）', { exact: true })).toBeVisible()
  await expect(page.locator('.dock .term-host')).toBeVisible()
})

test.describe('running task across directories', () => {
  test.use({ dawnOptions: { toolCall: { when: 'CONTINUITY_RUNNING', toolName: 'bash', args: { command: 'sleep 3; printf CONTINUITY_DONE > continuation-long.txt' }, perTurn: true } } })
  test('return follows the CLI workspace and lets the current tool finish', async ({ dawn }) => {
    const { page, workspace } = dawn, [terminal] = await open(page)
    await type(page, 'mkdir -p nested; cd nested; dawn')
    await expect.poll(async () => (await mode(page, terminal!.sessionId)).mode).toBe('dawn')
    const target = await mode(page, terminal!.sessionId)
    await type(page, 'CONTINUITY_RUNNING')
    await expect.poll(async () => stripVTControlCharacters((await snapshot(page, terminal!.sessionId)).terminal)).toContain('sleep 3')
    await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
    await expect(page.locator('.main .composer-card')).toBeVisible()
    await expect(page.locator('.main')).toContainText('CONTINUITY_RUNNING')
    await expect.poll(() => existsSync(join(workspace, 'nested', 'continuation-long.txt'))).toBe(true)
    expect(readFileSync(join(workspace, 'nested', 'continuation-long.txt'), 'utf8')).toBe('CONTINUITY_DONE')
    const p = await page.evaluate(async id => {
      const projects = await window.dawn!.invoke('listProjects', {}) as any
      return projects.data.find((x: any) => x.projectId === id)
    }, target.projectId)
    expect(realpathSync(p.workspace)).toBe(realpathSync(join(workspace, 'nested')))
  })
})
