/**
 * 模型调用失败要出声（2026-08-10）。**跑真实构建产物。**
 *
 * ## 它修的是一次静默
 *
 * 作者拿一个随手写的假 key 试用时会撞上的正是这条路。此前的表现是：
 * **你自己那句话孤零零挂着，没有回复，也没有任何报错**——
 * 分不清是「还在想」「坏了」还是「key 不对」。
 *
 * 根因是 pi 的事件流里**没有 error 这一类**：一次 401 走完的是
 * `message_start / message_end / turn_end / agent_end`，全都是「正常」事件。
 * 而 `prompt()` 的 `catch` 从来没被触发过——**pi 不 reject**，
 * 它把失败写进 `message_end` 的 `stopReason: "error"` / `errorMessage` 就走了。
 * 我们从来没读过那两个字段。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("key 不对的时候", () => {
  test.use({ dawnOptions: { failStatus: 401 } })

  test("**说出来，并且把对方的原话带上**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
    await page.getByPlaceholder(/今天帮你做些什么/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 说明 = page.locator(".turns .caveat")
    await expect(说明).toContainText("模型调用失败", { timeout: 30_000 })
    // **带上对方的原话**：只说「失败了」，人无从判断是 key 错了还是额度没了
    await expect(说明).toContainText("401")
    await expect(说明).toContainText("这个 key 不对")
  })

  test("**它不混进回复里** —— 那不是模型说的话", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
    await page.getByPlaceholder(/今天帮你做些什么/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    await expect(page.locator(".turns .caveat")).toContainText("模型调用失败", { timeout: 30_000 })
    // agent 的气泡里不该有这段话
    await expect(page.locator(".turn.agent .bubble")).toHaveCount(0)
  })
})
