import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

async function invoke(page: Page, operation: string, input: unknown): Promise<any> {
  return page.evaluate(async ({ operation, input }) => {
    const r = await window.dawn!.invoke(operation, input)
    if (!r.ok) throw Error(r.error?.message)
    return r.data
  }, { operation, input })
}
async function openTerminal(page: Page) {
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
}
async function submit(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type(text); await page.keyboard.press('Enter')
}

test('a pending plan survives closing the last terminal and history resume, then approves the same version once', async ({ dawn }) => {
  const { page, workspace, requests } = dawn
  await 在项目里开会话(page); await 等进了对话(page); await openTerminal(page)
  await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock .xterm-rows')).toContainText('> DAWN')
  const originalTerminal = Object.keys(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))[0]!
  const originalMode = await invoke(page, 'getTerminalAgentMode', { terminalId: originalTerminal })
  const sessionId = originalMode.sessionId
  await submit(page, '/plan 终端方案验收：待审恢复')
  await expect.poll(async () => (await invoke(page, 'getSessionPlan', { sessionId })).plan?.status).toBe('proposed')
  const before = await invoke(page, 'getSessionPlan', { sessionId })
  await expect(page.locator('.dock .xterm-rows')).toContainText('/plan approve ' + before.plan.planId)
  await expect(page.locator('.dock .xterm-rows')).not.toContainText('生成中 · Ctrl-C 停止')
  await invoke(page, 'renameSession', { sessionId, title: 'PLAN_PENDING_RECOVERY' })
  await page.locator('.dock').getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: '接续旧对话', exact: true }).click()
  await page.getByRole('dialog', { name: '选择历史会话' }).getByRole('button', { name: 'PLAN_PENDING_RECOVERY', exact: true }).click()
  await expect(page.locator('.dock .xterm-rows')).toContainText('/plan approve ' + before.plan.planId)
  await expect(page.locator('.dock .xterm-rows')).toContainText('先出方案（只看不改）')
  const resumed = await invoke(page, 'getSessionPlan', { sessionId })
  expect(resumed).toMatchObject({ planning: true, plan: { planId: before.plan.planId, version: before.plan.version, status: 'proposed' } })
  expect(existsSync(join(workspace, 'analysis/plans'))).toBe(false)
  expect(existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(false)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', sessionId)
  await expect(page.locator('.plan-card')).toHaveAttribute('data-status', 'proposed')
  await openTerminal(page)
  await submit(page, '/plan approve ' + before.plan.planId)
  await expect.poll(() => existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(true)
  expect(readdirSync(join(workspace, 'analysis/plans'))).toHaveLength(1)
  expect(await invoke(page, 'getSessionPlan', { sessionId })).toMatchObject({ planning: false, plan: { planId: before.plan.planId, status: 'approved' } })
  expect(requests.some((r: any) => JSON.stringify(r.body).includes('/plan approve'))).toBe(false)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.plan-card')).toHaveAttribute('data-status', 'approved')
})
