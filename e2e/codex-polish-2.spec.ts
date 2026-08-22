/**
 * codex-polish 第二档（2026-08-22，学自 dsh-codex-ui）：
 * ⑥ 侧栏「最近」段——会话分散在两个以上收纳时才出现，跨收纳按上次活动取前 5 条，默认收起；
 * ⑦ 输入卡上的权限档——原生会话的「会话设置」菜单里有「权限」，选「拦下危险操作」之后这段的危险命令真的被拒；
 * ⑧ 推理强度——只在模型支持时才有那一条（假模型不支持，所以这里验的是**不摆一个没用的开关**）。
 */
import { test, expect, 开一段临时会话, 在项目里开会话 } from "./fixtures.js"

test("**⑥「最近」**：只有一个收纳时不出现；两个收纳时出现、默认收起、展开后是按时间的前几条", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "散的一段")
  await expect(page.getByRole("button", { name: /^最近/ })).toHaveCount(0)

  await 在项目里开会话(page)
  const 入口 = page.getByRole("button", { name: /^最近/ })
  await expect(入口).toBeVisible()
  await expect(入口).toHaveAttribute("aria-expanded", "false")
  // 收起时不渲染行——否则同一段会话在两处长得一样
  await expect(page.locator(".recent-list")).toHaveCount(0)
  await 入口.click()
  await expect(page.locator(".recent-list .sess-item")).toHaveCount(2)
  // 最上面是刚活动过的那段（项目里的）
  await expect(page.locator(".recent-list .sess-item").first()).not.toContainText("散的一段")
})

test.describe("⑦ 输入卡上的权限档", () => {
  test.use({
    dawnOptions: {
      // 假模型每轮都要跑一条联网命令——在「拦下危险操作」这一档它该被拒
      toolCall: { toolName: "bash", args: { command: "curl https://example.com" }, perTurn: true, say: "我去拉一下。" },
    },
  })

  test("**菜单里选「拦下危险操作」，只对这一段生效**：危险命令被拒；设置里仍是全放行", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    const 扳机 = page.locator(".sess-config-trigger")
    await expect(扳机).toHaveText(/^全放行/)
    await 扳机.click()
    await page.getByRole("menuitemradio", { name: /^拦下危险操作/ }).click()
    await expect(扳机).toContainText("拦下危险操作")

    await page.getByPlaceholder(/今天帮你做些什么/).fill("去拉一下")
    await page.keyboard.press("Enter")
    await expect(page.getByText("我去拉一下。").last()).toBeVisible({ timeout: 30_000 })
    // 工具行是失败的，理由里说的是「联网」
    const 工具 = page.locator(".tool").last()
    await expect(工具).toHaveAttribute("data-status", "error", { timeout: 30_000 })
    await 工具.click()
    await expect(工具).toContainText(/拒绝执行.*访问网络/)

    // 全局设置没被动过
    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.getByRole("button", { name: "工具权限" }).click()
    await expect(page.locator(".perm-choice", { hasText: "全放行" }).locator("input")).toBeChecked()
  })
})

test("**⑧ 模型不支持推理强度时，菜单里没有那一条**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.locator(".sess-config-trigger").click()
  const 菜单 = page.getByRole("menu", { name: "会话设置" })
  await expect(菜单).toBeVisible()
  await expect(菜单).toContainText("权限")
  await expect(菜单).not.toContainText("推理强度")
})

/**
 * **先有一段别的会话，再点开一段新的：会话设置那颗第一次就得在**（2026-08-22 抓的）。
 * 根因在 `loadRunDetail` 借用了 `guard()` 的全局世代：切会话时一条 Run 详情在飞，
 * 整份快照就被判成过时丢掉。症状正是「第一次点开没有、切走再回来就有」。
 */
test("**切到另一段会话时，会话设置那颗第一次就在**——快照不被别的请求作废", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先有的那段")
  await 在项目里开会话(page)
  await page.locator(".proj-session-list .sess-item .row").first().click()
  await expect(page.locator(".sess-config-trigger")).toHaveCount(1)
})
