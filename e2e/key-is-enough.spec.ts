/**
 * 填了 key 就够了（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「我明明设置 kimi 的 key 就好了，为什么还会多一个新建 agent
 * 这种奇怪的东西呢？其实配置 kimi 的方法，不应该和新建 deepseek 是一回事儿吗？」*
 *
 * **他是对的。** deepseek 之所以「填个 key 就能用」，唯一的原因是它碰巧写在
 * 默认配置里；kimi 没有，所以填完什么都没多。同一件事被做成了两种，
 * 差别还落在一个用户根本不该知道的概念（agent）上。
 */
import { test, expect } from "./fixtures.js"

const 陌生 = "kimi-coding"

test("**填完 key，对话的选择器里立刻就有它**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await // **限定直接子元素**：每一行现在也有一个「改地址」折叠
  page.locator(".more-providers > summary").click()
  await page.getByLabel("筛选 provider").fill(陌生)

  const 行 = page.locator(".more-providers .set-row").filter({ hasText: 陌生 })
  await 行.getByLabel(`${陌生} 的 API key`).fill("sk-fake")
  await 行.locator(".cred-form").getByRole("button", { name: "保存" }).click()

  await page.getByRole("button", { name: "返回" }).click()
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()

  await page.locator(".agent-pill").click()
  // **没有点过任何「建 agent」**——填 key 是唯一做过的事
  await expect(page.locator("body")).toContainText(陌生, { timeout: 10_000 })
})

test("**不再有「建一个 agent」这种东西** —— 那是我们内部的概念漏了出来", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("button", { name: "建一个 agent" })).toHaveCount(0)
})
