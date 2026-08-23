/**
 * 主题色（2026-08-23 作者要的）：外观里一键换色，整屏跟着变；「活着」跟着它，「对错」不跟；重载还在。
 */
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"

const 读令牌 = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test("**选一颗预置色，强调色与「活着」跟着变，「成功」仍是绿；重载还在**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")

  const 原 = await 读令牌(page, "--dawn-accent")
  const 成功 = await 读令牌(page, "--dawn-success")
  // 默认那颗标着选中
  await expect(page.getByRole("radio", { name: "绿" })).toHaveAttribute("aria-checked", "true")

  await page.getByRole("radio", { name: "蓝" }).click()
  await expect(page.getByRole("radio", { name: "蓝" })).toHaveAttribute("aria-checked", "true")
  expect(await 读令牌(page, "--dawn-accent")).not.toBe(原)
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#2f6feb")
  // 活着跟主题色；对错不跟
  expect(await 读令牌(page, "--dawn-live")).toBe(await 读令牌(page, "--dawn-accent"))
  expect(await 读令牌(page, "--dawn-success")).toBe(成功)
  // 主按钮真的跟着变（不只是变量变了）：选中的「中文」那颗是蓝底
  const 键色 = (el: import("@playwright/test").Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor)
  const 蓝底 = await 键色(page.getByRole("radio", { name: "中文" }))
  await page.getByRole("radio", { name: "绿" }).click()
  expect(await 键色(page.getByRole("radio", { name: "中文" }))).not.toBe(蓝底)
  await page.getByRole("radio", { name: "蓝" }).click()

  await page.reload()
  await expect(page.getByRole("button", { name: "设置", exact: true })).toBeVisible()
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#2f6feb")
})

test("**自定义取色器**：给一个浅色，按钮上的字自动换成深色", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  const 取色 = page.getByLabel("自定义强调色")
  await 取色.fill("#ffd240")
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#ffd240")
  expect(await 读令牌(page, "--dawn-on-accent")).toBe("#0d0d0d")
  // 预置里没有它，「自定义」那颗标为当前
  await expect(page.locator(".accent-custom")).toHaveClass(/current/)
})

test("**颜色值只有一格**：点它复制，Shift 在 HEX / RGB 间切换", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "蓝" }).click()
  const 格 = page.locator(".accent-value")
  await expect(格.locator("code")).toHaveText("#2f6feb")
  // 两个输入框撤了（2026-08-24 作者按回）
  await expect(page.getByLabel("HEX 颜色值")).toHaveCount(0)
  await expect(page.getByLabel("RGB 颜色值")).toHaveCount(0)
  await 格.hover()
  await page.keyboard.press("Shift")
  await expect(格.locator("code")).toHaveText("rgb(47, 111, 235)")
  await 格.click()
  await expect(格.locator(".accent-copied")).toHaveText("已复制")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("rgb(47, 111, 235)")
  // 键盘：C 复制、Shift 切回
  await 格.focus()
  await page.keyboard.press("Shift")
  await expect(格.locator("code")).toHaveText("#2f6feb")
  await page.keyboard.press("c")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("#2f6feb")
})
