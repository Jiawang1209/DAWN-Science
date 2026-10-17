/**
 * 案例卡片（2026-09-15）。**跑真实构建产物。**
 *
 * 作者：*「能否每一个案例，不要显示是链接形式的，而是……一个一个真实内容的效果呢？」*
 * 以及：*「后续让 agent 学习和模仿哪个具体案例，其实也应该是我们来进行选取的。」*
 *
 * 第二版（数据从工具返回里取）：真机上模型没读技能、没附清单，卡片就没出。所以这里**不给模型任何格式**——
 * 假模型只是调一次 `mlai-science__search_cases`，回复里用平常的写法提到两篇（其中一篇 id 截短）。
 * `mlai-science` 是 `scripts/mcp-test-server.mjs` 以 HTTP 起的那台，同一台服务兼当图廊（封面 png、详情页），
 * 封面走的是真的「主进程去本机地址取图 → data URL」那条路。
 */
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { join } from "node:path"
import { mkdirSync, readFileSync } from "node:fs"
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

let 子进程: ChildProcess | undefined
let 端口 = 0

test.beforeAll(async () => {
  端口 = await new Promise<number>((res) => {
    const s = createServer()
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port
      s.close(() => res(p))
    })
  })
  子进程 = spawn(process.execPath, [join(process.cwd(), "scripts", "mcp-test-server.mjs")], {
    env: { ...process.env, DAWN_MCP_HTTP_PORT: String(端口), DAWN_MCP_TEST_LEGACY_MLAI: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  })
  await new Promise<void>((res, rej) => {
    const 超时 = setTimeout(() => rej(new Error("假 MCP 服务器 5 秒内没起来")), 5000)
    子进程!.stderr?.on("data", (b) => {
      if (String(b).includes("streamable HTTP 起在")) {
        clearTimeout(超时)
        res()
      }
    })
  })
})

test.describe("大结果标题案例卡片", () => {
  test.use({
    dawnOptions: async ({}, use) => {
      await use({
        toolCall: { toolName: "mlai-science__search_cases", args: { query: "large-case-cards" } },
        providersYaml: `mcp:
  mlai-science:
    url: http://127.0.0.1:${端口}/mcp
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat]
`,
      })
    },
  })

  test("超预算结果、只写标题：封面与选择可用，真正重启后仍显示", async ({ dawn }) => {
    await 开一段临时会话(dawn.page, "大结果标题案例卡片")
    await 等进了对话(dawn.page)
    const cards = dawn.page.locator(".case-card")
    await expect(cards).toHaveCount(2, { timeout: 30_000 })
    await expect(cards.nth(0)).toContainText("网络布局浅览")
    await expect(cards.nth(1)).toContainText("无缝对接WGCNA")
    await expect(cards.locator("img.case-cover")).toHaveCount(2)
    await expect.poll(async () => cards.locator("img").evaluateAll((images) => images.every((x) => (x as HTMLImageElement).naturalWidth > 0))).toBe(true)
    // 验的是原来的截断链路确实被触发，而非把预算加大绕过去。
    const process = dawn.page.locator(".completed-process-head")
    if (await process.getAttribute("aria-expanded") === "false") await process.click()
    await expect(process).toHaveAttribute("aria-expanded", "true")
    await dawn.page.locator(".tool-head").click()
    await expect(dawn.page.locator(".tool-spill")).toContainText("已截断")
    await process.click()
    mkdirSync("artifacts/case-cards", { recursive: true })
    await dawn.page.mouse.move(1100, 35)
    await dawn.page.locator(".case-cards").scrollIntoViewIfNeeded()
    await dawn.page.screenshot({ path: "artifacts/case-cards/live-light.png" })
    await cards.nth(0).locator(".case-open").click()
    await expect.poll(async () => (await 视图(dawn.app))?.url ?? "").toContain("/gallery/case/20251016-network-layout")
    const page = await dawn.重开()
    await page.locator(".session-list .sess-item .row").first().click()
    const restored = page.locator(".case-card")
    await expect(restored).toHaveCount(2, { timeout: 30_000 })
    await expect(restored.locator("img.case-cover")).toHaveCount(2)
    await expect.poll(async () => restored.locator("img").evaluateAll((images) => images.every((x) => (x as HTMLImageElement).naturalWidth > 0))).toBe(true)
    await page.mouse.move(1100, 35)
    await page.locator(".case-cards").scrollIntoViewIfNeeded()
    await page.screenshot({ path: "artifacts/case-cards/restored-light.png" })
    await restored.nth(1).getByRole("button", { name: "照这篇做", exact: true }).click()
    await expect(page.locator(".turn.user").last()).toContainText("case_id: 20250825-network-wgcna")
  })
})
test.afterAll(() => {
  子进程?.kill()
})

test.describe("科研分析向导的路线与卡片接线", () => {
  test.use({
    dawnOptions: async ({}, use) => {
      await use({
        toolCall: [
          { toolName: "mlai-science__search_cases", args: { query: "guide-alpha" } },
          { toolName: "mlai-science__search_cases", args: { query: "guide-beta" } },
        ],
        providersYaml: `mcp:
  mlai-science:
    url: http://127.0.0.1:${端口}/mcp
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat]
`,
      })
    },
  })

  test("两步查询产生对应卡片，选择回传完整 ID，技能引用随构建发布", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("/skill:analyze-like-case 科研分析路线验收：已有ASV表，请先给路线和案例，暂不运行")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    const cards = page.locator(".case-card")
    await expect(cards).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator(".turn.agent")).toContainText("S1")
    await expect(page.locator(".turn.agent")).toContainText("S2")
    const route = page.locator(".turn.agent table")
    await expect(route.getByRole("row")).toHaveCount(3)
    await expect(route.getByRole("row").nth(1)).toContainText("S1")
    await expect(route.getByRole("row").nth(1)).toContainText("C1")
    await expect(route.getByRole("row").nth(2)).toContainText("S2")
    await expect(route.getByRole("row").nth(2)).toContainText("C2")
    await expect(cards.nth(0)).toContainText("Alpha多样性分析测试案例")
    await expect(cards.nth(1)).toContainText("Beta多样性分析测试案例")
    await expect.poll(async () => cards.locator("img").evaluateAll((images) => images.length === 2 && images.every((x) => (x as HTMLImageElement).naturalWidth > 0))).toBe(true)
    const requests = JSON.stringify(dawn.requests)
    expect(requests).toContain("guide-alpha")
    expect(requests).toContain("guide-beta")
    expect(requests).toContain("references/comprehensive-analysis.md")
    const reference = "skills/analyze-like-case/references/comprehensive-analysis.md"
    expect(readFileSync(join(process.cwd(), "dist", reference), "utf8")).toBe(readFileSync(join(process.cwd(), reference), "utf8"))
    mkdirSync("artifacts/research-guide", { recursive: true })
    await page.mouse.move(1100, 35)
    await route.screenshot({ path: "artifacts/research-guide/route-table.png" })
    await page.locator(".case-cards").screenshot({ path: "artifacts/research-guide/route-cards.png" })
    await cards.nth(1).getByRole("button", { name: "照这篇做", exact: true }).click()
    await expect(page.locator(".turn.user").last()).toContainText("case_id: 20251017-e2e-beta-diversity")
  })
})

async function 视图(app: import("@playwright/test").ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/dist/ui/"))
    const kid = w?.contentView.children.find(
      (c) => (c as unknown as { webContents?: unknown }).webContents !== undefined,
    ) as unknown as { webContents: { getURL(): string } } | undefined
    return kid ? { url: kid.webContents.getURL() } : undefined
  })
}

test.describe("案例卡片", () => {
  test.use({
    dawnOptions: async ({}, use) => {
      await use({
        toolCall: { toolName: "mlai-science__search_cases", args: { query: "热图" } },
        providersYaml: `mcp:
  mlai-science:
    url: http://127.0.0.1:${端口}/mcp
agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat]
`,
      })
    },
  })

  test("**工具查到的、正文提到的才出卡；封面真的显示；点卡片右侧开详情；「照这篇做」替你发出带 case_id 的话**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "给我几个案例卡片")
    await 等进了对话(page)

    const 卡们 = page.locator(".case-card")
    // 工具回了三篇，正文只提到两篇（其中一篇是截短的 id）→ 两张卡，按正文里的先后
    await expect(卡们).toHaveCount(2, { timeout: 60_000 })
    await expect(卡们.nth(0)).toContainText("R包DESeq2作差异基因分析")
    await expect(卡们.nth(1)).toContainText("Python Mantel 蝴蝶状热图")
    await expect(page.locator(".case-card", { hasText: "没有被提到的那一篇" })).toHaveCount(0)

    const 封面 = 卡们.nth(0).locator("img.case-cover")
    await expect(封面).toHaveAttribute("src", /^data:image\/png;base64,/, { timeout: 15_000 })
    expect(await 封面.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)

    await 卡们.nth(0).locator(".case-open").click()
    await expect
      .poll(async () => (await 视图(app))?.url ?? "", { timeout: 30_000 })
      .toContain("/gallery/case/e2e-deseq2-full-id")

    const 选 = 卡们.nth(1).getByRole("button", { name: "照这篇做", exact: true })
    await expect(选).toBeVisible()
    expect(await 选.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await 选.click()
    await expect(page.locator(".turn.user").last()).toContainText("case_id: 20251019-xacaaee-python-mantel-butterfly", {
      timeout: 15_000,
    })
  })
})
