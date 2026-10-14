import { test, expect, 开一段临时会话, 在项目里开会话, 进坞 } from "./fixtures.js"

const title = "校正500米8月数据偏差与长期生态监测数据分析结果核查".repeat(5)

test("会话标题与折叠按钮齐平，长标题在亮暗与收合布局内保持单行", async ({ dawn }, testInfo) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.evaluate(async title => {
    const w = window as unknown as { dawn: { invoke(op: string, req: unknown): Promise<{ data: { sessionId: string }[] }> } }
    const r = await w.dawn.invoke("listTemporarySessions", {})
    await w.dawn.invoke("renameSession", { sessionId: r.data[0]!.sessionId, title })
  }, title)
  await page.reload()
  await page.locator(".session-list .sess-item .row").first().click()
  const heading = page.locator(".conv-title")
  const toggle = page.locator(".side-toggle")
  await expect(heading).toContainText("校正500米8月数据偏差")
  const check = async () => {
    const h = (await heading.boundingBox())!
    const b = (await toggle.boundingBox())!
    expect(Math.abs(h.y + h.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(1)
    const style = await heading.evaluate(el => {
      const s = getComputedStyle(el)
      return { size: s.fontSize, weight: s.fontWeight, nowrap: s.whiteSpace, ellipsis: s.textOverflow, width: el.clientWidth, scroll: el.scrollWidth }
    })
    expect(style.size).toBe("16px")
    expect(style.weight).toBe("500")
    expect(style.nowrap).toBe("nowrap")
    expect(style.ellipsis).toBe("ellipsis")
    expect(h.width).toBeGreaterThan(60)
    expect(h.x).toBeGreaterThan(b.x + b.width)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(h.x + h.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
    const dock = (await page.locator(".dock-switch").boundingBox())
    if (dock) expect(h.x + h.width).toBeLessThanOrEqual(dock.x)
    await expect(page.locator(".topbar .conv-title")).toHaveCount(1)
    await expect(page.locator("main.main .conv-title")).toHaveCount(0)
  }
  await check()
  await expect(page.locator(".session-usage")).toHaveCount(0)
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("light.png") })
  await page.getByRole("separator", { name: "调整侧栏宽度", exact: true }).focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight")
  await expect.poll(async () => (await heading.boundingBox())!.x).toBeGreaterThan(420)
  await check()
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await check()
  await page.setViewportSize({ width: 900, height: 800 })
  await check()
  await 进坞(page, "文件")
  await check()
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await check()
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("dark-narrow.png") })
  await page.locator(".topbar .brand").click()
  await expect(heading).toHaveCount(0)
})


test("会话顶栏预览：正常标题、亮暗主题及侧边会话互不串台", async ({ dawn }, testInfo) => {
  const { page } = dawn
  await 开一段临时会话(page, "校正500米8月数据偏差")
  await expect(page.locator(".topbar .conv-title")).toHaveText("500米8月偏差校正")
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("conversation-light.png") })
  await 进坞(page, "对话")
  await page.locator(".right-dock").getByRole("button", { name: "另开一段", exact: true }).click()
  await expect(page.locator(".right-dock .conv-head")).toBeVisible()
  await expect(page.locator(".topbar .conv-title")).toHaveText("500米8月偏差校正")
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("conversation-dark.png") })
})


test("同项目多个会话各有概括标题，页签、侧栏和顶栏同步，重载后仍能正确切换", async ({ dawn }, testInfo) => {
  const { page } = dawn
  const send = async (text: string) => {
    const box = page.locator("main.main").getByPlaceholder(/今天帮你做些什么/)
    await box.fill(text)
    await box.press("Enter")
  }
  await 在项目里开会话(page)
  await send("现在500米8月的数据存在偏差，想核查输入、过滤条件和统计结果，请帮我进行校正。")
  await expect(page.locator(".conv-title")).toHaveText("500米8月偏差校正")
  await 在项目里开会话(page)
  await send("这里是30米的NDVI数据，请检查异常值、缺失像元和数据质量，然后汇总检查结果。")
  await expect(page.locator(".conv-title")).toHaveText("30米NDVI质量检查")
  const tabs = page.getByRole("tablist", { name: "同一处的会话" })
  await expect(tabs.getByRole("tab")).toHaveCount(2)
  await expect(tabs).toContainText("500米8月偏差校正")
  await expect(tabs).toContainText("30米NDVI质量检查")
  await expect(page.locator(".proj-session-list")).toContainText("500米8月偏差校正")
  await expect(page.locator(".proj-session-list")).toContainText("30米NDVI质量检查")
  await tabs.getByRole("tab", { name: /500米8月偏差校正/ }).click()
  await expect(page.locator(".conv-title")).toHaveText("500米8月偏差校正")
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("project-sessions-light.png") })
  await page.reload()
  await page.locator(".proj-session-list .sess-item .row").filter({ hasText: "30米NDVI质量检查" }).click()
  await expect(page.locator(".conv-title")).toHaveText("30米NDVI质量检查")
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("project-sessions-dark.png") })
})
