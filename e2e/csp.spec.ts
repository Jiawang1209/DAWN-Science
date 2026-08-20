/**
 * 内容安全策略（2026-08-10）。**跑真实构建产物。**
 *
 * ## 为什么需要一份专门盯它的用例
 *
 * CSP 的失败方式是**沉默**：被拦掉的东西不会报错给用户，它只是**不出现**。
 * 一张图变成空框、一个字体退回系统默认、一个 PDF 变成一片白——
 * 而其余 90 多条 e2e 照样全绿，因为它们断言的是别的东西。
 *
 * 所以这里不断言「界面能用」（那已经有人管了），而是断言**没有任何东西被拦下**。
 *
 * ## 它同时是 CSP 本身的回归测试
 *
 * 策略是写死在构建里的一行字符串。哪天有人为了让某个东西能用而加一条
 * `'unsafe-inline'`，这份用例不会红——所以下面**另有一条直接检查策略文本**，
 * 让「把墙拆掉」这件事至少要经过一次显式的修改。
 */
import { test, expect, 进坞 } from "./fixtures.js"

/** 收集违规。Chromium 的 CSP 报错走 console，措辞里必有这一串 */
function 收违规(page: import("@playwright/test").Page): string[] {
  const hits: string[] = []
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) hits.push(m.text())
  })
  return hits
}

test("四个屏走一遍，**一条 CSP 违规都没有**", async ({ dawn }) => {
  const { page } = dawn
  const 违规 = 收违规(page)

  await expect(page.locator(".app-shell")).toBeVisible()

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("radiogroup", { name: "主题" })).toBeVisible()

  await page.getByRole("button", { name: "返回" }).click()
  // 概览住在坞里了（2026-08-20）
  await 进坞(page, "概览")
  // 没选会话时概览是一句指路的话（2026-08-20 收窄成会话作用域）
  await expect(page.getByText(/还没有选中会话/)).toBeVisible()

  await 进坞(page, "文件")
  await expect(page.locator(".files-view")).toBeVisible()

  expect(违规, `被 CSP 拦下的东西：\n${违规.join("\n")}`).toEqual([])
})

test("**策略本身还在，而且没有被开成 `unsafe-inline` 脚本**", async ({ dawn }) => {
  const { page } = dawn
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")

  expect(csp, "构建产物里没有 CSP —— 它此前就整整缺席过一次").toBeTruthy()
  // 样式的 `'unsafe-inline'` 是**有意留的**（界面里的 style 属性承载的是数据）
  expect(csp).toContain("style-src 'self' 'unsafe-inline'")
  // **脚本这一档不许开。** 那是这条策略最值钱的一半
  expect(csp).toContain("script-src 'self'")
  expect(/script-src[^;]*unsafe-inline/.test(csp!)).toBe(false)
  expect(/script-src[^;]*unsafe-eval/.test(csp!)).toBe(false)
})
