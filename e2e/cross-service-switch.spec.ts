/**
 * **同一段对话里换另一家**（2026-08-11）。**跑真实构建产物。**
 *
 * 作者：*「同一个对话，比如 DeepSeek 的对话，我切换到 Kimi 的时候，
 * 直接就重新新建对话了。这不是我所期待的。一个对话之间，可以切换不同的 API。」*
 *
 * ## 他点的是哪颗，为什么会那样
 *
 * 他点的是 **agent pill**——那颗的语义一直是「新建会话，用：」。
 * 而**在同一段里换一家**运行时早就支持（`setSessionModel` 收 provider + model），
 * **只是模型选择器里只列当前 provider 的模型**，于是「换到 Kimi」
 * 在那颗里根本无从点起，人只能去点旁边那颗会新建会话的。
 *
 * 所以这条用例验的是三件事，缺一件这个功能就不成立：
 *   1. 模型菜单里**列得出别家**
 *   2. 换完**还是同一段对话**（会话数不变、之前说过的话还在）
 *   3. **下一次请求真的打到新模型**——界面说换了不算
 */
import { test, expect, CANNED_REPLY } from "./fixtures.js"

const 本来的 = "deepseek-v4-flash"
const 另一家的 = "other-9b"

const modelsUsed = (requests: { body?: { model?: string } }[]) =>
  requests.map((r) => r.body?.model).filter(Boolean)

test("**换到另一家，对话不断**", async ({ dawn }) => {
  const { page, mockUrl, requests } = dawn

  // 先加一家：地址指向同一个假服务器，但**模型 id 是它独有的**——
  // 这样「请求用了哪个模型」就能唯一指认是哪一家在答
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("other")
  await page.getByLabel("新服务的端点地址").fill(mockUrl)
  await page.getByLabel("新服务的模型清单").fill(另一家的)
  await page.getByLabel("新服务的 API key").fill("local")
  await page.getByRole("button", { name: "添加" }).click()
  await expect(page.locator(".svc").filter({ hasText: "other" })).toHaveCount(1)
  await page.getByRole("button", { name: "返回" }).click()

  // 开一段 DeepSeek 的对话，先说一句
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await page.getByPlaceholder(/回车发送/).fill("第一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })
  expect(modelsUsed(requests as never)).toEqual([本来的])

  const 会话数 = await page.locator(".session-list > li").count()

  // **在同一段里换到另一家**
  const pill = page.locator(".composer .model-pill")
  await pill.getByRole("button").click()
  await expect(page.getByRole("menu", { name: "切换模型" })).toContainText("不会新建对话")
  await page.getByRole("menuitem", { name: new RegExp(另一家的) }).click()
  await expect(pill).toContainText(另一家的)

  // ① 还是同一段：会话没多，前面说过的话还在
  expect(await page.locator(".session-list > li").count()).toBe(会话数)
  await expect(page.locator(".turns")).toContainText("第一句")
  // ② 记录里留了一条，往回翻的人知道是从哪里开始换的家
  await expect(page.locator(".turns")).toContainText("已换到")

  await page.getByPlaceholder(/回车发送/).fill("第二句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns").getByText(CANNED_REPLY).nth(1)).toBeVisible({
    timeout: 60_000,
  })

  // ③ **这一行才是验收**：下一次请求真的打到另一家的模型上
  expect(modelsUsed(requests as never)).toEqual([本来的, 另一家的])
})

test("菜单里按服务分组，列得出别家", async ({ dawn }) => {
  const { page, mockUrl } = dawn

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("other")
  await page.getByLabel("新服务的端点地址").fill(mockUrl)
  await page.getByLabel("新服务的模型清单").fill(另一家的)
  await page.getByLabel("新服务的 API key").fill("local")
  await page.getByRole("button", { name: "添加" }).click()
  await page.getByRole("button", { name: "返回" }).click()

  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await page.locator(".composer .model-pill").getByRole("button").click()

  const 菜单 = page.getByRole("menu", { name: "切换模型" })
  // 两家都在，各自成一组
  await expect(菜单.locator(".model-group")).toHaveCount(2)
  await expect(菜单).toContainText(本来的)
  await expect(菜单).toContainText(另一家的)
})
