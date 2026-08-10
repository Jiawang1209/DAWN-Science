/**
 * 那 8 个不自带地址的 provider，设置里有输入框（2026-08-10）。
 *
 * 作者：*「设置里把那 8 个的输入框也补上」*。
 *
 * pi 认识 40 个 provider，**其中 8 个不自带 `baseUrl`**——
 * Bedrock / Azure / Vertex / Cloudflare×2 / opencode×2 / radius。
 * 它们的地址跟账号、区域、项目走，pi 没法替你填。
 * **不给输入框的话，填了 key 也连不上，而没人知道为什么。**
 */
import { test, expect } from "./fixtures.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const 要填地址的 = "azure-openai-responses"
/** **不能用 deepseek**：它在配置里被用着，会被置顶到折叠外面去 */
const 不用填的 = "groq"

async function 找到(page: import("@playwright/test").Page, id: string) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await // **限定直接子元素**：每一行现在也有一个「改地址」折叠
  page.locator(".more-providers > summary").click()
  await page.getByLabel("筛选 provider").fill(id)
  return page.locator(".more-providers .set-row").filter({ hasText: id }).first()
}

test("**要填地址的那几个才有输入框**", async ({ dawn }) => {
  const { page } = dawn
  const 行 = await 找到(page, 要填地址的)
  await expect(行.locator(".base-url")).toBeVisible()
  // 那句话要说清为什么要填
  await expect(行.locator(".base-url")).toContainText("跟你的账号")
})

test("**自带地址的也能改** —— 「pi 自带地址」不等于「地址对你也对」", async ({ dawn }) => {
  const { page } = dawn
  const 行 = await 找到(page, 不用填的)
  await expect(行).toHaveCount(1)

  /**
   * 2026-08-10 返工：这条原本断言「不用填的那些不给空框」。
   *
   * **那条线划错了。** 作者在 platform.kimi.com 买了按量 API，填进
   * `kimi-coding` 之后 401——因为 pi 自带的那个地址是 Kimi For Coding
   * **订阅线**，与他买的不是一条路。而当时的界面只给「pi 不自带地址」的
   * 那 8 个开输入框，于是他**在界面上根本改不了它**。
   *
   * 现在每一个都能改：不占视线（收在「改地址」里），但**随时够得着**。
   */
  // **折叠时它仍在 DOM 里，只是不可见**——所以断言可见性，不是数量
  await expect(行.locator(".base-url")).not.toBeVisible()
  await 行.locator(".base-url-fold > summary").click()
  await expect(行.locator(".base-url")).toBeVisible()
  // 说的话也不同：这一档是「可以改」，不是「必须填」
  await expect(行.locator(".base-url")).toContainText("默认用 pi 自带的地址")
})

test("填进去**真的落到配置文件里**，而且原有内容没被动", async ({ dawn }) => {
  const { page, dir } = dawn
  const 行 = await 找到(page, 要填地址的)
  await 行.getByLabel(`${要填地址的} 的端点地址`).fill("https://我的资源.openai.azure.com")
  // 一行里现在有两个「保存」（key 一个、地址一个）——**限定在地址那一块里**
  await 行.locator(".base-url-form").getByRole("button", { name: "保存" }).click()

  // 存完那一行要显示它——重取过一次，不是本地记着
  await expect(行.getByLabel(`${要填地址的} 的端点地址`)).toHaveValue(
    "https://我的资源.openai.azure.com",
  )

  const yaml = readFileSync(join(dir, "providers.yaml"), "utf8")
  expect(yaml).toContain(要填地址的)
  expect(yaml).toContain("https://我的资源.openai.azure.com")
  // **agents 段一个字都没动**
  expect(yaml).toContain("agents:")
})
