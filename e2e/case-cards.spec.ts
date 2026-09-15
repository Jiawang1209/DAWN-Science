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
    env: { ...process.env, DAWN_MCP_HTTP_PORT: String(端口) },
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
test.afterAll(() => {
  子进程?.kill()
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
    model: deepseek-v4-flash
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
