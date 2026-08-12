/**
 * 新建任务（T2/T3）。**跑真实构建产物。**
 *
 * 作者：*「我也要 workbuddy 的新建任务……如果在任务里面不设置任何工作目录的话，
 * 那么其实就是我们的普通对话。」*
 *
 * 所以这条盯的是**那句话本身**：点一下，不问路径，直接能聊。
 */
import { test, expect } from "./fixtures.js"

test("**点「新建任务」就能聊** —— 不问工作路径", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "新建任务" }).click()

  // 建完就进对话——**不该让人再点一次才进得去**
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })

  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("假模型已应答", { timeout: 30_000 })
  // 写权那条路也要通——它此前在四个地方各写了一遍，漏一个就是「点了没反应」
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})

test("**任务出现在侧栏，且不显示那个用户没选过的目录**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建任务" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })

  const 行 = page.locator(".task-row")
  await expect(行).toHaveCount(1)
  await expect(page.getByText(/^任务/)).toBeVisible()

  /**
   * **没设路径 = 普通对话，那一格什么都不写。**
   *
   * 服务端确实给了它一个目录（agent 要能读写），但那是实现细节——
   * 摆出来只会让人看见一个自己从没选过的路径，
   * 而那正是此前「临时会话」让人困惑的地方。
   */
  await expect(行.locator(".task-ws")).toHaveCount(0)
})
