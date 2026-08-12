/**
 * 空态的开场建议卡片：**点下去要真的发生事情**。
 *
 * ## 这条测试存在，是因为「建议卡片」最容易变成装饰
 *
 * 那四张卡片可以做得很好看，然后点下去什么都不发生，或者只是开了一个空会话
 * ——**而它看起来是好的**。那种坏法最难被发现，因为截图里它完全正常。
 *
 * 空态没有输入框，所以「把文字填进 composer」这条常见做法在这里不存在：
 * 它必须真的建会话、真的把那句话发出去。这条测试盯的就是那一整条链路。
 */
import { test, expect, CANNED_REPLY, readRuns } from "./fixtures.js"

test("点一张开场建议 → 建会话 → 那句话真的发了出去 → 有回复", async ({ dawn }) => {
  const { page, dbPath, requests } = dawn

  // 空态：还没有任何会话
  const card = page.getByRole("button", { name: /看看这里有什么/ })
  await expect(card).toBeVisible()
  await card.click()

  // ① 进了对话，输入框在了
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()

  // ② **卡片上那句话真的作为用户发言出现了**——不是卡片的标题，是它承诺要说的那句
  // **在对话区里找**：同一句话也是侧栏那一行的标题（第一句话定名字），
  // 不限定范围就会撞上——2026-08-11 会话列表刷得更早之后暴露出来的
  await expect(page.locator(".turns").getByText(/看一下当前工作区里有哪些文件和数据/)).toBeVisible({
    timeout: 30_000,
  })

  // ③ 模型真的被问了。**反空转**：没有这一条，前两条都可能只是本地回显
  await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible({ timeout: 30_000 })
  expect(requests.length).toBeGreaterThan(0)

  // ④ 账本上留下了这一轮
  const runs = await readRuns(dbPath)
  expect(runs.some((r) => r.request_type === "agent_turn")).toBe(true)
})

/**
 * **建议是可选项，不是必经之路**——有人就是想自己打字。
 *
 * 2026-08-12 换了主语：那颗「＋ 用 X 开始」没有了。作者：
 * *「不要上来就是用 Deepseek 开始，而是要直接是对话窗口。」*
 * 现在空态本身就是输入卡，所以「不点建议直接开始」= **直接打字发出去**。
 * 意图没变，而且比原来更接近它描述的那件事。
 */
test("不点任何建议，直接打字也能开始", async ({ dawn }) => {
  const { page } = dawn
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await box.fill("我自己打的第一句")
  await box.press("Enter")
  await expect(page.locator(".turns").getByText("我自己打的第一句")).toBeVisible({ timeout: 30_000 })
})
