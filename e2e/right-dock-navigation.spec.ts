import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

test("常用面板、更多菜单与关闭重开保留当前面板", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  for (const label of ["文件", "产物", "笔记本"]) await expect(page.getByRole("tab", { name: label, exact: true })).toBeVisible()
  for (const label of ["审阅", "概览", "网页", "子 agent", "团队", "对话"]) {
    await 进坞(page, label)
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true")
  }
  await page.getByRole("button", { name: "更多面板", exact: true }).click()
  await page.getByRole("menu").press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await page.getByRole("button", { name: "关闭面板", exact: true }).click()
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await page.getByRole("button", { name: /^面板/ }).click()
  await expect(page.getByRole("tab", { name: "对话", exact: true })).toHaveAttribute("aria-selected", "true")
})
