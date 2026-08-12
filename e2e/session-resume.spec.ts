/**
 * 接着上一次聊（会话续接，2026-08-11）。**跑真实构建产物，真关掉再打开。**
 *
 * 作者：*「之前聊过的，也无法连续上。」*
 *
 * ## 这条只有重启一次才验得了
 *
 * 在同一个进程里点来点去，永远碰不到那一刻：**agent 进程没了，
 * 而你看到的那些消息只活在内存里**。所以这份用例真的把应用关掉再打开——
 * 那正是作者做的事。
 *
 * 两件事分开验，因为它们会各自坏：
 *   1. **历史回来了**（从 pi 的记录里重建）
 *   2. **还能接着说**（在原来的上下文上续一个 agent）
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**关掉再打开，那段对话还在，而且还能说**", async ({ dawn }) => {
  await 开一段临时会话(dawn.page)
  await dawn.page.getByPlaceholder(/回车发送/).fill("重启之前说的话")
  await dawn.page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(dawn.page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  // 真的关掉，再打开
  const page = await dawn.重开()

  // 侧栏上那段对话还在（标题由第一句话定的）
  const 那一条 = page.locator(".session-list .sess-item").first()
  await expect(那一条).toBeVisible({ timeout: 30_000 })
  await 那一条.locator(".row").first().click()

  /**
   * **历史必须真的回来**。
   *
   * 断言的是「话出现在对话区里」——不是「没报错」：
   * 一片空白的对话同样不会报错，而那正是修复前的样子。
   */
  await expect(page.locator(".turns")).toContainText("重启之前说的话", { timeout: 30_000 })
  await expect(page.locator(".turns")).toContainText("假模型已应答")

  /**
   * **还能接着说。** 这一句才是「续接」与「只是把历史画出来」的分界：
   * 后者看起来一模一样，直到你开口。
   */
  await page.getByPlaceholder(/回车发送/).fill("重启之后的新话")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("重启之后的新话", { timeout: 30_000 })
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})
