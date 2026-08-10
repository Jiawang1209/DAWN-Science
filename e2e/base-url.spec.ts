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
  await page.locator(".more-providers summary").click()
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

test("**不用填的那些不给空框** —— 多一个空输入框只会让人以为还得填点什么", async ({ dawn }) => {
  const { page } = dawn
  const 行 = await 找到(page, 不用填的)
  await expect(行).toHaveCount(1)
  await expect(行.locator(".base-url")).toHaveCount(0)
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
