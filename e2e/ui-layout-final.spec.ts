import { readFileSync } from "node:fs"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

async function checkComposer(area: import('@playwright/test').Locator) {
  const card = area.locator('.composer-card')
  await expect(card.locator('.composer-box .composer-controls .send-btn')).toBeVisible()
  await expect(card.locator('.composer-footer .composer-status .perm-pill')).toBeVisible()
  const bounds = (await card.boundingBox())!
  const footer = (await card.locator('.composer-footer').boundingBox())!
  const send = (await card.locator('.send-btn').boundingBox())!
  expect(send.y + send.height).toBeLessThanOrEqual(footer.y + 1)
  expect(footer.y + footer.height).toBeLessThanOrEqual(bounds.y + bounds.height)
  const geometry = await card.locator('.composer-footer').evaluate(el => ({
    scroll: el.scrollWidth, width: el.clientWidth,
    overflow: Array.from(el.querySelectorAll('*')).filter(c => c.getBoundingClientRect().right > el.getBoundingClientRect().right).map(c => ({ cls: c.className, right: c.getBoundingClientRect().right, width: c.getBoundingClientRect().width, visible: getComputedStyle(c).visibility })),
  }))
  expect(geometry.scroll <= geometry.width, JSON.stringify(geometry)).toBe(true)
  for (const item of await card.locator('.attach-trigger, .ws-chip, .dock-toggle, .enhance-main, .plan-toggle, .perm-pill-trigger, .ctx-meter > button').all()) {
    const b = await item.boundingBox()
    if (!b) continue
    expect(b.x).toBeGreaterThanOrEqual(bounds.x)
    expect(b.x + b.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
  }
}

test('确认稿：双层输入框在首页、主会话和窄侧边会话内完整可用', async ({ dawn }) => {
  const { page } = dawn
  await checkComposer(page.locator('.welcome'))
  await 在项目里开会话(page)
  await 进坞(page, '对话')
  const side = page.locator('.right-dock')
  await side.getByRole('button', { name: '另开一段', exact: true }).click()
  for (const width of [1920, 1280, 1080]) {
    await page.setViewportSize({ width, height: 900 })
    await checkComposer(page.locator('main.main'))
    await checkComposer(side)
  }
})

test('确认稿：品牌与三个按钮紧凑排列，收起后仍可展开，版本常驻全局右下角', async ({ dawn }) => {
  const { page } = dawn
  const toggle = page.locator('.side-toggle')
  const sash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  for (let i = 0; i < 4; i++) {
    await expect.poll(async () => {
      const brand = (await page.locator('.topbar .brand').boundingBox())!
      const buttons = await Promise.all(['.side-toggle', '.side-search-toggle', '.shortcut-toggle'].map(selector => page.locator(selector).boundingBox()))
      const gaps = [buttons[0]!.x - brand.x - brand.width, ...buttons.slice(1).map((b, j) => b!.x - buttons[j]!.x - buttons[j]!.width)]
      return Math.max(...gaps.map(gap => Math.abs(gap - 8)))
    }, { timeout: 2_000 }).toBeLessThanOrEqual(1)
    await sash.focus()
    await sash.press('ArrowLeft')
  }
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '展开侧边栏')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '收起侧边栏')
  const version = page.locator('.statusbar .brand-version')
  await expect(version).toContainText(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version)
  await expect(page.locator('.topbar .brand-version')).toHaveCount(0)
  const b = (await version.boundingBox())!
  expect(b.x + b.width).toBeGreaterThan(await page.evaluate(() => window.innerWidth - 24))
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(version).toBeVisible()
})

test('确认稿：两侧共享底色，正文与预览保持独立白色工作面', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  const colors = await page.evaluate(() => {
    const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor
    return { sidebar: bg('.sidebar'), dock: bg('.right-dock'), main: bg('main.main') }
  })
  expect(colors.dock).toBe(colors.sidebar)
  expect(colors.main).not.toBe(colors.sidebar)
})
