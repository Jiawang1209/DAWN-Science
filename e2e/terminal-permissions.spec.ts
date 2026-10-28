import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
async function invoke(page: Page, operation: string, input: unknown) {
  return page.evaluate(async ({ operation, input }) => {
    const r = await window.dawn!.invoke(operation, input)
    if (!r.ok) throw Error(r.error?.message)
    return r.data as any
  }, { operation, input })
}
async function open(page: Page) {
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true })).toBeEnabled()
  if (await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).getAttribute('aria-pressed') !== 'true') {
    await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  }
}
async function submit(page: Page, value: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(value); await page.keyboard.press('Enter')
}
async function pick(page: Page, tier: string) {
  await page.locator('.dock .perm-pill-trigger').click()
  await page.locator('.dock').getByRole('menuitemradio', { name: new RegExp(tier) }).click()
}
test('permission switches share the same conversation and survive return, Normal, last close and history reopening', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page); await 等进了对话(page); await open(page)
  await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const terminalId = Object.keys(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))[0]!
  const { sessionId } = await invoke(page, 'getTerminalAgentMode', { terminalId })
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'allow-all')
  await pick(page, '请求批准')
  await expect.poll(() => invoke(page, 'getSessionPermission', { sessionId })).toEqual({ current: 'ask-risky', effective: 'ask-risky' })
  await expect(page.locator('.dock .xterm-rows')).toContainText('请求批准')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.composer-card .perm-pill-trigger')).toHaveAttribute('data-tier', 'ask-risky')
  await page.locator('.composer-card .perm-pill-trigger').click()
  await page.getByRole('menuitemradio', { name: /自动拦截/ }).click()
  await open(page)
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'deny-risky')
  await expect(page.locator('.dock .xterm-rows')).toContainText('自动拦截')
  await submit(page, '/permissions allow-all')
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'allow-all')
  await invoke(page, 'renameSession', { sessionId, title: 'PERMISSION_HISTORY' })
  await page.locator('.dock').getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveCount(0)
  await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await submit(page, `dawn --resume ${sessionId}`)
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'allow-all')
  expect((await invoke(page, 'getTerminalAgentMode', { terminalId })).sessionId).toBe(sessionId)
  await page.locator('.dock').getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveCount(0)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await open(page)
  await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
  await submit(page, `dawn --resume ${sessionId}`)
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'allow-all')
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', sessionId)
})

test('default changes follow inheritance, explicit tiers stay isolated, and native permission commands are not model turns', async ({ dawn }) => {
  const { page, requests } = dawn
  await 在项目里开会话(page); await 等进了对话(page); await open(page)
  await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const terminalId = Object.keys(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))[0]!
  const { sessionId } = await invoke(page, 'getTerminalAgentMode', { terminalId })
  await expect(page.locator('.dock .perm-pill-trigger')).toBeVisible()
  await invoke(page, 'setPermissionMode', { mode: 'ask-risky' })
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'ask-risky')
  await expect(page.locator('.dock .xterm-rows')).toContainText('请求批准（跟随默认）')
  await pick(page, '自动拦截')
  await invoke(page, 'setPermissionMode', { mode: 'allow-all' })
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'deny-risky')
  await submit(page, '/permissions inherit')
  await expect(page.locator('.dock .perm-pill-trigger')).toHaveAttribute('data-tier', 'allow-all')
  await page.locator('.dock .perm-pill-trigger').click()
  await page.locator('.dock').getByRole('checkbox').check()
  await page.locator('.dock').getByRole('menuitemradio', { name: /请求批准/ }).click()
  await expect.poll(() => invoke(page, 'getPermissionMode', {})).toEqual({ mode: 'ask-risky' })
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.composer-card .perm-pill-trigger')).toHaveAttribute('data-tier', 'ask-risky')
  const snapshot = await invoke(page, 'subscribeSession', { sessionId })
  expect(snapshot.items.filter((i: any) => i.type === 'turn' && i.who === 'user')).toHaveLength(0)
  expect(requests.filter((r: any) => JSON.stringify(r.body).includes('/permissions'))).toHaveLength(0)
})
