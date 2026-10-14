import type { Locator } from "@playwright/test"
import { test, expect, 开一段临时会话, 进坞 } from "./fixtures.js"

async function say(area: Locator, text: string) {
  const input = area.locator(".composer-card").getByRole("textbox")
  await input.fill(text)
  await input.press("Enter")
  await expect(area.locator(".session-usage")).toBeVisible()
}
async function checkUsage(area: Locator, rounds: number) {
  const usage = area.locator(".session-usage")
  await expect(usage).toContainText(`${rounds} 轮`)
  expect(await usage.evaluate(el => !!el.closest(".composer"))).toBe(true)
  await expect(area.locator(".conv-head .session-usage")).toHaveCount(0)
  const card = (await area.locator(".composer-card").boundingBox())!
  const box = (await usage.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(card.y + card.height)
  expect(box.x).toBeGreaterThanOrEqual(card.x)
  expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1)
  expect(Math.abs(box.x + box.width / 2 - card.x - card.width / 2)).toBeLessThanOrEqual(1)
}
async function checkActions(area: Locator) {
  const message = area.locator(".turn.user").last()
  const time = message.locator(".turn-time")
  expect(await time.evaluate(el => !!el.closest(".turn-actions"))).toBe(true)
  const timestamp = (await time.boundingBox())!
  const row = (await message.locator(".turn-actions").boundingBox())!
  for (const control of await message.locator(".turn-actions button").all()) {
    const b = (await control.boundingBox())!
    expect(Math.abs(b.y + b.height / 2 - timestamp.y - timestamp.height / 2)).toBeLessThanOrEqual(1)
    expect(b.x).toBeGreaterThanOrEqual(row.x)
    expect(b.x + b.width).toBeLessThanOrEqual(row.x + row.width + 1)
  }
  const body = (await message.locator(".turn-body").boundingBox())!
  expect(row.x).toBeGreaterThanOrEqual(body.x - 1)
  expect(row.x + row.width).toBeLessThanOrEqual(body.x + body.width + 1)
}

test("会话统计跟随输入框下方，主区和280px侧边对话分别累计", async ({ dawn }, testInfo) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const main = page.locator("main.main")
  await expect(main.locator(".composer-session-usage")).not.toBeVisible()
  await say(main, "核查500米监测数据")
  await say(main, "继续检查异常值")
  await checkUsage(main, 2)
  await expect(main.locator(".session-usage")).toContainText("输入 24 · 输出 16 · 缓存 0 · 命中 0%")
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("composer-stats-light.png") })
  await 进坞(page, "对话")
  const dock = page.locator(".right-dock")
  await dock.getByRole("button", { name: "另开一段", exact: true }).click()
  // 空侧边会话不造用量，输入卡仍与已有统计的主区底边对齐。
  await expect(dock.locator(".session-usage")).toHaveCount(0)
  const bottom = async (area: Locator) => area.locator(".composer-card").evaluate(el => el.getBoundingClientRect().bottom)
  await expect.poll(async () => Math.round(Math.abs(await bottom(main) - await bottom(dock)))).toBe(0)
  await say(dock, "检查30米数据质量")
  await dock.evaluate(el => { el.style.width = "280px"; el.style.maxWidth = "280px" })
  await checkUsage(main, 2)
  await checkUsage(dock, 1)
  await checkActions(dock)
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("composer-stats-side-dark.png") })
  // 窄栏统计自然换行时，两张卡同步占位；收回侧栏后主区释放额外高度。
  await dock.locator(".session-usage").evaluate(el => { el.textContent = "100 轮 · 工具 100 次 20 m 30 s · 输入 123.4k · 输出 98.7k · 缓存 567.8k · 命中 97%" })
  await expect.poll(async () => Math.round(Math.abs(await bottom(main) - await bottom(dock)))).toBe(0)
  const reserved = main.locator(".composer-session-usage")
  await expect.poll(async () => reserved.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(20)
  await dock.locator(".dock-close").click()
  await expect.poll(async () => reserved.evaluate(el => el.getBoundingClientRect().height)).toBe(20)
  await page.getByRole("button", { name: "新建任务", exact: true }).click()
  await expect(main.locator(".session-usage")).toHaveCount(0)
  await expect(main.locator(".composer-session-usage")).not.toBeVisible()
})

test("用户消息时间戳、复制、编辑和撤回同一行，短气泡不被操作行撑宽", async ({ dawn }, testInfo) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const main = page.locator("main.main")
  await say(main, "好")
  await checkActions(main)
  const bubble = (await main.locator(".turn.user .bubble").boundingBox())!
  expect(bubble.width).toBeLessThan(100)
  await page.setViewportSize({ width: 900, height: 800 })
  await checkActions(main)
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("user-meta-narrow.png") })
})
