import { test, expect, 在项目里开会话, CANNED_REPLY } from './fixtures.js'
import type { Page } from '@playwright/test'
import { WORKBENCH_PROPORTIONS_KEY } from '../src/ui/workbench-layout.js'

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    const home = rect('.home-button'), icon = rect('.home-button svg'), brand = rect('.brand-mark')
    return {
      width: rect('.sidebar').width,
      boundary: rect('.topbar-navigation').right - rect('.sidebar').right,
      dx: icon.x + icon.width / 2 - home.x - home.width / 2,
      dy: icon.y + icon.height / 2 - home.y - home.height / 2,
      gap: brand.left - home.right,
      buttons: ['.home-button', '.side-toggle', '.shortcut-toggle'].map(s => ({ w: rect(s).width, h: rect(s).height })),
      inset: rect('.sidebar').right - rect('.shortcut-toggle').right,
      fits: rect('.brand-name').right < rect('.side-toggle').left,
      labelVisible: rect('.brand-name').right <= rect('.brand').right - 1,
    }
  })
}

test('居中紧凑返回、边界在拖宽和重启后对齐，折叠保留完整品牌与草稿', async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1320, 860))
  await 在项目里开会话(page)
  const check = async (width: number) => {
    await expect.poll(async () => (await geometry(page)).width).toBe(width)
    const g = await geometry(page)
    expect(Math.abs(g.boundary)).toBeLessThanOrEqual(1)
    expect(Math.abs(g.dx)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(g.dy)).toBeLessThanOrEqual(0.5)
    expect(g.gap).toBeGreaterThanOrEqual(0); expect(g.gap).toBeLessThanOrEqual(2)
    expect(g.buttons).toEqual(Array.from({ length: 3 }, () => ({ w: 32, h: 32 })))
    expect(g.inset).toBeGreaterThanOrEqual(12); expect(g.inset).toBeLessThanOrEqual(14)
    expect(g.fits).toBe(true); expect(g.labelVisible).toBe(true)
  }
  await check(300)
  const input = page.locator('.composer textarea'); await input.fill('保留这段未发送的多行草稿\n下一步绘图')
  await page.getByRole('button', { name: '首页', exact: true }).hover()
  await expect(page.locator('.topbar-tooltip')).toHaveText('返回首页')
  await page.screenshot({ path: info.outputPath('header-home-tooltip.png'), scale: 'css' })
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width)).toBe(0)
  await expect(page.locator('.brand-name')).toHaveText('DAWN Science')
  await expect(page.locator('.home-button')).toBeVisible()
  await expect(page.locator('.topbar-navigation')).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)')
  await page.mouse.move(700, 400)
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).hover()
  await expect(page.locator('.topbar-tooltip')).toHaveText('展开侧边栏')
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click(); await check(300)
  await expect(input).toHaveValue('保留这段未发送的多行草稿\n下一步绘图')
  const sash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  await sash.focus(); await sash.press('ArrowRight'); await check(316)
  await page.reload(); await check(316)
  await page.evaluate(() => localStorage.setItem('dawn.global.sidebar-width', '260'))
  // Explicitly saved proportions take precedence over the legacy pixel key.
  await page.reload(); await check(316)
  // Without a proportion record, an old narrow preference still clamps to 300px.
  await page.evaluate(key => localStorage.removeItem(key), WORKBENCH_PROPORTIONS_KEY)
  await page.reload(); await check(300)
  await page.setViewportSize({ width: 900, height: 800 })
  await page.evaluate(() => { document.documentElement.classList.remove('dawn-light'); document.documentElement.classList.add('dawn-dark') })
  await check(300)
  await page.getByRole('button', { name: '快捷键速查', exact: true }).focus()
  await expect(page.locator('.topbar-tooltip')).toHaveText('快捷键速查')
  await page.screenshot({ path: info.outputPath('header-keyboard-dark.png'), scale: 'css' })
  await page.keyboard.press('Escape'); await expect(page.locator('.topbar-tooltip')).toHaveCount(0)
  await page.setViewportSize({ width: 700, height: 700 })
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.locator('.topbar-navigation')).toHaveCSS('border-right-width', '0px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('本行按钮鼠标和键盘都有提示，返回首页后恢复草稿', async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const input = page.locator('.composer textarea')
  await input.fill('先开启一轮对话以检查会话工具'); await input.press('Enter')
  await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
  await input.fill('仍然以对话为主')
  const tip = page.locator('.topbar-tooltip')
  const checks = [
    ['.home-button', '返回首页'], ['.brand', '新建任务'], ['.side-toggle', '收起侧边栏'],
    ['.shortcut-toggle', '快捷键速查'], ['.session-tab-close', '关闭页签（保留会话）'],
    ['.session-tab-new', '在此处新建会话'], ['.dock-switch-trigger', '打开右侧面板'],
  ]
  for (const [selector, text] of checks) {
    const button = page.locator(selector!).first()
    await button.hover(); await expect(tip).toHaveText(text!)
    expect(await button.getAttribute('title')).toBeNull()
    const described = (await button.getAttribute('aria-describedby'))!.split(' ')
    expect(described).toContain(await tip.getAttribute('id'))
  }
  const tab = page.locator('.session-tab').first()
  await tab.hover(); await expect(tip).toHaveText(`切换会话：${(await tab.innerText()).trim()}`)
  await page.locator('.home-button').focus()
  await expect(tip).toHaveText('返回首页')
  await page.keyboard.press('Tab'); await expect(tip).toHaveText('新建任务')
  await page.keyboard.press('Tab'); await expect(tip).toHaveText('收起侧边栏')
  await page.keyboard.press('Tab'); await expect(tip).toHaveText('快捷键速查')
  await page.screenshot({ path: info.outputPath('header-keyboard-focus.png'), scale: 'css' })
  await page.keyboard.press('Escape'); await expect(tip).toHaveCount(0)
  await page.locator('.home-button').click()
  await expect(page.getByRole('heading', { name: 'DAWN Science', exact: true })).toBeVisible()
  await expect(tip).toHaveCount(0)
  await page.locator('.app-home').getByRole('button', { name: /上次进行到这里/ }).click()
  await expect(input).toHaveValue('仍然以对话为主')
  await page.locator('.dock-switch-trigger').click()
  await page.mouse.move(700, 400)
  await page.locator('.dock-switch-trigger').hover()
  await expect(tip).toHaveText('收起右侧面板')
  await page.locator('.dock-switch-trigger').click()
  await page.addInitScript(() => localStorage.setItem('dawn.global.lang', 'en')); await page.reload()
  await page.locator('.home-button').hover(); await expect(tip).toHaveText('Back to home')
  const bounds = (await tip.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(8)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) - 8)
})
