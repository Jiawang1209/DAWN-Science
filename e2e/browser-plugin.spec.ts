/**
 * 浏览器插件（2026-08-25，学自 dsh-reef；规格 specs/2026-08-25-浏览器插件-design.md）：
 * ① 插件屏第二张卡（四族 15 工具、开关持久）；
 * ② 假模型点名调 browser_status——**不启动浏览器也能证明工具装上了**（status 对没开的浏览器如实说没开）。
 */
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"

test("**浏览器卡**：四族 15 工具；关「操作」族要持久", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "插件")
  const 卡 = page.locator(".plugin-card").nth(1)
  await expect(卡).toContainText("浏览器")
  await expect(卡).toContainText("15 个工具")
  for (const 名 of ["浏览", "读页", "操作", "产物"]) await expect(卡).toContainText(名)
  await expect(卡).toContainText("browser_snapshot")
  await expect(卡).toContainText("browser_elements")
  await page.getByRole("checkbox", { name: "启用 操作 工具" }).uncheck()
  await page.getByRole("button", { name: "返回" }).click()
  await 进设置(page, "插件")
  await expect(page.getByRole("checkbox", { name: "启用 操作 工具" })).not.toBeChecked()
})

test.describe("模型真的拿到了浏览器工具", () => {
  test.use({
    dawnOptions: {
      toolCall: { toolName: "browser_status", args: {}, say: "我看看浏览器。" },
    },
  })
  test("**假模型点名调 browser_status**，回执如实说「没开」", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("看下浏览器状态")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    // 工具真跑了：对话里有它的工具卡且标着成功（回执正文默认折叠，不去扒）
    await expect(page.locator(".turns")).toContainText("browser_status")
    await expect(page.locator(".turns")).toContainText("成功")
  })
})
