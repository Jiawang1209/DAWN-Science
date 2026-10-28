import { test, expect, 开一段临时会话 } from './fixtures.js'
import type { Page } from '@playwright/test'

async function invoke(page: Page, op: string) {
  return page.evaluate(async op => {
    const response = await window.dawn!.invoke(op, {})
    if (!response.ok) throw new Error(response.error?.message)
    return response.data as any
  }, op)
}

test('底部数量来自实际名册，模型切换同步，详情及设置入口可达', async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900))
  await 开一段临时会话(page)
  const bar = page.getByRole('contentinfo', { name: '应用状态' })
  const [plugins, skills, mcp, agents] = await Promise.all(['listPlugins', 'listAgentSkills', 'listMcpServers', 'listSubagents'].map(op => invoke(page, op)))
  const expected = [
    `插件 ${plugins.plugins.filter((p: any) => p.on).length}`,
    `Skills ${skills.skills.filter((s: any) => s.invocation !== 'off').length}`,
    `MCP ${mcp.servers.filter((s: any) => !s.off).length}`,
    `子 Agent ${agents.agents.filter((a: any) => !a.disabled).length}`,
  ]
  for (const name of expected) await expect(bar.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(bar.getByRole('button', { name: '当前模型：deepseek-flash' })).toBeVisible()
  await page.locator('.composer .model-pill .model-trigger').click()
  await page.getByRole('menuitem', { name: /deepseek-v4-deep/ }).click()
  const model = bar.getByRole('button', { name: '当前模型：deepseek-v4-deep' })
  await expect(model).toBeVisible()
  await model.click()
  await expect(page.getByRole('dialog', { name: '当前模型' })).toContainText('deepseek-v4-deep')
  await page.keyboard.press('Escape')
  await expect(model).toBeFocused()
  await bar.getByRole('button', { name: /^Python：/ }).click()
  await expect(page.getByRole('dialog', { name: 'Python 解释器状态' })).toContainText('本机')
  await expect(page.getByRole('button', { name: '检测解释器', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('statusbar-environment.png') })
  await page.keyboard.press('Escape')
  for (const [name, heading] of [[expected[0]!, '插件'], [expected[1]!, 'Skills'], [expected[2]!, 'MCP 服务器'], [expected[3]!, '子 Agent']] as const) {
    await bar.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.settings-column')).toContainText(heading!)
  }
  const version = bar.getByRole('button', { name: /^版本 v/ })
  await expect(version).toBeVisible()
  await version.click()
  await expect(page.locator('.settings-column')).toContainText('关于')
})

test('窄窗口折叠扩展数量，版本留在末尾，状态栏与详情不溢出', async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 640))
  const bar = page.getByRole('contentinfo', { name: '应用状态' })
  const extensions = bar.getByRole('button', { name: '扩展数量' })
  await expect(extensions).toBeVisible()
  await expect(bar.locator('.app-status-counts')).toBeHidden()
  await extensions.click()
  const menu = page.getByRole('menu', { name: '扩展数量' })
  await expect(menu.getByRole('menuitem')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(extensions).toBeFocused()
  await bar.getByRole('button', { name: /^R：/ }).click()
  const dialog = page.getByRole('dialog', { name: 'R 解释器状态' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(e => {
    const r = e.getBoundingClientRect()
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
  })).toBe(true)
  const geometry = await bar.locator('.app-status-main').evaluate(e => {
    const buttons = Array.from(e.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 0)
    return { fit: buttons.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }), last: buttons.at(-1)?.classList.contains('app-status-version') }
  })
  expect(geometry).toEqual({ fit: true, last: true })
  await page.screenshot({ path: info.outputPath('statusbar-narrow.png') })
})
