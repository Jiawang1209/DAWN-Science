import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'

async function setup(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page)
  const owner = await page.locator('.session-tab[aria-selected="true"]').getAttribute('data-session')
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
  const terminalId = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}'))[0]!)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  return { owner: owner!, terminalId }
}
async function legacy(page: Page, options: { agent?: boolean; ownerArchived?: boolean; exited?: boolean } = {}) {
  const target = await setup(page)
  if (options.agent || options.exited) {
    await page.getByRole('button', { name: '终端面板', exact: true }).click()
    if (options.agent) {
      await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
      await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
    } else {
      await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type('exit'); await page.keyboard.press('Enter')
      await expect(page.locator('.dock')).toContainText('已结束')
    }
    await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  }
  const mode = await page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, target.terminalId)
  await page.evaluate(async ({ terminalId, owner }) => {
    await window.dawn!.invoke('renameSession', { sessionId: owner, title: 'OWNER_NAV_RECOVERY' })
    await window.dawn!.invoke('renameSession', { sessionId: terminalId, title: 'LEGACY_PTY_RECOVERY' })
    await window.dawn!.invoke('setSessionArchived', { sessionId: terminalId, archived: true })
  }, target)
  if (options.ownerArchived) await page.evaluate(async id => { await window.dawn!.invoke('setSessionArchived', { sessionId: id, archived: true }) }, target.owner)
  await page.reload()
  await page.getByRole('button', { name: /^已归档/ }).click()
  await page.locator('.archived-row-main').filter({ hasText: 'LEGACY_PTY_RECOVERY' }).click()
  await expect(page.locator('.main')).toContainText('终端会话')
  return { ...target, agentSession: mode.sessionId as string | undefined }
}

test('PTYs never appear in conversation tabs, including after returning from DAWN', async ({ dawn }) => {
  const { page } = dawn, target = await setup(page)
  await expect(page.locator(`.session-tab[data-session="${target.terminalId}"]`)).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: '同一处的会话' }).getByRole('tab')).toHaveCount(1)
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator(`.session-tab[data-session="${target.terminalId}"]`)).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: '同一处的会话' }).getByRole('tab')).toHaveCount(2)
})

test('closing the final conversation with a live PTY returns to a usable welcome page', async ({ dawn }) => {
  const { page } = dawn; await setup(page)
  await page.locator('.session-tab-wrap.current .session-tab-close').click()
  await expect(page.locator('.welcome')).toBeVisible({ timeout: 4000 })
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.welcome')).toBeVisible()
})

test('closing a conversation picks a real sibling and preserves its draft, never a PTY', async ({ dawn }) => {
  const { page } = dawn, original = await setup(page)
  await page.locator('.composer-card textarea.composer-field').fill('SIBLING_DRAFT_KEEP')
  await page.getByRole('button', { name: '在这里再开一段', exact: true }).click()
  await expect(page.locator('.composer-card textarea.composer-field')).toHaveValue('')
  await page.locator('.session-tab-wrap.current .session-tab-close').click()
  await expect(page.locator('.composer-card textarea.composer-field')).toHaveValue('SIBLING_DRAFT_KEEP', { timeout: 4000 })
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', original.owner)
})

test('an already selected legacy PTY reopens the same terminal and returns to its Normal owner', async ({ dawn }) => {
  const { page } = dawn, target = await legacy(page)
  await expect(page.locator('.main').getByRole('button', { name: '打开终端', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '打开终端', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  const selected = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('dawn.window.terminal-owner') || '{}')))
  expect(selected).toEqual([target.terminalId])
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.owner)
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type("printf 'LIVE_RECOVERY_'; printf 'OUTPUT_OK\\n'"); await page.keyboard.press('Enter')
  await expect(page.locator('.dock .xterm-screen')).toContainText('LIVE_RECOVERY_OUTPUT_OK')
})

test('the legacy page can return directly to its conversation without opening a terminal', async ({ dawn }) => {
  const { page } = dawn, target = await legacy(page)
  await expect(page.locator('.main').getByRole('button', { name: '返回会话', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.owner)
})

test('closing the selected legacy terminal leaves a real page instead of a deleted-session loader', async ({ dawn }) => {
  const { page } = dawn, target = await legacy(page)
  await expect(page.locator('.main').getByRole('button', { name: '打开终端', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '打开终端', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.owner)
})

test('the legacy DAWN page returns directly to its own Agent conversation', async ({ dawn }) => {
  const { page } = dawn, target = await legacy(page, { agent: true })
  await expect(page.locator('.main').getByRole('button', { name: '返回会话', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.agentSession!)
  await expect(page.locator('.composer-card')).toBeVisible()
})

test('a legacy PTY whose original conversation was archived can still return to the welcome page', async ({ dawn }) => {
  const { page } = dawn; await legacy(page, { ownerArchived: true })
  await expect(page.locator('.main').getByRole('button', { name: '返回会话', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.welcome')).toBeVisible()
})

test('reopening an exited legacy PTY shows that same ended record without creating a replacement', async ({ dawn }) => {
  const { page } = dawn, target = await legacy(page, { exited: true })
  await expect(page.locator('.main').getByRole('button', { name: '打开终端', exact: true })).toHaveCount(1)
  await page.locator('.main').getByRole('button', { name: '打开终端', exact: true }).click()
  await expect(page.locator('.dock')).toContainText('已结束')
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toBeDisabled()
  const ptys = await page.evaluate(async () => {
    const projects = (await window.dawn!.invoke('listProjects', {}) as any).data
    const all = (await Promise.all(projects.map(async (p: any) => (await window.dawn!.invoke('listSessions', { projectId: p.projectId }) as any).data))).flat()
    return all.filter((s: any) => s.kind === 'pty').map((s: any) => s.sessionId)
  })
  expect(ptys).toEqual([target.terminalId])
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.composer-card')).toBeVisible()
})
