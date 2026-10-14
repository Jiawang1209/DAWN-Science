import { test, expect, 在项目里开会话 } from "./fixtures.js"

test("项目单会话和多会话都在顶栏并列，切换、关闭和最后一段清理保持正确", async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const tabs = page.getByRole("tablist", { name: "同一处的会话" })
  const check = async (count: number) => {
    await expect(tabs.getByRole("tab")).toHaveCount(count)
    expect(await tabs.evaluate(el => !!el.closest(".topbar"))).toBe(true)
    await expect(page.locator("main.main .session-tabs")).toHaveCount(0)
    await expect(page.locator(".topbar .conv-title")).toHaveCount(1)
    const t = (await tabs.getByRole("tab", { selected: true }).boundingBox())!
    const b = (await page.locator(".side-toggle").boundingBox())!
    expect(Math.abs(t.y + t.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(1)
    expect(await page.locator(".topbar .conv-title").evaluate(el => el.closest('[role="tab"]') !== null)).toBe(true)
  }
  await check(1)
  const say = async (text: string) => {
    const input = page.locator("main.main .composer-card").getByRole("textbox")
    await input.fill(text)
    await input.press("Enter")
  }
  await say("现在500米8月的数据存在偏差，想核查输入、过滤条件和统计结果，请帮我进行校正。")
  await expect(page.locator(".conv-title")).toHaveText("500米8月偏差校正")
  await page.screenshot({ animations: "disabled", path: info.outputPath("one-session.png") })
  await tabs.getByRole("button", { name: "在这里再开一段", exact: true }).click()
  await check(2)
  await say("这里是30米的NDVI数据，请检查异常值、缺失像元和数据质量，然后汇总检查结果。")
  await expect(page.locator(".conv-title")).toHaveText("30米NDVI质量检查")
  await check(2)
  await page.screenshot({ animations: "disabled", path: info.outputPath("two-sessions-light.png") })
  await tabs.getByRole("tab", { name: /500米8月偏差校正/ }).focus()
  await tabs.getByRole("tab", { name: /500米8月偏差校正/ }).press("Enter")
  await expect(tabs.getByRole("tab", { name: /500米8月偏差校正/ })).toBeFocused({ timeout: 1000 })
  await expect(page.locator(".conv-title")).toHaveText("500米8月偏差校正")
  await expect(page.locator(".proj-session-list .sess-item.current")).toContainText("500米8月偏差校正")
  await page.setViewportSize({ width: 900, height: 800 })
  await check(2)
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ animations: "disabled", path: info.outputPath("two-sessions-narrow-dark.png") })
  await tabs.getByRole("button", { name: "关掉「500米8月偏差校正」（收进归档）", exact: true }).click()
  await check(1)
  await expect(page.locator(".conv-title")).toHaveText("30米NDVI质量检查")
  await tabs.getByRole("button", { name: "关掉「30米NDVI质量检查」（收进归档）", exact: true }).click()
  await expect(tabs).toHaveCount(0)
  await expect(page.locator(".topbar .conv-title")).toHaveCount(0)
})

test("顶栏多页签横向收纳，切换与查找仍指向当前会话", async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const tabs = page.getByRole("tablist", { name: "同一处的会话" })
  for (let i = 2; i <= 7; i++) {
    await tabs.getByRole("button", { name: "在这里再开一段", exact: true }).click()
    await expect(tabs.getByRole("tab")).toHaveCount(i)
  }
  await page.setViewportSize({ width: 900, height: 800 })
  expect(await tabs.evaluate(el => !!el.closest(".topbar"))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const selected = tabs.getByRole("tab", { selected: true })
  await expect(selected).toBeInViewport()
  await page.locator("main.main .composer-card").getByRole("textbox").press("Meta+f")
  await expect(page.getByRole("searchbox", { name: "搜索当前会话内容" })).toBeFocused()
  await page.getByRole("searchbox").press("Escape")
  await page.screenshot({ animations: "disabled", path: info.outputPath("many-sessions.png") })
})
