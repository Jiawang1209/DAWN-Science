/**
 * 系统提示词里那句「你现在跑在哪个模型上」（2026-08-12）。**看真送出去的请求。**
 *
 * 作者连着三轮问「你的模型是什么」都答错，最后一次更糟——
 * 我关掉 `PI_*` 之后它失去唯一的事实依据，**开始编**：
 * *「我是 pi，基于 Anthropic 的 Claude 模型运行的编程智能体」*，一个字都不真。
 *
 * **拿掉一份事实，就必须补上一份。** 这条盯的就是那份补上的事实：
 * 它在，而且**换模型之后跟着变**。
 *
 * 断言的是**假服务器收到的请求体**——不是问模型。
 * 模型会照着上下文念，而请求体是事实。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**提示词里写着当前模型**", async ({ dawn }) => {
  const { page, requests } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你的模型是什么？")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  // **反空转**：先确认真有请求发出去了
  expect(requests.length).toBeGreaterThan(0)
  const 第一次 = JSON.stringify(requests)
  expect(第一次).toContain("You are currently running on the model")
  // 夹具那家的模型 id
  expect(第一次).toContain("deepseek-v4-flash")

  /**
   * **「换模型之后跟着变」这一半在这儿验不了。**
   *
   * 夹具只有一个模型，换过去还是它自己——断言什么都证明不了。
   * 那一半的接线在 `setModel` 里（`设当前模型`），
   * **只有作者用两家真 key 才验得到**。这里不假装验过。
   */
})
