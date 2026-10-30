import { readFileSync } from "node:fs"
import { test, expect, 在项目里开会话, 进坞, 进设置 } from "./fixtures.js"

async function checkComposer(area: import('@playwright/test').Locator) {
  const card = area.locator('.composer-card')
  await expect(card.locator('.composer-footer .composer-controls .send-btn')).toBeVisible()
  await expect(card.locator('.composer-footer .composer-tools .perm-pill')).toBeVisible()
  await expect(card.locator('.composer-environment .ws-chip')).toBeVisible()
  await expect(card.locator('.composer-environment .composer-location')).toBeVisible()
  const bounds = (await card.boundingBox())!
  const environment = (await card.locator('.composer-environment').boundingBox())!
  const input = (await card.locator('.composer-box').boundingBox())!
  const footer = (await card.locator('.composer-footer').boundingBox())!
  const send = (await card.locator('.send-btn').boundingBox())!
  const add = (await card.locator('.attach-trigger').boundingBox())!
  expect(environment.y + environment.height).toBeLessThanOrEqual(input.y + 1)
  expect(input.y + input.height).toBeLessThanOrEqual(footer.y + 1)
  // 极窄栏允许左右两组分行；每组内部对齐，控件完整留在卡片内。
  const perm = (await card.locator('.perm-pill').boundingBox())!
  const model = (await card.locator('.composer-controls').boundingBox())!
  expect(Math.abs((perm.y + perm.height / 2) - (add.y + add.height / 2))).toBeLessThanOrEqual(2)
  expect(Math.abs((send.y + send.height / 2) - (model.y + model.height / 2))).toBeLessThanOrEqual(2)
  expect(send.y).toBeGreaterThanOrEqual(footer.y)
  expect(send.y + send.height).toBeLessThanOrEqual(footer.y + footer.height)
  expect(footer.y + footer.height).toBeLessThanOrEqual(bounds.y + bounds.height)
  const geometry = await card.locator('.composer-footer').evaluate(el => ({
    scroll: el.scrollWidth, width: el.clientWidth,
    overflow: Array.from(el.querySelectorAll('*')).filter(c => c.getBoundingClientRect().right > el.getBoundingClientRect().right).map(c => ({ cls: c.className, right: c.getBoundingClientRect().right, width: c.getBoundingClientRect().width, visible: getComputedStyle(c).visibility })),
  }))
  expect(geometry.scroll <= geometry.width, JSON.stringify(geometry)).toBe(true)
  for (const item of await card.locator('.attach-trigger, .ws-chip, .perm-pill-trigger, .composer-controls').all()) {
    const b = (await item.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(bounds.x)
    expect(b.x + b.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
  }
}

test('确认稿：顶部环境与底部操作行在首页、主会话和窄侧边会话内完整可用', async ({ dawn }) => {
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

test('确认稿：品牌与折叠、快捷键按钮紧凑排列，收起后仍可展开，版本常驻全局右下角', async ({ dawn }) => {
  const { page } = dawn
  const toggle = page.locator('.side-toggle')
  const sash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  for (let i = 0; i < 4; i++) {
    await expect.poll(async () => {
      const brand = (await page.locator('.topbar .brand').boundingBox())!
      const buttons = await Promise.all(['.side-toggle', '.shortcut-toggle'].map(selector => page.locator(selector).boundingBox()))
      const gaps = [buttons[0]!.x - brand.x - brand.width, ...buttons.slice(1).map((b, j) => b!.x - buttons[j]!.x - buttons[j]!.width)]
      // 顶栏已有的紧凑规则：按钮间4px，品牌组另留4px（本轮未修改顶栏）。
      return Math.max(...gaps.map((gap, index) => Math.abs(gap - (index === 0 ? 8 : 4))))
    }, { timeout: 2_000 }).toBeLessThanOrEqual(1)
    await sash.focus()
    await sash.press('ArrowLeft')
  }
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '展开侧边栏')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '收起侧边栏')
  const version = page.locator('.statusbar .app-status-version')
  await expect(version).toContainText(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version)
  await expect(page.locator('.topbar .app-status-version')).toHaveCount(0)
  const b = (await version.boundingBox())!
  expect(b.x + b.width).toBeGreaterThan(await page.evaluate(() => window.innerWidth - 24))
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(version).toBeVisible()
})

test('确认稿：侧栏外壳、正文和右坞使用各自亮暗工作面', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  const check = async () => {
    const colors = await page.evaluate(() => {
      const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor
      const token = (name: string) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = `var(--dawn-surface-${name})`
        document.body.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      }
      return { sidebar: bg('.sidebar'), dock: bg('.right-dock'), main: bg('main.main'), shell: token('shell'), panel: token('panel'), chat: token('chat-content') }
    })
    for (const color of [colors.shell, colors.panel, colors.chat]) expect(color).not.toBe('rgba(0, 0, 0, 0)')
    expect(colors.sidebar).toBe(colors.shell)
    expect(colors.dock).toBe(colors.panel)
    expect(colors.main).toBe(colors.chat)
    expect(colors.dock).not.toBe(colors.sidebar)
  }
  await check()
  await 进设置(page, '外观')
  await page.getByRole('radio', { name: '暗色', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('html.dawn-dark')).toHaveCount(1)
  await check()
})
