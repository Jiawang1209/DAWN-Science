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
  // 2026-08-10 重做：不再是一张 39 行的表，而是「添加 → 从列表里挑 → 只问 key」
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByLabel("筛选 provider").fill(陌生)
  await page.getByLabel("pi 认识的 provider").selectOption(陌生)
  await page.getByLabel("新服务的 API key").fill("sk-fake")
  await page.getByRole("button", { name: "添加" }).click()
  await expect(page.locator(".svc").filter({ hasText: 陌生 })).toHaveCount(1)

  await page.getByRole("button", { name: "返回" }).click()
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()

  await page.locator(".agent-pill").click()
  /**
   * **没有点过任何「建 agent」**——填 key 是唯一做过的事。
   *
   * 2026-08-11：这里找的从 id（`kimi-coding`）改成了显示名
   * （`Kimi For Coding`，pi 自己给的）——作者：*「不如直接叫 DeepSeek。」*
   */
  await expect(page.locator("body")).toContainText("Kimi For Coding", { timeout: 10_000 })
})

test("**不再有「建一个 agent」这种东西** —— 那是我们内部的概念漏了出来", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("button", { name: "建一个 agent" })).toHaveCount(0)
})
