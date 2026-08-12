/**
 * 模型选择器收成**一颗** pill（2026-08-12）。**跑真实构建产物。**
 *
 * 作者给了一张 WorkBuddy 的截图：输入卡右下角只有 `◐ Hy3 ⌃` 一颗，
 * 点开是一列模型 + 底一条「配置自定义模型」。
 *
 * 我们此前摊着两颗（「哪家」与「哪个模型」）——**它们回答的是同一个问题**。
 * 2026-08-11 定「先厂家、后模型」时那是对的（那会儿换厂家真要新建对话），
 * 但换服务已经能就地换了，两颗就成了同一件事的两种问法。
 *
 * ## 明确没抄的
 *
 * 截图里还有 `Max 模式`、`Auto`、`0.79x` 倍率、「夜间加速」这些徽标。
 * **我们没有这些事实**——倍率要计费口径，徽标要活动信息，一样都没有。
 * 编出来就是假数据（不变式 5：不伪造事实）。所以这一屏只有真有的东西。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

test("**输入卡右下角只有一颗 pill**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  const 控件行 = page.locator(".composer-controls")
  await expect(控件行.locator(".model-pill")).toHaveCount(1)
  /**
   * **agent pill 不在这一行里了**：它搬去了初始画面（挑 LLM 发生在开口之前）。
   * 一行里两颗回答同一个问题的东西，正是作者要收掉的那件。
   */
  await expect(控件行.locator(".agent-pill")).toHaveCount(0)
})

test("**点开是按服务分组的模型列表，当前那条打勾**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  await page.locator(".model-pill .model-trigger").click()
  const 菜单 = page.getByRole("menu", { name: "切换模型" })
  await expect(菜单).toBeVisible()

  // 组头说的是「哪家」——合并成一颗之后，这是唯一说得出它的地方
  await expect(菜单.locator(".model-group-head").first()).toBeVisible()
  // 当前那条有勾，**而且同时有一个字**：只用形状表达含义是不够的
  await expect(菜单.locator(".model-check")).toHaveCount(1)
  await expect(菜单.getByText("当前")).toHaveCount(1)

  /**
   * **底一条把「这里没有我要的」接到「去哪加一个」。**
   * 没有它，人只能自己想到去设置里翻。
   */
  await expect(菜单.getByRole("menuitem", { name: /配置自定义模型/ })).toBeVisible()
})

test("**「配置自定义模型」真的把人送到设置**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  await page.locator(".model-pill .model-trigger").click()
  await page.getByRole("menuitem", { name: /配置自定义模型/ }).click()

  // 到了设置屏，而且模型服务那一段在
  await expect(page.getByText(/模型服务/).first()).toBeVisible({ timeout: 30_000 })
  // 点完就收起——菜单不该赖着不走
  await expect(page.getByRole("menu", { name: "切换模型" })).toHaveCount(0)
})

/**
 * **不编造我们没有的事实**（不变式 5）。
 *
 * WorkBuddy 那个浮层上有倍率与活动徽标。抄形状容易，抄出来的数字是假的——
 * 而一个看起来像真的假数字，比没有这个数字坏得多。
 * 这条盯的就是「别哪天手滑加上去」。
 */
test("**不出现倍率与活动徽标** —— 那些数字我们没有", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  await page.locator(".model-pill .model-trigger").click()
  const 文本 = (await page.getByRole("menu", { name: "切换模型" }).textContent()) ?? ""
  expect(文本).not.toMatch(/\d+\.\d+x/)
  expect(文本).not.toMatch(/Max 模式|限时免费|夜间/)
})
