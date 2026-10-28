import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'
import type { Page } from '@playwright/test'

const longName = 'custom-provider-with-a-deliberately-long-name-for-single-line-verification'
const fake = resolve(import.meta.dirname, '..', 'scripts', 'fake-acp-agent.mjs')
test.use({ dawnOptions: { providersYaml: `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  ${longName}:
    kind: acp
    command: node
    args: [${JSON.stringify(fake)}]
    capabilities: [chat, exec]
` } })

async function invoke(page: Page, op: string, input: unknown) {
  return page.evaluate(async ({ op, input }) => {
    const response = await window.dawn!.invoke(op, input)
    if (!response.ok) throw new Error(response.error?.message)
    return response.data
  }, { op, input })
}

test('LLM名称不换行，超长名称省略，菜单和类型标记保持紧凑', async ({ dawn }, info) => {
  const { page, mockUrl } = dawn
  await invoke(page, 'setProviderConnection', { providerId: 'moonshotai-cn', api: 'openai-completions', baseUrl: mockUrl, models: ['moonshot-layout-model'] })
  await invoke(page, 'setCredential', { providerId: 'moonshotai-cn', secret: 'local' })
  await page.reload()
  await page.locator('main.main .agent-pill > button').click()
  const menu = page.getByRole('menu', { name: '新建会话', exact: true })
  const moonshot = menu.locator('.name').filter({ hasText: /Moonshot.*CN/i })
  await expect(moonshot).toBeVisible()
  const long = menu.locator('.name').filter({ hasText: longName })
  await expect(long).toBeVisible()
  const dimensions = await menu.evaluate(e => {
    const rect = e.getBoundingClientRect()
    return { width: rect.width, fit: rect.left >= 0 && rect.right <= innerWidth }
  })
  expect(dimensions.width).toBeLessThanOrEqual(300)
  expect(dimensions.fit).toBe(true)
  for (const name of [moonshot, long]) {
    const metrics = await name.evaluate(e => {
      const range = document.createRange(); range.selectNodeContents(e)
      const lines = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)))
      return { lines: lines.size, ellipsis: getComputedStyle(e).textOverflow, clipped: e.scrollWidth > e.clientWidth }
    })
    expect(metrics.lines).toBe(1)
    expect(metrics.ellipsis).toBe('ellipsis')
    if (name === long) expect(metrics.clipped).toBe(true)
  }
  await expect(moonshot.locator('..').locator('.kind')).toHaveText('API')
  await page.screenshot({ path: info.outputPath('llm-menu-single-line.png') })
  await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
  await menu.screenshot({ path: info.outputPath('llm-menu-dark.png') })
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('快捷键速查为独立键帽、清晰分组，窄窗可滚动且焦点保留', async ({ dawn }, info) => {
  const { page, app } = dawn
  const trigger = page.getByRole('button', { name: '快捷键速查', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '快捷键速查', exact: true })
  const panel = dialog.locator('.shortcut-panel')
  await expect(panel).toBeVisible()
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(520)
  const command = dialog.getByRole('group', { name: /^(⌘|Ctrl) K$/ })
  await expect(command.locator('kbd')).toHaveCount(2)
  for (const cap of await command.locator('kbd').all()) expect((await cap.boundingBox())!.height).toBeLessThanOrEqual(24)
  await expect(dialog.getByText('仅在对话输入框中生效')).toBeVisible()
  await panel.screenshot({ path: info.outputPath('shortcuts-light.png') })
  await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
  await panel.screenshot({ path: info.outputPath('shortcuts-dark.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 560))
  const size = await panel.evaluate(e => { const r = e.getBoundingClientRect(); return { fit: r.top >= 0 && r.bottom <= innerHeight, scrolls: e.querySelector('.shortcut-panel-body')!.scrollHeight > e.querySelector('.shortcut-panel-body')!.clientHeight } })
  expect(size).toEqual({ fit: true, scrolls: true })
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '收起浮层', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
