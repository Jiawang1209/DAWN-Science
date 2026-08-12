/**
 * 删除项目：**入口就在项目旁边**（2026-08-11）。**跑真实构建产物。**
 *
 * 作者：*「我不是新建项目了吗，新建项目之后，我其实可以设置，删除项目，
 * 如果删除项目的话，项目里面包含的之前的所有对话，则都删除掉了。」*
 *
 * ## 这个动作一直都在
 *
 * 它住在「项目概览」最下面那一节里——**又一次「看不见的能力等于不存在」**。
 * 今天之前作者已经为同一件事报过三次（没有标签的 `＋`、`opacity: 0` 的删除键、
 * 折叠里的说明）。所以这一条先验**够不够得着**，再验它做了什么。
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"
import { existsSync } from "node:fs"

test("**每一行项目上就有删除**，不用先翻到项目概览", async ({ dawn }) => {
  const { page } = dawn
  /**
   * **T3-a 起要先有一个带路径的任务**：项目那一栏是从任务的路径长出来的，
   * 没有任务就没有那一行。这不是绕路——**它就是新模型里「有一个项目」的意思**。
   */
  await 在项目里开会话(page)
  const 删 = page.getByRole("button", { name: /删除项目：/ })
  await expect(删).toBeVisible()
  // `toBeVisible` 对 `opacity: 0` 仍然算可见——**必须直接量**（2026-08-10 的教训）
  expect(await 删.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
})

test("**确认框摆真数字**，并说清哪些东西不会动", async ({ dawn }) => {
  const { page } = dawn
  // 先说一句话，好让这个项目里有一段对话可数
  await 在项目里开会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await page.getByPlaceholder(/回车发送/).fill("留个记录")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("留个记录")

  await page.getByRole("button", { name: /删除项目：/ }).click()
  const 确认 = page.locator(".confirm")
  await expect(确认).toBeVisible()
  // 会话数是**问后端要的真数字**，不是界面猜的
  await expect(确认).toContainText("1 个会话")
  // **不会动什么**：磁盘上的文件夹不删——这句要在按下之前就在屏幕上
  await expect(page.locator(".confirm-safety")).toContainText("文件夹")
})

test("删掉之后，它的会话**一条都不剩**；工作区的文件一个都没少", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await page.getByPlaceholder(/回车发送/).fill("要一起被删掉的")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".proj-session-list .sess")).toHaveCount(1)

  await page.getByRole("button", { name: /删除项目：/ }).click()
  await page.locator(".confirm").getByRole("button", { name: /移除项目|删除项目/ }).click()

  /**
   * 项目没了，它的会话也没了。
   *
   * **查计数，不查文本**（2026-08-12 改）：T3-a 之后项目那一整块是
   * **从任务的路径长出来的**，一条都没有时整块不渲染。
   * 对一个不存在的元素断言 `not.toContainText` 会等到超时——
   * 而它拿到的其实是**比要求更强的结果**。
   */
  await expect(page.locator(".proj-session-list .sess")).toHaveCount(0)
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(0)

  // **磁盘上的文件夹一个字节都没动**——那句承诺要真的成立
  expect(existsSync(workspace)).toBe(true)
})
