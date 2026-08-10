/**
 * 凭证界面列出 pi 认识的全部 provider（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「配置里面目前只有一个 deepseek，pi-ai 里面不是可以兼容很多吗？
 * 应该都加进去。」*
 *
 * ## 为什么必须在这里验，而不是单元测试
 *
 * 这份清单**是运行时从 pi 的模型目录取的**，不是一份常量。
 * 单元测试里我可以喂它任何数组然后断言它渲染了——那证明的是渲染，
 * 不是「pi 真的告诉了我们这些名字」。**只有真链路才能证明后者。**
 */
import { test, expect } from "./fixtures.js"

test("**「我能配谁」远多于「我配过谁」**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()

  const 折叠 = page.locator(".more-providers")
  await expect(折叠).toBeVisible()

  /**
   * 摘要上那个数字是**真的**：它来自 pi 的模型目录。
   * 这里不写死 39——目录会更新，写死等于给自己埋一个每次同步都红的用例。
   * **但它必须远大于 1**，那正是作者指出的问题。
   */
  const 摘要 = await 折叠.locator("summary").textContent()
  const n = Number(/（(\d+)）/.exec(摘要 ?? "")?.[1] ?? "0")
  expect(n).toBeGreaterThan(10)

  await 折叠.locator("summary").click()
  // 展开之后每一个都能填 key
  await expect(折叠.locator(".cred-form").first()).toBeVisible()
})

test("筛选能把要找的那个捞出来", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.locator(".more-providers summary").click()

  await page.getByLabel("筛选 provider").fill("anthropic")
  const 行 = page.locator(".more-providers .set-row")
  await expect(行).toHaveCount(1)
  await expect(行.first()).toContainText("anthropic")
})

test("**配置在用的置顶**，不混在那一大堆里", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()

  // deepseek 来自 providers.yaml，应当在折叠外面
  const 置顶 = page.locator(".set-section .set-rows > .set-row").filter({ hasText: "deepseek" })
  await expect(置顶).toHaveCount(1)
  await expect(page.locator(".more-providers")).not.toContainText("deepseek")
})
