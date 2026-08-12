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
import { test, expect, CANNED_REPLY, 开一段临时会话, 等进了对话 } from "./fixtures.js"

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
  await page.getByRole("button", { name: "加进来" }).click()
  await expect(page.locator(".svc").filter({ hasText: "other" })).toHaveCount(1)
  await page.getByRole("button", { name: "返回" }).click()

  // 开一段 DeepSeek 的对话，先说一句
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/回车发送/).fill("第一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })
  expect(modelsUsed(requests as never)).toEqual([本来的])

  const 会话数 = await page.locator(".session-list > li").count()

  /**
   * **在同一段里换到另一家**（2026-08-12 换了入口）。
   *
   * 2026-08-11 起换家走「厂家那颗 pill」，模型那颗只列当前这一家。
   * 现在两颗**并成了一颗**（作者要求，实测 WorkBuddy 就是一颗）——
   * 清单里列的是「所有配好的服务 × 各自的模型」，**按服务分组**，
   * 点另一组里的一条就是「换服务 + 换模型」。
   *
   * **这条用例的验收一个字没动**：下一次请求真的打到另一家的模型上。
   * 换的只是「从哪儿点过去」。
   */
  await page.locator(".model-pill .model-trigger").click()
  const 模型菜单 = page.getByRole("menu", { name: "切换模型" })
  await expect(模型菜单.locator(".model-group-head").filter({ hasText: "other" })).toBeVisible()
  await 模型菜单.getByRole("menuitem", { name: new RegExp(另一家的) }).click()

  // 换完，那颗 pill 自己就对上了
  await expect(page.locator(".composer .model-pill")).toContainText(另一家的)

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

test("**一颗 pill 里两家都在**，厂家写在组头上", async ({ dawn }) => {
  const { page, mockUrl } = dawn

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("other")
  await page.getByLabel("新服务的端点地址").fill(mockUrl)
  await page.getByLabel("新服务的模型清单").fill(另一家的)
  await page.getByLabel("新服务的 API key").fill("local")
  await page.getByRole("button", { name: "加进来" }).click()
  await page.getByRole("button", { name: "返回" }).click()

  await 开一段临时会话(page)
  await 等进了对话(page)
  /**
   * **一颗 pill 里两家都在**（2026-08-12 换的主语）。
   *
   * 上一版这里查的是「厂家那颗菜单里两家都列得出，而模型那颗只管这一家」。
   * 两颗并成一颗之后，**分组标题就是「哪家」**：两家各领一组。
   */
  await page.locator(".model-pill .model-trigger").click()
  const 模型菜单 = page.getByRole("menu", { name: "切换模型" })
  const 组头 = 模型菜单.locator(".model-group-head")
  await expect(组头.filter({ hasText: /DeepSeek/ })).toBeVisible()
  await expect(组头.filter({ hasText: "other" })).toBeVisible()
  await page.keyboard.press("Escape")

  /**
   * **两家的模型都在同一个列表里**（2026-08-12 反转）。
   *
   * 上一版这里断言「模型菜单里没有另一家的」——那时厂家由旁边那颗选，
   * 这颗只回答「这一家里用哪个」。**旁边那颗已经没有了**，
   * 再收窄就等于换服务从 composer 上消失。
   *
   * 现在按服务分组：`DeepSeek` 一组、`other` 一组，各自列各自的模型。
   * 「不用重复写厂家」那条意图仍然守着——**厂家写在组头上，不写在每一行里**。
   */
  await expect(模型菜单).toContainText(本来的)
  await expect(模型菜单).toContainText(另一家的)
  // 行里只有模型名，厂家在组头上：`other-9b` 那一行不该再写一遍「other」
  const 行文本 = await 模型菜单
    .getByRole("menuitem", { name: new RegExp(另一家的) })
    .textContent()
  expect(行文本?.replace(另一家的, "")).not.toContain("other")
})
