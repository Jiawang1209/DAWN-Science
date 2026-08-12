/**
 * 端点地址：**每一个都能改，不该填的那几个还要显眼地催**（2026-08-10）。
 * **跑真实构建产物。**
 *
 * 两句作者的话叠在一起：
 *   *「设置里把那 8 个的输入框也补上」*——pi 认识 40 个 provider，
 *   其中 8 个不自带 `baseUrl`（Bedrock / Azure / Vertex / Cloudflare×2 /
 *   opencode×2 / radius），地址跟账号、区域、项目走，pi 没法替你填。
 *
 *   *「kimi 现在报错 401」*——而他买的是 platform.kimi.com 的按量 API，
 *   pi 自带的 `kimi-coding` 地址是 Kimi For Coding **订阅线**，两条路。
 *   **「pi 自带地址」不等于「这个地址对你也对」。**
 */
import { test, expect } from "./fixtures.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const 要填地址的 = "azure-openai-responses"
/** **不能用 deepseek**：它在配置里被用着，已经是一条已配置的服务了 */
const 不用填的 = "groq"

/** 从「添加」里挑一个加进来（这条路只问 key），然后点开它的编辑器 */
async function 加并点开(page: import("@playwright/test").Page, id: string) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByLabel("筛选 provider").fill(id)
  await page.getByLabel("pi 认识的 provider").selectOption(id)
  await page.getByLabel("新服务的 API key").fill("sk-fake")
  await page.getByRole("button", { name: "加进来" }).click()

  const 行 = page.locator(".svc").filter({ hasText: id })
  await expect(行).toHaveCount(1)
  // 加完就是展开的——刚加的那个正是你要接着填东西的那个
  await expect(行.getByLabel(`${id} 的端点地址`)).toBeVisible()
  return 行
}

test("**没填地址的那几个，摘要上就在催** —— 填了 key 也连不上，而没人知道为什么", async ({
  dawn,
}) => {
  const { page } = dawn
  const 行 = await 加并点开(page, 要填地址的)
  await expect(行.locator(".svc-sum")).toContainText("还没填地址")
  // 那句话要说清为什么要填
  await expect(行).toContainText("跟你的账号")
})

test("**自带地址的也能改** —— 「pi 自带地址」不等于「地址对你也对」", async ({ dawn }) => {
  const { page } = dawn
  const 行 = await 加并点开(page, 不用填的)
  // 摘要上如实说「用的是 pi 自带的那个」
  await expect(行.locator(".svc-sum")).toContainText("pi 自带地址")
  // 说的话也不同：这一档是「可以改」，不是「必须填」
  await expect(行).toContainText("留空就用 pi 自带的地址")
})

test("填进去**真的落到配置文件里**，而且原有内容没被动", async ({ dawn }) => {
  const { page, dir } = dawn
  const 行 = await 加并点开(page, 要填地址的)

  await 行.getByLabel(`${要填地址的} 的端点地址`).fill("https://我的资源.openai.azure.com")
  await 行.getByRole("button", { name: "保存" }).click()

  // 存完摘要就换了说法——重取过一次，不是本地记着
  await expect(行.locator(".svc-sum")).toContainText("我的资源.openai.azure.com")

  const yaml = readFileSync(join(dir, "providers.yaml"), "utf8")
  expect(yaml).toContain(要填地址的)
  expect(yaml).toContain("https://我的资源.openai.azure.com")
  // **agents 段一个字都没动**
  expect(yaml).toContain("agents:")
  expect(yaml).toContain("ds-chat")
})
