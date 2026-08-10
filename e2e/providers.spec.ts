/**
 * 模型服务：**「我配过谁」在上面，「我能配谁」在「添加」里**（2026-08-10 重做）。
 * **跑真实构建产物。**
 *
 * 作者两次意见叠在一起：
 *   *「配置里面目前只有一个 deepseek，pi-ai 里面不是可以兼容很多吗？应该都加进去。」*
 *   *「pi 里面自己识别的一大堆，我感觉格式有点儿乱乱的。」*
 *
 * 第一句要的是**能配的都要够得着**，第二句要的是**别把 39 个全摊在脸上**。
 * 分两层正是同时满足这两句：上面一条一行摘要，下面一个「添加」入口。
 *
 * ## 为什么必须在这里验，而不是单元测试
 *
 * 那份清单**是运行时从 pi 的模型目录取的**，不是一份常量。
 * 单元测试里我可以喂它任何数组然后断言它渲染了——那证明的是渲染，
 * 不是「pi 真的告诉了我们这些名字」。**只有真链路才能证明后者。**
 */
import { test, expect } from "./fixtures.js"

async function 开添加(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
}

test("**「我能配谁」远多于「我配过谁」**", async ({ dawn }) => {
  const { page } = dawn
  await 开添加(page)

  /**
   * 那个数字是**真的**：它来自 pi 的模型目录。
   * 这里不写死 39——目录会更新，写死等于给自己埋一个每次同步都红的用例。
   * **但它必须远大于 1**，那正是作者指出的问题。
   */
  const 挑 = page.getByRole("radio", { name: /从 pi 认识的里面挑/ })
  const n = Number(/（(\d+)）/.exec((await 挑.textContent()) ?? "")?.[1] ?? "0")
  expect(n).toBeGreaterThan(10)

  // 下拉里真的有那么多个可挑
  const 选项 = page.getByLabel("pi 认识的 provider").locator("option")
  expect(await 选项.count()).toBe(n)
})

test("筛选能把要找的那个捞出来", async ({ dawn }) => {
  const { page } = dawn
  await 开添加(page)
  await page.getByLabel("筛选 provider").fill("anthropic")

  const 选项 = page.getByLabel("pi 认识的 provider").locator("option")
  await expect(选项).toHaveCount(1)
  await expect(选项.first()).toHaveText(/anthropic/)
})

test("**配过的在上面一行摘要**，不混在那一大堆里", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()

  // deepseek 来自 providers.yaml（夹具补的 ds-chat），所以它是一条已配置的服务
  const 摘要 = page.locator(".svc").filter({ hasText: "deepseek" })
  await expect(摘要).toHaveCount(1)
  // 一行里三件事都在：打到哪、几个模型、key 填没填
  await expect(摘要).toContainText("个模型")

  // 而它**不在**可挑的那份清单里——已经配过了
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await expect(page.getByLabel("pi 认识的 provider").locator("option")).not.toContainText([
    "deepseek",
  ])
})

test("**点开能改任何一项**，包括 pi 自带地址的那些的地址", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.locator(".svc").filter({ hasText: "deepseek" }).locator(".svc-head").click()

  for (const 标签 of [/deepseek 的 API key/, /deepseek 的端点地址/, /deepseek 的协议/, /deepseek 的模型清单/]) {
    await expect(page.getByLabel(标签)).toBeVisible()
  }
})
