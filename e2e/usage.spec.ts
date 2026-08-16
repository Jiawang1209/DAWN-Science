/**
 * 「设置 → 用量」（S21，2026-08-16）。**跑真实构建产物。**
 *
 * 这一条盯的是**整条线通没通**：跑一轮对话 → token 落进账本 →
 * 汇总查出来 → 画在屏上。中间任何一节断了，这里都是零。
 *
 * 假模型报的是 `prompt_tokens: 12 / completion_tokens: 8`（写死在
 * `scripts/mock-inference-server.mjs` 里），所以**数是可预期的**。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

async function 进用量(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "用量", exact: true }).click()
}

test("**跑一轮之后，用量那一屏上有真数**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  await 进用量(page)

  /**
   * ① 累计不是 0。**这一条就是「整条线通没通」**——
   * 账本没记 token 的那一版，这里永远是 0，而屏幕看起来一切正常。
   */
  const 累计 = page.locator(".usage-stat").first()
  await expect(累计).toContainText("累计 Token")
  await expect(累计.locator(".usage-stat-value")).not.toHaveText("0")

  // ② 按模型那一块真的分出了模型，不是「还没有记到」
  await expect(page.locator(".usage-pie")).toBeVisible()
  await expect(page.locator(".usage-legend-list li")).not.toHaveCount(0)

  // ③ 今天那一格也有数——日历按本地时区切，切错了这里会是 0
  const 今天格 = page.locator(".usage-stat").nth(1)
  await expect(今天格).toContainText("今天")
  await expect(今天格.locator(".usage-stat-value")).not.toHaveText("0")
})

/**
 * 预算是**人自己定的**，所以这条路要走得通：没有 → 设一个 → 有进度条 → 取消。
 *
 * **「填 0 取消」必须验**：一个只能设不能取消的数字，
 * 会逼人去猜（填 1？删掉？），而猜错的代价是一条永远超着的进度条。
 */
test("**每日预算：设得上，也去得掉**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 进用量(page)

  // 一开始没有预算：不画进度条，而是说清楚「还没有」
  await expect(page.locator(".usage-bar")).toHaveCount(0)
  await expect(page.locator(".usage-budget")).toContainText("还没有每日预算")

  await page.getByRole("button", { name: "设一个每日预算" }).click()
  await page.getByRole("textbox", { name: "每天多少 token" }).fill("1000000")
  await page.locator(".usage-budget-form").getByRole("button", { name: "保存" }).click()

  await expect(page.locator(".usage-bar")).toBeVisible()
  // **这句话不能省**：它说的是「这个上限是你自己定的」
  await expect(page.locator(".usage-budget")).toContainText("不是平台额度")

  await page.getByRole("button", { name: "改预算" }).click()
  await page.getByRole("textbox", { name: "每天多少 token" }).fill("0")
  await page.locator(".usage-budget-form").getByRole("button", { name: "保存" }).click()
  await expect(page.locator(".usage-bar")).toHaveCount(0)
})
