/**
 * 侧栏各状态都有诚实的文案与自己的出路。
 *
 * 「不知道下一步该点哪里」是本项目被打回三次的那个问题。
 * 一个状态如果只说「没有 X」而不指向能解决它的地方，就是一条死路。
 */
import { test, expect } from "./fixtures.js"

test("没有会话时如实说明，且新建入口就在旁边", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByText("还没有会话")).toBeVisible()
  // 出路：新建按钮可点
  await expect(page.getByRole("button", { name: /新建会话/ })).toBeEnabled()
})

test("空对话区给的是**按钮**，不是一句提示", async ({ dawn }) => {
  const { page } = dawn
  // 主区必须有一个真的能点的开始动作
  const start = page.getByRole("button", { name: /开始/ })
  await expect(start).toBeVisible()
  await start.click()
  // 点了要真的进对话
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
})

test("项目概览是侧栏底部入口，不是首页", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "项目概览" }).click()
  await expect(page.locator(".panels")).toBeVisible()
  // 能回得来——单向门不是出路
  await page.getByRole("button", { name: /新建会话/ }).click()
  await expect(page.locator(".agent-pick")).toBeVisible()
})

test("设置可达且可返回", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("button", { name: "返回" })).toBeVisible()
  await page.getByRole("button", { name: "返回" }).click()
  await expect(page.locator(".conversation")).toBeVisible()
})

test("会话建好后出现在侧栏列表里", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: /新建会话/ }).click()
  await page.getByRole("button", { name: "ds-chat", exact: true }).click()
  // 列表里应当出现这个会话，且带状态
  await expect(page.locator(".session-list .row")).toHaveCount(1)
  await expect(page.locator(".session-list .state")).toBeVisible()
})
