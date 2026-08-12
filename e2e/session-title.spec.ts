/**
 * 会话在侧栏上分得开（2026-08-10）。**跑真实构建产物。**
 *
 * 作者当天的话：*「我的会话，会话的 ID 怎么都是一个呢？我很难辨别具体是哪个会话了。」*
 *
 * 单元测试能证明 `deriveSessionTitle` 会返回一个字符串。它证明不了
 * **这个字符串真的出现在侧栏上**——中间隔着落库、协议字段、以及
 * 「界面知不知道要重取一次」。**最后那一环最容易漏**：标题在后端定，
 * 界面不重取的话会一直显示「新会话」，而所有单元测试照样全绿。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

const 侧栏会话 = ".session-list .sess .name"

test("**两个会话按各自的第一句话区分开**，而不是两行一样的 agent 名", async ({ dawn }) => {
  const { page } = dawn

  await 开一段临时会话(page)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  // 还没说话——**显示「新会话」，不是一行空白**
  await expect(page.locator(侧栏会话).first()).toHaveText("新会话")

  await box.fill("看看 sales.csv 的分布")
  await box.press("Enter")
  await expect(page.locator(侧栏会话).first()).toHaveText("看看 sales.csv 的分布")

  // 第二个会话：同一个 agent，第一句话不同
  await 开一段临时会话(page)
  /**
   * **先等新会话真的到位再打字。**
   *
   * 2026-08-10 踩过：建完立刻 `fill`，字被随后到来的会话切换清掉了，
   * Enter 落在一个空输入框上——现象是「第二个会话永远没有标题」，
   * 而真正的原因与标题一点关系都没有。
   */
  await expect(page.locator(".session-list li")).toHaveCount(2)
  const box2 = page.getByPlaceholder(/回车发送/)
  await expect(box2).toHaveValue("")
  await box2.fill("跑一次线性回归")
  await box2.press("Enter")

  // **先等它出现再取快照**：标题在后端定，界面重取是异步的——
  // 直接 allTextContents 量到的是刷新之前的那一帧
  await expect(page.locator(侧栏会话).filter({ hasText: "跑一次线性回归" })).toBeVisible()

  const 标题 = await page.locator(侧栏会话).allTextContents()
  expect(标题).toContain("看看 sales.csv 的分布")
  expect(标题).toContain("跑一次线性回归")
  // 两行**确实不同**——这正是原来的毛病
  expect(new Set(标题).size).toBe(标题.length)
})

test("**第二句话不改名字** —— 侧栏上的名字自己变，人会以为点错了会话", async ({ dawn }) => {
  const { page } = dawn

  await 开一段临时会话(page)
  const box = page.getByPlaceholder(/回车发送/)
  await box.fill("第一句定名字")
  await box.press("Enter")
  await expect(page.locator(侧栏会话).first()).toHaveText("第一句定名字")

  await box.fill("第二句不该改名字")
  await box.press("Enter")
  await expect(page.locator(侧栏会话).first()).toHaveText("第一句定名字")
})

/**
 * **会话行右端写的是时刻**（2026-08-12 换了主语）。
 *
 * 上一版这一行是「标题在上、来路（DeepSeek · 时刻）在下」的双行。
 * 实测 WorkBuddy 是 `240×31` **单行**：标题在左、时刻在右；
 * 我们的双行 53px，**高出七成**，一屏少放三分之一的对话。
 *
 * **agent 名从这一行拿掉了**，不是丢了这条信息：每条回答上都记着是谁答的
 * （`item.by`，2026-08-12 加的），composer 上还有一颗 pill。
 * 那时它必须在这里，是因为当时**只有这里说得出**；现在不是了。
 */
test("会话行右端带时刻 —— 一眼看得出哪段是新的", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await expect(page.locator(".session-list .sess .sub").first()).toHaveText(/\d{2}:\d{2}/)
})
