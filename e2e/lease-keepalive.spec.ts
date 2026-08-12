/**
 * 写权租约不该把人挡在自己的对话外面（2026-08-11）。**跑真实构建产物。**
 *
 * 作者报的原话：
 *
 * > *「我一旦点击了新对话，那么我原来的对话就不能再输入任何信息了，
 * > 显示：写入被拒——user 未持有会话 … 的租约（当前持有者：无）。
 * > 当然这个情况也适用于非服务器登陆的情况。」*
 *
 * ## 根因不在远端，在一条一直都在的缝
 *
 * 租约有 TTL（默认 300 秒，规格 7.1：写权可追责）。而界面此前**只在
 * 建会话那一刻取一次**——切回一段旧对话、或者在同一段对话里待过五分钟，
 * 都会掉进「当前持有者：无」。
 *
 * **它是「点了没反应」的又一种形状**：能打字、能按发送，然后什么都不发生，
 * 屏幕最下面多一行小字。
 *
 * ## 为什么这份用例把 TTL 调成 1 秒
 *
 * 按默认值验一次要等五分钟。**那种测试没人会跑**，于是这条路等于没人看。
 * 调小的是同一套机制，不是另造一个假的。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.use({ dawnOptions: { leaseTtlSeconds: 1 } })

test("**租约过期之后，人照样能接着说**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await page.getByPlaceholder(/回车发送/).fill("第一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  // 等它过期（TTL = 1 秒）
  await page.waitForTimeout(2_500)

  await page.getByPlaceholder(/回车发送/).fill("过期之后的第二句")
  await page.getByRole("button", { name: "发送", exact: true }).click()

  /**
   * 第二句必须真的进去。**断言的是「话出现在对话里」**，
   * 不是「没有报错」——后者在一条静默失败的路径上同样成立。
   */
  await expect(page.locator(".turns").getByText("过期之后的第二句")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})

test("**开了新对话，回到旧的照样能说**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/回车发送/).fill("旧对话的第一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  // 开第二段（作者的原话就是「一旦点击了新对话」）
  await 开一段临时会话(page)
  await page.waitForTimeout(2_500)

  // 回到第一段
  await page.locator(".session-list .sess-item").last().locator(".row").first().click()
  // **在对话区里找**：同一句话也是侧栏那一行的标题，不限定范围会撞上
  await expect(page.locator(".turns").getByText("旧对话的第一句")).toBeVisible()

  await page.getByPlaceholder(/回车发送/).fill("回来之后还能说")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns").getByText("回来之后还能说")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})
