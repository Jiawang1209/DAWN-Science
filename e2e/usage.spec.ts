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
  /**
   * **等数据到了再往下走。**
   *
   * 这一屏在 `getUsage` 回来之前显示的是「正在读用量…」，
   * 那时 `.usage-heat` 根本不存在。第一版少了这一句：单独跑绿、
   * 全量跑红（机器忙，查询慢了一拍），报的是
   * `Cannot read properties of null` —— 又一次「前提悄悄没成立」。
   */
  await expect(page.locator(".usage-heat")).toBeVisible({ timeout: 15_000 })
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
 * 日历、饼图、两栏洞察（2026-08-16 作者要的那几件）。
 *
 * **每日预算那条用例随功能一起撤了**：作者当天定的
 * *「不需要每日预算，因为不用 token，怎么干活呢」*——
 * 超了我们也不会拦，那条进度条只剩下让人焦虑这一个作用。
 */
test("**日历铺满、带月份；饼图与日历都有悬停浮层**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  // ① 铺满：图的宽度贴着它所在那一块，**不是缩在左上角一小方块**
  const 尺寸 = await page.evaluate(() => {
    const svg = document.querySelector(".usage-heat") as SVGElement
    const 块 = svg.closest(".usage-block") as HTMLElement
    return { 图: svg.getBoundingClientRect().width, 块: 块.getBoundingClientRect().width }
  })
  expect(尺寸.图, `没铺满：${尺寸.图} / ${尺寸.块}`).toBeGreaterThan(尺寸.块 * 0.9)

  // ② 月份标出来了（一年 53 列，至少跨得过两个月）
  await expect(page.locator(".usage-month").first()).toBeVisible()
  expect(await page.locator(".usage-month").count()).toBeGreaterThanOrEqual(2)

  /**
   * ③ 悬停出浮层，且**是我们自己画的那一颗**。
   * 原生 `title` 有半秒延迟、没有样式，设计契约为此禁掉了按钮上的 `title=`。
   */
  await expect(page.locator(".usage-tip")).toHaveCount(0)
  await page.locator(".usage-cell").last().hover()
  await expect(page.locator(".usage-tip")).toBeVisible()
  await expect(page.locator(".usage-tip")).toContainText("Token")

  // ④ 饼图那一块也有：悬停出的是**具体那个模型的数**
  await page.locator(".usage-slice").first().hover()
  await expect(page.locator(".usage-tip")).toContainText("%")
  // **不带厂家**（作者：「不需要提供运营商，直接显示模型就可以了」）
  await expect(page.locator(".usage-legend-name").first()).not.toContainText("/")
})

/**
 * 活动洞察那一栏（形状学自作者给的截图）。
 *
 * **每一格都得是账本里数出来的。** 这条用例盯的就是这件事：
 * 跑一轮、调一次工具，那两个数就该动。
 */
test("**活动洞察数的是真事**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  const 取 = (名: string) =>
    page.locator(".usage-facts li").filter({ hasText: 名 }).locator(".usage-fact-value")
  await expect(取("对话总数")).not.toHaveText("0")
  await expect(取("回合总数")).not.toHaveText("0")
  // **平均每回合不是 0，也不是「—」**——两者都表示「还没跑过」
  await expect(取("平均每回合")).toContainText("token")
})
