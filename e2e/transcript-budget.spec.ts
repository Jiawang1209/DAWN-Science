/**
 * **只渲染最近若干条**（2026-09-22，`perf-render`，学自 Hermes 的 render budget）。
 *
 * 量出来的账：重渲染压下去之后，剩下的卡顿随**在 DOM 里的条数**涨。所以超出预算的更早消息不进 DOM。
 *
 * 这条用例盯着三件，缺一件这个改动就是「消息会丢」：
 * ① 更早的确实不在 DOM 里（否则这一刀白挨）；
 * ② **屏幕上说清了「更早的 N 条没有显示」，并且给得出来**——常驻一行，不是悬停才出现；
 * ③ 左缘刻度尺点预算之外的那一轮时，先把它放出来再滚，而不是点了没反应。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"
import { 默认转录预算 } from "../src/ui/transcript-budget.js"

/** 一问一答两块，所以说这么多句就能超过预算 */
const 句数 = Math.floor(默认转录预算 / 2) + 1

test("**超过预算的更早消息不进 DOM**，屏幕上说清并给得出来", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)

  for (let i = 1; i <= 句数; i++) {
    await 框.fill(`第${i}句`)
    await 框.press("Enter")
    // 等这一轮答完再说下一句。**不能数 `.turn.agent` 的条数**——超出预算的那几条本来就不在 DOM 里，
    // 数着数着就永远等不到了（第一版就是这么红的）。判据改成「最后一条是 agent 说的」。
    await expect(page.locator(".turns .turn").last()).toHaveClass(/agent/, { timeout: 30_000 })
  }

  // ① 最早那句已经不在 DOM 里了
  await expect(page.locator(".turns").getByText("第1句", { exact: true })).toHaveCount(0)
  // 最近那句当然还在
  await expect(page.locator(".turns").getByText(`第${句数}句`, { exact: true })).toBeVisible()

  // ② 屏幕上说清了，而且那颗按钮**看得见**（不是 opacity: 0 的裸图标）
  const 条 = page.locator(".earlier-bar")
  await expect(条).toContainText("没有显示")
  const 颗 = 条.getByRole("button", { name: /显示更早/ })
  await expect(颗).toBeVisible()
  expect(await 颗.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.5)

  await 颗.click()
  await expect(page.locator(".turns").getByText("第1句", { exact: true })).toBeVisible()
  // 全放出来之后那一行就该消失——它说的是此刻的事实
  await expect(条).toHaveCount(0)
})

test("**刻度尺点更早的那一轮不会点了没反应**：先放出来再滚", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  for (let i = 1; i <= 句数; i++) {
    await 框.fill(`第${i}句`)
    await 框.press("Enter")
    await expect(page.locator(".turns .turn").last()).toHaveClass(/agent/, { timeout: 30_000 })
  }

  await expect(page.locator(".turns").getByText("第1句", { exact: true })).toHaveCount(0)
  await page.locator(".turn-nav button").first().click()
  await expect(page.locator(".turns").getByText("第1句", { exact: true })).toBeVisible()
})
