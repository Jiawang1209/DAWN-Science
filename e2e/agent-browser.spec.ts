/**
 * agent 浏览器旁观（2026-08-25，规格 `2026-08-25-agent浏览器旁观-design.md`）：
 * 坞「网页」格分「自己浏览」「agent 旁观」两个子页签。
 *
 * agent 那一面是**普通 DOM**——这一格里唯一 Playwright 看得见的东西，判据直接断言。
 * e2e 跑真后端，agent 浏览器没开，**空态就是真话**；真数据链路在
 * `tests/tools/browser-live.test.ts`（真开浏览器验 observe/frame）。
 */
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

test("网页格两个子页签；agent 旁观空态如实说；切回浏览面地址栏还在", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "网页")

  // 两个子页签都常驻可见（看不见的能力等于不存在——空态不藏页签）
  await expect(page.getByRole("tab", { name: "自己浏览" })).toBeVisible()
  const agent签 = page.getByRole("tab", { name: "agent 旁观" })
  await expect(agent签).toBeVisible()

  await agent签.click()
  await expect(page.getByText(/agent 还没用过浏览器/)).toBeVisible()
  // 「自己浏览」那半藏起来了：地址栏不可见
  await expect(page.getByRole("textbox", { name: "网址" })).toBeHidden()

  await page.getByRole("tab", { name: "自己浏览" }).click()
  await expect(page.getByRole("textbox", { name: "网址" })).toBeVisible()
})
