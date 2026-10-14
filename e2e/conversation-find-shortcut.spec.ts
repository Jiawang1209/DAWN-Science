import { test, expect, 开一段临时会话, 进坞 } from "./fixtures.js"

test("会话快捷键按焦点查找，重复调用选中关键词，顶栏只保留全局搜索", async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page, "校正500米8月数据偏差")
  const main = page.locator("main.main")
  const input = main.locator(".composer-card").getByRole("textbox")
  await input.fill("保留主区草稿")
  await input.press("Meta+f")
  const search = main.getByRole("searchbox", { name: "搜索当前会话内容" })
  await expect(search).toBeFocused()
  await search.fill("500米")
  await expect(main.locator(".conversation-search [role=status]")).toHaveText("1 / 1 条匹配")
  await search.press("Control+f")
  expect(await search.evaluate(el => { const i = el as HTMLInputElement; return i.selectionEnd! - i.selectionStart! })).toBe(4)
  await search.press("Escape")
  await expect(input).toBeFocused()
  await expect(input).toHaveValue("保留主区草稿")
  await expect(page.locator(".topbar .conv-search-toggle")).toHaveCount(0)
  await page.locator(".topbar .conv-actions-trigger").click()
  await page.getByRole("menuitem", { name: /查找当前对话/ }).click()
  await expect(search).toBeFocused()
  await search.press("Escape")
  await expect(page.locator(".topbar .conv-actions-trigger")).toBeFocused()
  await 进坞(page, "对话")
  const side = page.locator(".right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  const sideInput = side.locator(".composer-card").getByRole("textbox")
  await sideInput.fill("侧边草稿")
  await sideInput.press("Control+f")
  await expect(side.getByRole("searchbox")).toBeFocused()
  await expect(main.getByRole("searchbox")).toHaveCount(0)
  await side.getByRole("searchbox").press("Escape")
  await expect(sideInput).toBeFocused()
  await expect(sideInput).toHaveValue("侧边草稿")
  await page.locator(".topbar .side-search-toggle").click()
  const global = page.getByRole("dialog", { name: "搜索" })
  await expect(global).toBeVisible()
  await global.getByRole("textbox").press("Meta+f")
  await expect(main.getByRole("searchbox")).toHaveCount(0)
  await expect(side.getByRole("searchbox")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.screenshot({ animations: "disabled", path: info.outputPath("search-navigation.png") })
})

test("顶栏导航右边界跟随侧栏，默认与拖宽后对齐，折叠后入口仍可用", async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page, "校正500米8月数据偏差")
  const nav = page.locator(".topbar-navigation")
  const check = async () => {
    await expect.poll(async () => {
      const n = (await nav.boundingBox())!
      const s = (await page.locator(".sidebar").boundingBox())!
      return Math.abs(n.x + n.width - s.x - s.width)
    }).toBeLessThanOrEqual(1)
    const n = (await nav.boundingBox())!
    const s = (await page.locator(".sidebar").boundingBox())!
    expect(Math.abs(n.x + n.width - s.x - s.width)).toBeLessThanOrEqual(1)
    for (const selector of [".side-toggle", ".side-search-toggle", ".shortcut-toggle"]) {
      const b = (await nav.locator(selector).boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(n.x)
      expect(b.x + b.width).toBeLessThanOrEqual(n.x + n.width)
    }
    expect((await page.locator(".topbar .conv-title").boundingBox())!.x).toBeGreaterThan(n.x + n.width)
  }
  await check()
  await page.screenshot({ animations: "disabled", path: info.outputPath("aligned-default.png") })
  await page.getByRole("separator", { name: "调整侧栏宽度", exact: true }).focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight")
  await check()
  await nav.locator(".side-toggle").click()
  await expect(nav.locator(".side-toggle")).toHaveAttribute("aria-label", "展开侧边栏")
  await expect(nav.locator(".shortcut-toggle")).toBeVisible()
  await page.setViewportSize({ width: 900, height: 800 })
  await nav.locator(".side-toggle").click()
  await check()
})
