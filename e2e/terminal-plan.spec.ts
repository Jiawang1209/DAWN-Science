import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
test.use({ dawnOptions: { gitInit: true } })

async function invoke(page: Page, operation: string, input: unknown): Promise<any> {
  return page.evaluate(async ({ operation, input }) => {
    const response = await window.dawn!.invoke(operation, input)
    if (!response.ok) throw Error(response.error?.message)
    return response.data
  }, { operation, input })
}
async function openTerminal(page: Page) {
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
}
async function start(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page); await openTerminal(page)
  await expect.poll(async () => /[$#%](?:\s+main)?$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const terminalId = Object.keys(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))[0]!
  const state = await invoke(page, 'getTerminalAgentMode', { terminalId })
  await expect(page.locator('.dock .xterm-rows')).toContainText('> DAWN')
  return { terminalId, sessionId: state.sessionId as string }
}
async function submit(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(text); await page.keyboard.press('Enter')
}
async function ready(page: Page) {
  await expect(page.locator('.dock .xterm-rows')).not.toContainText('生成中 · Ctrl-C 停止')
}
async function proposal(page: Page, sessionId: string, version = 1) {
  await expect.poll(async () => (await invoke(page, 'getSessionPlan', { sessionId })).plan?.version).toBe(version)
  const state = await invoke(page, 'getSessionPlan', { sessionId })
  await expect(page.locator('.dock .xterm-rows')).toContainText('/plan approve ' + state.plan.planId)
  await ready(page)
  return state.plan
}

test('terminal /plan uses the GUI plan book, requires approval, archives and executes the shared instruction', async ({ dawn }) => {
  const { page, workspace, requests } = dawn, { sessionId } = await start(page)
  await submit(page, '/plan')
  await expect.poll(() => invoke(page, 'getSessionPlan', { sessionId })).toMatchObject({ planning: true })
  await expect(page.locator('.dock .xterm-rows')).toContainText('先出方案（只看不改）')
  await page.locator('.dock .term-host').evaluate(el => {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
    const transfer = new DataTransfer()
    transfer.items.add(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], 'plan-original.png', { type: 'image/png' }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(page.locator('.terminal-attachment')).toHaveCount(1)
  await submit(page, '/plan 终端方案验收：分析分组数据')
  const plan = await proposal(page, sessionId)
  await expect(page.locator('.dock .xterm-rows')).toContainText('问题与假设')
  expect(existsSync(join(workspace, 'analysis/plans'))).toBe(false)
  expect(existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(false)
  await submit(page, `/plan approve ${plan.planId}`)
  await expect.poll(() => existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(true)
  await expect.poll(async () => (await invoke(page, 'getSessionPlan', { sessionId })).plan.status).toBe('approved')
  expect(readdirSync(join(workspace, 'analysis/plans'))).toHaveLength(1)
  const approved = await invoke(page, 'getSessionPlan', { sessionId })
  expect(readFileSync(join(workspace, approved.plan.savedPath), 'utf8')).toContain('status: approved')
  expect(approved.planning).toBe(false)
  const executionRequest = requests.findLast((r: any) => JSON.stringify(r.body).includes('照批准的方案做')) as { body: unknown } | undefined
  expect(JSON.stringify(executionRequest?.body)).toContain('image_url')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.plan-card')).toHaveAttribute('data-status', 'approved')
  await expect(page.locator('.turn.user').last()).toContainText('照批准的方案做')
  expect(requests.some((r: any) => JSON.stringify(r.body).includes('/plan approve'))).toBe(false)
})

test('GUI toggle syncs to the same terminal; revised plans reject old IDs, discard and history preserve status', async ({ dawn }) => {
  const { page, workspace } = dawn, { sessionId } = await start(page)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitemcheckbox', { name: '先出方案', exact: true }).click()
  await openTerminal(page)
  await expect(page.locator('.dock .xterm-rows')).toContainText('先出方案（只看不改）')
  await submit(page, '终端方案验收：版本一')
  const first = await proposal(page, sessionId)
  await submit(page, '终端方案验收：修改为版本二')
  const second = await proposal(page, sessionId, 2)
  await submit(page, `/plan approve ${first.planId}`)
  await expect(page.locator('.dock .xterm-rows')).toContainText('不是当前待审方案')
  expect(existsSync(join(workspace, 'analysis/plans'))).toBe(false)
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.press('Control+c')
  await submit(page, `/plan discard ${second.planId}`)
  await expect.poll(async () => (await invoke(page, 'getSessionPlan', { sessionId })).plan.status).toBe('discarded')
  expect(existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(false)
  await invoke(page, 'renameSession', { sessionId, title: 'TERMINAL_PLAN_HISTORY' })
  await page.locator('.dock').getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
  await expect.poll(async () => /[$#%](?:\s+main)?$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await page.locator('.dock').getByRole('button', { name: '接续旧对话', exact: true }).click()
  await page.getByRole('dialog', { name: '选择历史会话' }).getByRole('button', { name: 'TERMINAL_PLAN_HISTORY', exact: true }).click()
  await expect(page.locator('.dock .xterm-rows')).toContainText('没采用')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.plan-card[data-status="discarded"]')).toHaveCount(1)
  await expect(page.locator('.plan-card[data-status="superseded"]')).toHaveCount(1)
})

test('fully accessible terminal stays read-only during planning; GUI edited approval updates the terminal', async ({ dawn }) => {
  const { page, workspace } = dawn, { sessionId } = await start(page)
  await submit(page, '/permissions allow-all')
  await submit(page, '/plan 终端方案验收偷跑')
  await expect(page.locator('.dock .xterm-rows')).toContainText('方案期')
  await ready(page)
  expect(existsSync(join(workspace, 'results/tables/偷跑.csv'))).toBe(false)
  await submit(page, '/plan 终端方案验收：正式方案')
  await proposal(page, sessionId)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  const card = page.locator('.plan-card')
  await card.getByRole('button', { name: '改一改', exact: true }).click()
  const editor = card.getByRole('textbox')
  await editor.fill((await editor.inputValue()) + '\n\n补充：核对样本量。')
  await card.getByRole('button', { name: '照改过的做', exact: true }).click()
  await expect(card).toHaveAttribute('data-status', 'approved')
  await expect.poll(() => existsSync(join(workspace, 'results/tables/mock_summary.csv'))).toBe(true)
  await openTerminal(page)
  await expect(page.locator('.dock .xterm-rows')).toContainText('批的是改过的方案')
  await expect(page.locator('.dock .xterm-rows')).not.toContainText('先出方案（只看不改）')
})
