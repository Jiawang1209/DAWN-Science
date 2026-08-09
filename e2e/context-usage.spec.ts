/**
 * 上下文用量（①-B″ · U3）。**跑真实构建产物。**
 *
 * 这条守的是「已用 token」那一半真的接通了。
 * 假后端报 `prompt_tokens: 12`——**面板上必须出现这个数**，
 * 而不是停在「尚未采集」。
 */
import { test, expect } from "./fixtures.js"

test("说过一句话之后，上下文面板给出真实的 token 数", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await page.getByRole("button", { name: /新建会话/ }).click()
  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/)).toBeVisible()

  await page.getByRole("button", { name: "项目概览" }).click()
  /**
   * **按标题定位，不按「面板里含这三个字」。**
   *
   * `hasText: "上下文"` 是整块文本的子串匹配——2026-08-09 成本栏接线之后，
   * native 的成本原因里写着「token 用量见上下文栏」，
   * 于是这个定位器一下子匹配到两个面板，strict 模式直接报错。
   * **定位器松，就迟早会被别处的一句话撞上。**
   */
  const panel = page.locator(".panel", { has: page.getByText("上下文", { exact: true }) })
  // 假后端报的是 prompt_tokens: 12
  await expect(panel).toContainText("12")
  await expect(panel).toContainText("tokens")
})

test("**下表明写「按字节」** —— 不写清楚，人会把它当成 token 分解", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await page.getByRole("button", { name: /新建会话/ }).click()
  await page.getByRole("button", { name: "项目概览" }).click()
  await expect(page.locator(".panel", { hasText: "上下文" })).toContainText("按字节，不是 token")
})
