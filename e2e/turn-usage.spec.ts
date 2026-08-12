/**
 * 回合上的 token 用量与思考记号（2026-08-10）。**跑真实构建产物。**
 *
 * 作者两条：*「回复的时候应该增加一个类似 hermes 的思考的动图」*、
 * *「我们现在每次消耗的 token，其实也应该展示出来」*。
 *
 * ## 为什么必须在真链路上验
 *
 * 那两个数字要从假模型的响应穿过 pi、运行时、transcript、协议才到 DOM。
 * 单元测试里我可以喂它任何数字然后断言渲染——那证明的是渲染，
 * 不是「模型报的用量真的走到了屏幕上」。
 *
 * **而且这条路上真的踩过一次**：协议里 `usage` 是 `.strict()` 的，
 * 原样转发 pi 那个多字段的对象会让中枢 `parse` 抛出，
 * 异常顺着 emit 窜回 pi 的事件循环，把后面的文本增量全掐掉——
 * 症状是「回复再也不出现」，与用量看起来毫无关系。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**这一句花了多少 token 显示在回合下面**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await box.fill("请说一句话")
  await box.press("Enter")

  const usage = page.locator(".turn.agent .turn-usage").last()
  await expect(usage).toBeVisible({ timeout: 30_000 })
  // 假后端报的是 prompt 12 / completion 8——**必须是真的那两个数**
  await expect(usage).toContainText("输入 12")
  await expect(usage).toContainText("输出 8")
})

test("**回复到了，思考记号不能还在转**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await box.fill("请说一句话")
  await box.press("Enter")

  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  // **一个永远在转的记号比没有更糟**
  await expect(page.locator(".thinking")).toHaveCount(0)
})
