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
  await expect(page.getByText(CANNED_REPLY, { exact: false })).toBeVisible({ timeout: 30_000 })
  expect(requests.length).toBeGreaterThan(0)

  // ④ 账本上留下了这一轮
  const runs = await readRuns(dbPath)
  expect(runs.some((r) => r.request_type === "agent_turn")).toBe(true)
})

test("主动作仍然可以不带任何建议直接开始", async ({ dawn }) => {
  const { page } = dawn
  // **建议是可选项，不是必经之路**——有人就是想自己打字
  await page.getByRole("button", { name: /用 .* 开始/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
  // 没点建议，就不该有任何用户发言
  await expect(page.locator(".turn.user")).toHaveCount(0)
})
