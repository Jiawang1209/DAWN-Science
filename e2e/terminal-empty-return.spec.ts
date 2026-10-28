import { test, expect } from './fixtures.js'
import type { Page } from '@playwright/test'

async function openTerminal(page: Page) {
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock')).toBeVisible()
}

test('closing the last terminal still allows returning to the original page and draft', async ({ dawn }) => {
  const { page } = dawn
  const composer = page.locator('.composer-card textarea.composer-field')
  await composer.fill('EMPTY_TERMINAL_RETURN_DRAFT')
  await openTerminal(page)
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  const back = page.getByRole('button', { name: '返回会话', exact: true })
  await expect(back).toBeEnabled({ timeout: 1500 })
  await expect(back).toHaveAttribute('aria-busy', 'false')
  await back.click()
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(composer).toBeVisible()
  await expect(composer).toHaveValue('EMPTY_TERMINAL_RETURN_DRAFT')
})

test.describe('without a configured terminal', () => {
  test.use({ dawnOptions: { providersYaml: `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
` } })
  test('returns to the page even when no terminal has ever been created', async ({ dawn }) => {
    const { page } = dawn
    await openTerminal(page)
    await expect(page.locator('.dock .dock-tab')).toHaveCount(0)
    await expect(page.locator('.dock .empty')).toContainText('开不了终端')
    await expect(page.getByRole('button', { name: '＋ 新开一个', exact: true })).toBeDisabled()
    const back = page.getByRole('button', { name: '返回会话', exact: true })
    await expect(back).toBeEnabled({ timeout: 1500 })
    await back.click()
    await expect(page.locator('.dock')).toHaveCount(0)
    await expect(page.locator('.welcome')).toBeVisible()
  })
})
