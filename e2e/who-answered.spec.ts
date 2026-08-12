/**
 * 换过服务之后，**答话的那一行标的是谁**（2026-08-12）。**跑真实产物。**
 *
 * 作者换到 kimi 之后，回答上仍然写着「DeepSeek」，于是他合理地推断
 * 「没换过去」。**界面在说谎，而且是最容易被当真的那种谎**——
 * 那一行取的是 `session.agentId`，建会话时就绑死了。
 *
 * 修法不是「一律显示当前那家」：**那会把历史也改写**，
 * 前面那些确实是上一家答的。所以每一轮各自记下当时是谁。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**换服务之后，新答的那一行改名，旧的不动**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await page.getByPlaceholder(/回车发送/).fill("第一问")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })

  // 换服务（菜单上组「就地换服务（对话不断）」）
  await page.locator(".agent-pill").click()
  const 上组 = page.locator(".agent-menu .svc-group")
  await expect(上组).toBeVisible()
  const 另一家 = 上组.getByRole("menuitem").last()
  const 名字 = ((await 另一家.textContent()) ?? "").replace("当前", "").trim()
  await 另一家.click()
  await expect(page.locator(".turns")).toContainText("已换到", { timeout: 15_000 })

  await page.getByPlaceholder(/回车发送/).fill("第二问")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("第二问", { timeout: 30_000 })

  // 指名字那一段：`.who` 里现在还有头像（2026-08-12 加的）
  const 说话人 = page.locator(".turn.agent .who-name")
  await expect(说话人).toHaveCount(2, { timeout: 30_000 })
  // **新的那一行标的是换过去的那家**
  await expect(说话人.last()).toHaveText(名字)
  /**
   * **「历史不被改写」这条不在这里验。**
   *
   * 夹具里只有一家服务，「换过去」换的还是它自己——新旧两行本来就同名，
   * 在这儿断言什么都证明不了。它的真正住处是事件中枢
   * （`tests/workbench/events.test.ts`：换模型只影响之后的条目），
   * 那里一家也够。**把断言放在它证明得了的地方**。
   */
})
