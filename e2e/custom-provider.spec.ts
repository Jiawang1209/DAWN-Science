/**
 * 自己填 baseUrl 的 provider（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「这 8 个不自带的，你看着处理，需要添加 baseUrl / apiKey / api / headers
 * 那就添加。」*
 *
 * ## 为什么用一个 pi 根本不认识的 id
 *
 * 那 8 个（Bedrock / Azure / Vertex / Cloudflare×2 / opencode×2 / radius）
 * pi 认识它们的模型、只是不知道地址。**而一个全新的 id 什么都不知道**——
 * 它能连上，就说明 baseUrl / api / models 三样都真的送到了 pi 手里。
 * 这比挑其中一个去连真实的 Azure 更能证明问题，也不需要任何真凭证。
 *
 * 同一条路顺带解决selfhost的 vLLM / Ollama / 任何 OpenAI 兼容端点。
 */
import { test, expect } from "./fixtures.js"

/** `{{MOCK_URL}}` 由夹具换成假服务器地址——它在夹具起来之前不存在 */
const PROVIDERS = `
providers:
  selfhost:
    baseUrl: "{{MOCK_URL}}"
    api: openai-completions
    models: [local-7b]

agents:
  bendi:
    kind: native
    provider: selfhost
    model: local-7b
    capabilities: [chat, exec]
`

test.describe("自己填地址的 provider", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS } })

  test("**pi 不认识它，但它真的能对话** —— baseUrl / api / models 三样都到位了", async ({
    dawn,
  }) => {
    const { page, requests } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()

    /**
     * **先填 key。** 我们**刻意不把密钥写进 `models.json`**——它落盘就是明文。
     * 所以selfhost provider 与内置的走同一条路：钥匙串。
     *
     * 顺带证明了一件事：**selfhost的 provider 也会出现在凭证列表里**，
     * 因为那份列表来自模型目录，而它现在包含我们声明的这一个。
     */
    await page.getByRole("button", { name: "设置", exact: true }).click()
    const 行 = page.locator(".svc").filter({ hasText: "selfhost" })
    await expect(行).toHaveCount(1)
    // 一行摘要上就能看出它打到哪、有几个模型——不用点开
    await expect(行.locator(".svc-sum")).toContainText("1 个模型")
    await 行.locator(".svc-head").click()
    await 行.getByLabel("selfhost 的 API key").fill("sk-local-any")
    await 行.getByRole("button", { name: "保存" }).click()
    await page.getByRole("button", { name: "返回" }).click()

    await page.getByRole("button", { name: /新建会话/ }).click()
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 断言限定在对话区：会话标题里也有「你好」，全页 getByText 会命中两处
    await expect(page.locator(".turns")).toContainText("假模型已应答", { timeout: 60_000 })

    /**
     * **反空转**：请求真的打到了我们填的那个地址上，
     * 而且用的是我们声明的那个模型 id——不是某个内置 provider 顶了包。
     */
    const 打过去的 = JSON.stringify(requests)
    expect(打过去的).toContain("local-7b")
  })

  test("模型选择器里是我们声明的那个", async ({ dawn }) => {
    const { page } = dawn
    await page.getByRole("button", { name: /新建会话/ }).click()
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(".composer")).toContainText("local-7b")
  })
})
