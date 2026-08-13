/**
 * 按科研目录结构初始化，在真实产物上按得动（2026-08-14）。
 *
 * 后端那几条验的是「建对了没有」，**这条验的是「人够不够得着」**——
 * 按本项目的规矩，看不见的能力等于不存在。
 *
 * 它顺带盯着一件容易被做丢的事：**做完要出声**。
 * 建目录这件事在界面上没有任何视觉反馈（树是折叠的），
 * 按下去不说话就跟坏了一模一样。
 */
import { readdirSync } from "node:fs"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("文件那一屏能按下去，目录真的建出来，且它说了自己做了什么", async ({ dawn }) => {
  const { page, workspace } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)

  await page.getByRole("button", { name: "文件" }).click()
  const 按钮 = page.getByRole("button", { name: "按科研目录结构初始化" })
  await expect(按钮, "文件这一屏上够不着这个动作").toBeVisible()
  await 按钮.click()

  /**
   * **做完要出声。** 建目录在界面上没有视觉反馈（树是折叠的），
   * 按下去不说话就跟坏了一样——2026-08-10 那两次「作者说没有这个功能、
   * 而代码是好的」都是这个形状。
   */
  await expect(page.locator(".tree-actions .caveat")).toContainText(/目录/)

  // **真的建在磁盘上了**，不是界面上说了一句
  const 有的 = readdirSync(workspace)
  expect(有的, `工作区里没有 figures：${有的.join(",")}`).toContain("figures")
  expect(有的).toContain("results")
  expect(有的).toContain("data")
  expect(有的, "约定没写进去，模型就不知道有这回事").toContain("AGENTS.md")
})
