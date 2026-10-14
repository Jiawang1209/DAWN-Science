import { mkdirSync } from "node:fs"
import { test, expect, 开一段临时会话, 等进了对话, 进设置 } from "./fixtures.js"
import { 默认转录预算 } from "../src/ui/transcript-budget.js"

const shots = "tmp/ui-refresh-verification/conversation-search"

test("会话内搜索：折叠工具参数与输出也能定位", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "跑个 Cox 看看")
  await expect(page.locator(".completed-process-head")).toBeVisible()
  const process = page.locator(".completed-process-head")
  if (await process.getAttribute("aria-expanded") === "true") await process.click()
  await expect(page.locator(".tool")).toHaveCount(0)
  await page.locator(".topbar .conv-actions-trigger").click()
  await page.getByRole("menuitem", { name: /查找当前对话/ }).click()
  await page.getByRole("searchbox").fill("coxph")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("1 / 1 条匹配")
  await expect(page.locator('.tool[data-search-hit="true"]')).toHaveClass(/\bopen\b/)
  await expect(process).toHaveAttribute("aria-expanded", "true")
  await expect(page.locator('.tool[data-search-hit="true"]')).toContainText("coxph")
})

test("会话内搜索：独立范围、导航与输入法，搜索不影响草稿", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "另一段的独角鲸")
  await 开一段临时会话(page, "当前鲸落问题一")
  const composer = page.locator("main.main .composer-card").getByRole("textbox")
  await composer.fill("当前鲸落问题二")
  await composer.press("Enter")
  await expect(page.locator(".turn.agent").last()).toContainText("假模型已应答")
  await composer.fill("保留这份草稿")
  await page.locator(".topbar .conv-actions-trigger").click()
  await page.getByRole("menuitem", { name: /查找当前对话/ }).click()
  const search = page.getByRole("searchbox", { name: "搜索当前会话内容" })
  await expect(search).toBeFocused()
  await search.fill("鲸落")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("1 / 2 条匹配")
  await expect(page.locator('.turn[data-search-hit="true"]').first()).toContainText("问题一")
  await search.press("Enter")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("2 / 2 条匹配")
  await search.dispatchEvent("keydown", { key: "Enter", isComposing: true })
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("2 / 2 条匹配")
  await search.press("Shift+Enter")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("1 / 2 条匹配")
  await expect.poll(() => page.evaluate(() => CSS.highlights.get("dawn-search-hit")?.size ?? 0)).toBeGreaterThan(0)
  await search.fill("独角鲸")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("没有匹配内容")
  await expect(composer).toHaveValue("保留这份草稿")
  await search.press("Escape")
  await expect(search).toHaveCount(0)
  await expect(page.locator(".topbar .conv-actions-trigger")).toBeFocused()
  await expect(composer).toHaveValue("保留这份草稿")
})

test("会话内搜索：预算之外仍能跳到，亮暗和窄窗口不溢出", async ({ dawn }) => {
  test.setTimeout(120_000)
  const { page } = dawn
  await 开一段临时会话(page, "旧历史鲸落关键词")
  const composer = page.locator("main.main .composer-card").getByRole("textbox")
  for (let i = 0; i <= 默认转录预算 / 2 + 1; i++) {
    await composer.fill(`后续问题 ${i}`)
    await composer.press("Enter")
    await expect(page.locator(".turn.agent").last()).toContainText("假模型已应答")
    await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0)
  }
  await expect(page.locator(".turn.user").filter({ hasText: "旧历史鲸落" })).toHaveCount(0)
  await page.locator(".topbar .conv-actions-trigger").click()
  await page.getByRole("menuitem", { name: /查找当前对话/ }).click()
  await page.getByRole("searchbox").fill("鲸落")
  const hit = page.locator('.turn.user[data-search-hit="true"]')
  await expect(hit).toContainText("旧历史鲸落")
  await expect.poll(async () => {
    const h = (await hit.boundingBox())!
    const viewport = (await page.locator(".turns").boundingBox())!
    return h.y >= viewport.y && h.y + h.height <= viewport.y + viewport.height
  }).toBe(true)
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: `${shots}/light.png`, animations: "disabled" })
  await page.setViewportSize({ width: 900, height: 700 })
  expect(await page.locator(".conversation-search").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: `${shots}/narrow.png`, animations: "disabled" })
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await page.locator(".topbar .conv-actions-trigger").click()
  await page.getByRole("menuitem", { name: /查找当前对话/ }).click()
  await page.getByRole("searchbox").fill("鲸落")
  await expect(page.locator(".conversation-search [role=status]")).toHaveText("1 / 1 条匹配")
  await page.screenshot({ path: `${shots}/dark.png`, animations: "disabled" })
})

test("提问时间：实时显示且重开后从历史恢复", async ({ dawn }) => {
  await 开一段临时会话(dawn.page, "提问时间恢复检查")
  const before = dawn.page.locator(".turn.user time").first()
  await expect(before).toBeVisible()
  const at = Date.parse((await before.getAttribute("datetime"))!)
  expect(Math.abs(Date.now() - at)).toBeLessThan(15_000)
  await expect(before).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  const page = await dawn.重开()
  await page.locator(".sess-item").filter({ hasText: "提问时间恢复检查" }).locator(".row").first().click()
  await 等进了对话(page)
  const restored = page.locator(".turn.user time").first()
  await expect(restored).toBeVisible()
  expect(Math.abs(Date.parse((await restored.getAttribute("datetime"))!) - at)).toBeLessThan(3_000)
  await expect(page.locator(".turn.agent time")).toHaveCount(0)
})
