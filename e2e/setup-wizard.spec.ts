/**
 * 首启向导（2026-08-27，spec `2026-08-27-首启向导与环境检测-design.md`）。
 *
 * 四步主区域向导；密钥页保留验证，可暂缓；计算环境可选。
 * 解释器是可选的检测：两枚假 `python3` 放进 PATH，一枚有 ipykernel 一枚没有，列出来、状态对、选中即写进设置。
 * **只列不装**：页面上不该有任何「帮我装」的按钮。
 */
import { test, expect } from "./fixtures.js"
import { resolve } from "node:path"
import { DEFAULT_CONFIG_YAML } from "../src/config/loader.js"
import type { Page } from "@playwright/test"

async function 检查优化入口(page: Page) {
  const add = page.locator("main.main").getByRole("button", { name: "添加内容", exact: true })
  await add.click()
  const menu = page.getByRole("menu", { name: "添加内容", exact: true })
  const enhance = menu.getByRole("menuitem", { name: "优化输入", exact: true })
  await expect(enhance).toBeVisible()
  await expect(enhance).toHaveAttribute("aria-haspopup", "menu")
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(add).toBeFocused()
}

async function 到模型页(page: Page) {
  const wizard = page.locator(".setup-wizard")
  await expect(wizard.getByRole("heading", { name: "欢迎使用 DAWN Science" })).toBeVisible()
  await wizard.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(wizard.getByRole("heading", { name: "让研究工作在这里衔接" })).toBeVisible()
  await wizard.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(wizard.getByRole("heading", { name: "连接 AI 模型" })).toBeVisible()
}

const 有内核 = resolve(import.meta.dirname, "fixtures", "py-with-kernel")
const 没内核 = resolve(import.meta.dirname, "fixtures", "py-without-kernel")

test.describe("首启向导", () => {
  test.use({ dawnOptions: { showSetup: true, env: { PATH: `${有内核}:${没内核}:${process.env.PATH ?? ""}` } } })

  test("没凭证 → 首屏是向导；检测列出两枚假 python 且状态对；选中即写进设置；填 key 后开始使用", async ({ dawn }) => {
    const { page } = dawn
    const 向导 = page.locator(".setup-wizard")
    await expect(向导).toBeVisible()
    await 到模型页(page)
    const 下一页 = 向导.getByRole("button", { name: "下一页", exact: true })
    await expect(下一页).toBeDisabled()
    await 向导.getByLabel("API key", { exact: true }).fill("sk-e2e-test")
    await 向导.getByRole("button", { name: "保存", exact: true }).click()
    await expect(向导).toContainText(/已填/)
    await expect(向导.getByRole("heading", { name: "连接 AI 模型" })).toBeVisible()
    await 下一页.click()

    // 解释器检测（可选那段）
    await 向导.getByRole("button", { name: "检测本机解释器" }).first().click()
    const 有 = 向导.locator(".ip-python .ip-item", { hasText: 有内核 })
    const 没 = 向导.locator(".ip-python .ip-item", { hasText: 没内核 })
    await expect(有).toBeVisible({ timeout: 30_000 })
    await expect(有).toContainText("3.11.9")
    await expect(有).toContainText("ipykernel ✓")
    await expect(没).toContainText("3.14.7")
    await expect(没).toContainText("ipykernel ✗")
    // 只列不装
    await expect(向导.getByRole("button", { name: /帮我跑|安装/ })).toHaveCount(0)

    await 有.getByRole("radio").check()
    await expect.poll(async () =>
      page.evaluate(async () => {
        const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { python?: string } }> } }
        return (await w.dawn.invoke("getInterpreters", {})).data?.python
      }),
    ).toBe(`${有内核}/python3`)

    await 向导.getByRole("button", { name: "开始使用 →" }).click()
    await expect(page.locator(".setup-wizard")).toHaveCount(0)
    await expect(page.getByPlaceholder(/输入问题/)).toBeVisible()
  })

  test("先跳过 → 回到普通首页，底部红字还在；点红字和重开后点红字均从第一页开始", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".setup-wizard")).toBeVisible()
    await page.getByRole("button", { name: "先跳过" }).click()
    await expect(page.locator(".setup-wizard")).toHaveCount(0)
    // 优化入口现位于添加菜单；未填凭证的状态仍由下方红字明确表达。
    await 检查优化入口(page)
    const 红字 = page.locator(".statusbar").getByRole("button", { name: /还没有填任何 API key/ })
    await expect(红字).toBeVisible()
    await 红字.click()
    await 到模型页(page)
    await page.getByRole("button", { name: "稍后配置", exact: true }).click()
    await page.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    const reopened = await dawn.重开()
    await expect(reopened.locator(".setup-wizard")).toHaveCount(0)
    await reopened.locator(".statusbar").getByRole("button", { name: /还没有填任何 API key/ }).click()
    await 到模型页(reopened)
  })

  test("解释器路径保存失败在卡片内显示，未配置时仍可跳过", async ({ dawn }) => {
    const { page } = dawn
    await 到模型页(page)
    const wizard = page.locator(".setup-wizard")
    await wizard.getByRole("button", { name: "稍后配置", exact: true }).click()
    await wizard.locator(".ip-python").getByRole("button", { name: "手动填写路径", exact: true }).click()
    await wizard.getByLabel("Python 解释器路径", { exact: true }).fill("/dawn-test-missing/python")
    await wizard.getByRole("button", { name: "用这个", exact: true }).click()
    await expect(wizard.getByRole("alert")).toContainText("Python")
    await expect(wizard.getByRole("alert")).toContainText("/dawn-test-missing/python")
    await expect(wizard.getByRole("button", { name: "跳过，进入工作台", exact: true })).toBeEnabled()
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await expect(wizard).toHaveCount(0)
  })

  test("密钥链接交给系统浏览器，默认 DeepSeek 地址无需重复填写", async ({ dawn }) => {
    const { page, app } = dawn
    await 到模型页(page)
    const wizard = page.locator(".setup-wizard")
    await expect(wizard.getByLabel("服务商", { exact: true })).toHaveValue("deepseek")
    await expect(wizard.getByLabel("API URL", { exact: true })).toHaveValue(dawn.mockUrl)
    const logs: string[] = []
    const record = (data: Buffer) => logs.push(data.toString())
    app.process().stdout?.on("data", record)
    try {
      await wizard.getByRole("link", { name: "获取 deepseek API Key →", exact: true }).click()
      await expect.poll(() => logs.some(line => line.includes("本该交给系统浏览器") && line.includes("https://platform.deepseek.com/api_keys"))).toBe(true)
      expect(app.windows()).toHaveLength(1)
      await expect(wizard.getByRole("heading", { name: "连接 AI 模型" })).toBeVisible()
    } finally {
      app.process().stdout?.off("data", record)
    }
  })

  test("服务商切换自动填写目录默认地址，手动改址仍可检测", async ({ dawn }) => {
    const { page } = dawn
    await 到模型页(page)
    const wizard = page.locator(".setup-wizard")
    const provider = wizard.getByLabel("服务商", { exact: true })
    const url = wizard.getByLabel("API URL", { exact: true })
    await expect(provider).toHaveValue("deepseek")
    await expect(url).toHaveValue(dawn.mockUrl)
    await provider.selectOption("anthropic")
    await expect(url).toHaveValue("https://api.anthropic.com")
    await provider.selectOption("deepseek")
    await expect(url).toHaveValue(dawn.mockUrl)
    await url.fill(`${dawn.mockUrl}/chat/completions`)
    await wizard.getByLabel("连接模型", { exact: true }).fill("autofill-model")
    await wizard.getByLabel("API key", { exact: true }).fill("sk-test")
    await wizard.getByRole("button", { name: "测试连通", exact: true }).click()
    await expect(wizard.locator(".svc-test-ok")).toContainText("autofill-model")
    expect((dawn.keyChecks as { body: { model: string } }[])[0]?.body.model).toBe("autofill-model")
    await provider.selectOption("deepseek")
    await expect(url).toHaveValue(dawn.mockUrl)
    await expect(wizard.locator(".svc-test-ok")).toHaveCount(0)
  })

  test("引导覆盖整个 App 并虚化背景，卡片清晰且焦点不进入背景", async ({ dawn }) => {
    const { page } = dawn
    const wizard = page.locator(".setup-wizard")
    await expect(wizard).toBeVisible()
    const surface = await page.locator(".setup-stage").evaluate(el => {
      const bounds = el.getBoundingClientRect()
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight, blur: getComputedStyle(el).backdropFilter }
    })
    expect(surface).toMatchObject({ x: 0, y: 0 })
    expect(surface.width).toBe(surface.viewportWidth)
    expect(surface.height).toBe(surface.viewportHeight)
    expect(surface.blur).toContain("blur(")
    await expect(wizard).toHaveAttribute("role", "dialog")
    await expect(wizard).toHaveAttribute("aria-modal", "true")
    expect(await wizard.evaluate(el => getComputedStyle(el).filter)).toBe("none")
    await wizard.getByRole("button", { name: "下一页", exact: true }).focus()
    await page.keyboard.press("Tab")
    await expect(wizard.getByRole("radio", { name: "中文", exact: true })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(wizard).toBeVisible()
  })

  test("四步实机截图；语言选择立即传递到工作台；窄窗口可操作", async ({ dawn }, info) => {
    const { page } = dawn
    const wizard = page.locator(".setup-wizard")
    await expect(wizard).toBeVisible()
    const card = await wizard.boundingBox()
    expect(card!.width).toBeLessThanOrEqual(620)
    await page.screenshot({ animations: "disabled", path: info.outputPath("01-welcome.png") })
    await wizard.getByRole("radio", { name: "English", exact: true }).click()
    await expect(wizard.getByRole("heading", { name: "Welcome to DAWN Science" })).toBeVisible()
    await page.screenshot({ animations: "disabled", path: info.outputPath("01-welcome-en.png") })
    await wizard.getByRole("radio", { name: "中文", exact: true }).click()
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await page.screenshot({ animations: "disabled", path: info.outputPath("02-features.png") })
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await page.screenshot({ animations: "disabled", path: info.outputPath("03-api-key.png") })
    await wizard.getByRole("button", { name: "稍后配置", exact: true }).click()
    await page.screenshot({ animations: "disabled", path: info.outputPath("04-environment.png") })
    await page.setViewportSize({ width: 960, height: 640 })
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).scrollIntoViewIfNeeded()
    expect(await wizard.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ animations: "disabled", path: info.outputPath("04-environment-compact.png") })
    await wizard.getByRole("radio", { name: "English", exact: true }).click()
    await wizard.getByRole("button", { name: "Enter workbench", exact: true }).click()
    await expect(wizard).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem("dawn.global.lang"))).toBe("en")
    await expect(page.locator(".statusbar-setup")).toContainText("API key")
    await expect(page.locator(".statusbar-setup")).not.toContainText("还没有")
  })

  test("自定义 URL：先检测失败再修正，检测不落盘；保存后能用同一服务对话", async ({ dawn }) => {
    const { page } = dawn
    const wizard = page.locator(".setup-wizard")
    await 到模型页(page)
    await wizard.getByLabel("API URL", { exact: true }).fill(`${dawn.mockUrl}/chat/completions`)
    await wizard.getByLabel("连接模型", { exact: true }).fill("lab-model")
    await wizard.getByLabel("API key", { exact: true }).fill("sk-bad")
    await wizard.getByRole("button", { name: "测试连通", exact: true }).click()
    await expect(wizard.locator(".svc-test .caveat")).toContainText("Incorrect API key")
    await wizard.getByLabel("API key", { exact: true }).fill("sk-good")
    await expect(wizard.locator(".svc-test .caveat")).toHaveCount(0)
    await wizard.getByRole("button", { name: "测试连通", exact: true }).click()
    await expect(wizard.locator(".svc-test-ok")).toContainText("lab-model")
    await expect(wizard.getByRole("button", { name: "下一页", exact: true })).toBeDisabled()
    const readCreds = () => page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { configured: string[] } }> } }
      return (await w.dawn.invoke("listCredentials", {})).data?.configured
    })
    expect(await readCreds()).toEqual([])
    const id = await wizard.getByLabel("服务商", { exact: true }).inputValue()
    // 本地假端点可能由目录识别为现有服务；也支持目录外自定义 ID。
    await wizard.getByRole("button", { name: "保存", exact: true }).click()
    await expect(wizard).toContainText(`已填 ${id}`)
    expect(await readCreds()).toContain(id)
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await page.getByPlaceholder(/输入问题/).fill("请说一句话")
    await page.getByPlaceholder(/输入问题/).press("Enter")
    await expect(page.locator(".conversation")).toContainText("假模型已应答")
    expect(dawn.requests.length).toBeGreaterThan(0)
  })
})

/**
 * **按产品原样的默认配置跑一遍全新安装**（2026-08-28，打包版抓的）。
 *
 * 夹具默认会把 `ds-chat` 插到 `agents:` 第一个——注释里写得明白：「追加在末尾会让默认 agent
 * 从 ds-chat 变成 claude」。**测试早知道这个坑，却绕开了它而不是锁住它**：真实首启走的正是被绕开的那条路——
 * 默认配置只有 claude / codex（cli），填 key 合成的 native 追加在末尾，一开口走的是 claude CLI。
 * 这条用发布出去的那份 `DEFAULT_CONFIG_YAML`，一个字不改。
 */
test.describe("首启向导 · 产品原样的默认配置", () => {
  test.use({ dawnOptions: { showSetup: true, providersYaml: DEFAULT_CONFIG_YAML } })

  test("明确模型和协议在检测、保存验证、首次对话中一致", async ({ dawn }) => {
    const { page } = dawn
    await 到模型页(page)
    const wizard = page.locator(".setup-wizard")
    await wizard.getByLabel("连接模型", { exact: true }).fill("deepseek-special")
    await wizard.getByLabel("接口协议", { exact: true }).selectOption("anthropic-messages")
    await wizard.getByLabel("API key", { exact: true }).fill("sk-test")
    await wizard.getByRole("button", { name: "测试连通", exact: true }).click()
    await expect(wizard.locator(".svc-test-ok")).toContainText("deepseek-special")
    await wizard.getByRole("button", { name: "保存", exact: true }).click()
    await expect(wizard).toContainText("已填 deepseek")
    await expect(wizard.locator(".caveat")).toHaveCount(0)
    const checks = dawn.keyChecks as { url: string; body: { model: string } }[]
    expect(checks).toHaveLength(2)
    for (const check of checks) {
      expect(check.body.model).toBe("deepseek-special")
      expect(check.url).toMatch(/^\/v1\/messages/)
    }
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await page.getByPlaceholder(/输入问题/).fill("请说一句话")
    await page.getByPlaceholder(/输入问题/).press("Enter")
    await expect(page.locator(".conversation")).toContainText("假模型已应答")
    const requests = dawn.requests as { url: string; body: { model: string } }[]
    expect(requests[0]?.body.model).toBe("deepseek-special")
    expect(requests[0]?.url).toMatch(/^\/v1\/messages/)
  })

  test("**填完 key 一开口，走的是刚填的那家（native），不是 claude CLI**；「优化输入」在", async ({ dawn }) => {
    const { page } = dawn
    const 向导 = page.locator(".setup-wizard")
    await expect(向导).toBeVisible()
    await 到模型页(page)
    await 向导.getByLabel("API key").fill("sk-e2e-test")
    await 向导.getByRole("button", { name: "保存", exact: true }).click()
    await expect(向导).toContainText(/已填/)
    // 存完当场验了一次（B9）：假服务器另一本账上有它，且验过是好的——向导上没有红字
    expect(dawn.keyChecks.length).toBe(1)
    await expect(向导.locator(".caveat")).toHaveCount(0)
    await 向导.getByRole("button", { name: "下一页", exact: true }).click()
    await 向导.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await expect(向导).toHaveCount(0)

    // 默认配置填key后，首页与原生对话均保留可访问的优化菜单入口。
    await 检查优化入口(page)

    const 输入 = page.getByPlaceholder(/输入问题/)
    await 输入.fill("请说一句话")
    await 输入.press("Enter")
    // 等的是只有对话态才有的东西（不是输入框）
    await expect(page.locator(".conv-title")).toBeVisible()
    // 假模型回了话 = 这段会话走的是 native 链路；走 claude CLI 的话这里是「找不到 claude」
    await expect(page.locator(".conversation")).toContainText("假模型已应答", { timeout: 30_000 })
    await 检查优化入口(page)

    const agentId = await page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: Array<{ projectId: string }> }> } }
      const projects = (await w.dawn.invoke("listProjects", {})).data ?? []
      const sessions = (await w.dawn.invoke("listSessions", { projectId: projects[0]!.projectId })).data as unknown as Array<{ agentId: string }>
      return sessions[0]?.agentId
    })
    expect(agentId).toBe("deepseek")
  })
})


test.describe("首启向导 · 混合协议目录", () => {
  test.use({ dawnOptions: { showSetup: true, providersYaml: DEFAULT_CONFIG_YAML + '\nproviders:\n  fireworks:\n    baseUrl: "{{MOCK_URL}}"\n' } })

  test("自动协议按所选目录模型检测、保存并对话", async ({ dawn }) => {
    const { page } = dawn
    await 到模型页(page)
    const wizard = page.locator(".setup-wizard")
    await wizard.getByLabel("服务商", { exact: true }).selectOption("fireworks")
    const model = await page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { endpointDefaults?: Record<string, { modelDefaults?: Record<string, { api: string }> }> } }> } }
      const metadata = (await w.dawn.invoke("listKnownProviders", {})).data?.endpointDefaults?.fireworks?.modelDefaults ?? {}
      const entries = Object.entries(metadata)
      if (!entries.some(([, value]) => value.api === "anthropic-messages")) throw new Error("测试需要混合协议目录")
      return entries.find(([, value]) => value.api === "openai-completions")?.[0]
    })
    expect(model).toBeTruthy()
    await wizard.getByLabel("连接模型", { exact: true }).fill(model!)
    await wizard.getByLabel("API key", { exact: true }).fill("sk-test")
    await wizard.getByRole("button", { name: "测试连通", exact: true }).click()
    await expect(wizard.locator(".svc-test-ok")).toContainText(model!)
    await wizard.getByRole("button", { name: "保存", exact: true }).click()
    await expect(wizard).toContainText("已填 fireworks")
    await expect(wizard.locator(".caveat")).toHaveCount(0)
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await page.getByPlaceholder(/输入问题/).fill("请说一句话")
    await page.getByPlaceholder(/输入问题/).press("Enter")
    await expect(page.locator(".conversation")).toContainText("假模型已应答")
    for (const request of [...dawn.keyChecks, dawn.requests[0]] as { url: string; body: { model: string } }[]) {
      expect(request.body.model).toBe(model)
      expect(request.url).toMatch(/^\/v1\/chat\/completions/)
    }
  })
})
