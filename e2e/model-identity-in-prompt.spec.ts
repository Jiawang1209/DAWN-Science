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
  expect(第一次).toContain("deepseek-flash")

})

/**
 * **换模型之后，下一次请求里写的是新名字**（2026-09-28 作者撞的）。
 *
 * 作者：deepseek-flash 下问「你是什么模型」答 flash；同一段里换到 deepseek-v4-pro 再问，还答 flash。
 * 会话记录里第二条回复的 `model` 是 v4-pro——**路由换了，是它被告知的身份没换**，两处都是：
 *   - 系统提示词那句「You are currently running on the model …（this line is always current）」
 *     pi 只在 `resourceLoader.reload()` 时算一次；我们改了闭包里的变量，没人再去读它；
 *   - 换模型那条 `dawn-model-change` 走的是 `sessionManager.appendCustomMessageEntry`——**只进文件、不进内存**，
 *     模型要到重开 / 压缩之后才看得到。
 *
 * 这一半此前的注释写着「夹具只有一个模型，验不了」——早已不对（夹具挂着 flash 与 v4-deep 两个），于是它一直没人验。
 */
test("**换模型之后，下一次请求里写的是新模型，并带着「换人了」那一句**", async ({ dawn }) => {
  const { page, requests } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你是什么模型？")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  await page.locator(".composer .model-pill").getByRole("button").click()
  await page.getByRole("menuitem", { name: /deepseek-v4-deep/ }).click()
  await expect(page.locator(".composer .model-pill")).toContainText("deepseek-v4-deep")

  const 之前 = requests.length
  await page.getByPlaceholder(/今天帮你做些什么/).fill("现在是什么模型？")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).nth(1)).toBeVisible({ timeout: 30_000 })
  expect(requests.length).toBeGreaterThan(之前)

  const 第二次 = JSON.stringify(requests.slice(之前))
  expect(第二次, "请求没打到新模型").toContain('"model":"deepseek-v4-deep"')
  expect(第二次, "系统提示词里仍是旧模型名").toContain('currently running on the model \\"deepseek-v4-deep')
  expect(第二次, "「换人了」那一句没进模型的上下文").toContain('You are now \\"deepseek-v4-deep\\"')
  // 那一句是给模型读的（`display: false`），界面上不出现
  await expect(page.getByText(/You are now/)).toHaveCount(0)

  // 旧名字那句不再出现：pi 0.86 把系统消息合成一份请求头，只留当下那份
  expect(第二次, "旧模型那句还留在请求里").not.toContain('currently running on the model \\"deepseek-flash')
})
