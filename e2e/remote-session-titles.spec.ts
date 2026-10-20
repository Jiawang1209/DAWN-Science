import { test, expect } from "./fixtures.js"

test.use({ dawnOptions: { fakeSsh: true } })

test("服务器内多会话分别概括、同名区分、切换正确；宽侧栏和远端信息不挤走标题", async ({ dawn }, testInfo) => {
  const { page } = dawn
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("生态监测服务器-内蒙古草地500米与30米数据分析工作区")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "添加服务器", exact: true })).toHaveCount(0)
  const server = page.locator(".remote-row").first()
  let count = 0
  const send = async (text: string, expected: string) => {
    await server.getByRole("button", { name: "新建远端任务", exact: true }).click()
    await expect(page.locator(".conv-title")).toHaveText(/新(?:对话|会话)/)
    await expect(page.locator(".topbar .session-tabs").getByRole("tab")).toHaveCount(++count)
    await expect(page.locator("main.main .session-tabs")).toHaveCount(0)
    await expect(page.locator(".conv-remote")).toBeVisible()
    const input = page.locator("main.main .composer-card").getByRole("textbox")
    await input.fill(text)
    await input.press("Enter")
    await expect(page.locator(".conv-title")).toHaveText(expected)
    await expect(page.locator("main.main").getByRole("button", { name: "导出对话", exact: true })).toBeVisible()
  }
  await send("500米8月数据有偏差，请核对输入数据、过滤条件并校正。", "500米8月偏差校正")
  await send("30米NDVI数据需要检查质量，请检查缺失像元和异常值。", "30米NDVI质量检查")
  await send("500米8月数据有偏差，请核对输入数据、过滤条件并校正。", "500米8月偏差校正 · 2")
  await expect(server.locator(".sess-item")).toHaveCount(3)
  await expect(server).toContainText("30米NDVI质量检查")
  await server.locator(".sess-item .row").filter({ hasText: "30米NDVI质量检查" }).click()
  await expect(page.locator(".conv-title")).toHaveText("30米NDVI质量检查")
  await page.getByRole("separator", { name: "调整侧栏宽度", exact: true }).focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight")
  await page.setViewportSize({ width: 900, height: 800 })
  const header = page.locator(".topbar")
  for (const selector of [".conv-title", ".conv-remote", ".dock-switch"]) {
    const box = (await header.locator(selector).boundingBox())!
    expect(box.width).toBeGreaterThan(selector === ".conv-title" ? 60 : 0)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(900)
  }
  const geometry = await header.evaluate(el => {
    const children = [...el.querySelectorAll(".conv-title, .conv-remote")].map(x => x.getBoundingClientRect())
    return children.slice(1).every((b, i) => b.left >= children[i]!.right)
  })
  expect(geometry).toBe(true)
  await expect(page.locator("main.main").getByRole("button", { name: "查找当前对话", exact: true })).toBeVisible()
  await expect(header.locator(".conv-actions-trigger")).toHaveCount(0)
  await expect(page.locator(".conv-remote")).toHaveAttribute("title", /生态监测服务器.*:\/home\/dawn/)
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("server-sessions-narrow.png") })
})
