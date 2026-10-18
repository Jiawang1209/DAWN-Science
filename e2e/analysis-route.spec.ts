/** Real runtime/book/MCP/write/IPC and true app restart; mock inference proves engineering only. */
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { join } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"
let mcp: ChildProcess | undefined
let port = 0
test.beforeAll(async () => {
  port = await new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, () => {
      const value = (server.address() as { port: number }).port
      server.close(() => resolve(value))
    })
  })
  mcp = spawn(process.execPath, [join(process.cwd(), "scripts/mcp-test-server.mjs")], {
    env: { ...process.env, DAWN_MCP_HTTP_PORT: String(port), DAWN_MCP_TEST_LEGACY_MLAI: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("MCP startup timeout")), 5000)
    mcp!.stderr?.on("data", (data) => {
      if (String(data).includes("streamable HTTP 起在")) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
})
test.afterAll(() => {
  mcp?.kill()
})
test.use({
  dawnOptions: async ({}, use) => {
    await use({
      providersYaml: `mcp:
  mlai-science:
    url: http://127.0.0.1:${port}/mcp
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

test("真实路线：摘要不自动开坞、选择不发模型、只读查看检索、单步交付预览、历史和重启", async ({ dawn }) => {
  test.setTimeout(120_000)
  let page = dawn.page
  await 在项目里开会话(page)
  const report = join(dawn.workspace, "results/reports/analysis-route-S1.md")
  const send = async (message: string) => {
    await page.getByPlaceholder(/今天帮你做些什么/).fill(message)
    await page.getByPlaceholder(/今天帮你做些什么/).press("Enter")
  }
  await send("演示分析路线：请先规划，不开始分析")
  await expect(page.locator(".analysis-route-summary")).toContainText("0 / 3")
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0)
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await page.locator(".analysis-route-summary").click()
  const pane = () => page.locator(".analysis-route-pane")
  await expect(pane()).toContainText("Alpha多样性分析测试案例")
  await expect(pane().getByRole("button", { name: "选为参考", exact: true })).toBeEnabled()
  const composer = page.locator("main.main .composer-field")
  // Suggestions are real, tool-free model requests scheduled after the turn.
  // Finish that visible UI state before freezing the unfiltered request count.
  await expect(composer).toHaveAttribute("data-ghost", "true")
  const count = dawn.requests.length
  await pane().getByRole("button", { name: "选为参考", exact: true }).click()
  await expect(pane().getByRole("button", { name: "已选参考", exact: true })).toBeDisabled()
  expect(dawn.requests.length).toBe(count)
  for (const label of ["查看步骤", "补找案例"]) {
    await pane().getByRole("button", { name: label, exact: true }).click()
    await expect(pane().getByRole("button", { name: "继续这一步", exact: true })).toBeEnabled()
    expect(existsSync(report)).toBe(false)
  }
  await expect(page.locator(".turn.user").last()).toContainText("S1")
  await expect(page.locator(".turn.user").last()).not.toContainText("analysis_route_action")
  await composer.fill("保留的待发草稿")
  await pane().getByRole("button", { name: "继续这一步", exact: true }).click()
  await expect(page.locator(".analysis-route-summary")).toContainText("1 / 3")
  await expect.poll(() => existsSync(report)).toBe(true)
  await expect(page.locator("main.main").getByText(/已生成 1 个文件/).last()).toBeVisible()
  await expect(page.locator("main.main")).not.toContainText("产出未知")
  expect(readFileSync(report, "utf8")).toContain("未运行科研代码")
  expect(existsSync(join(dawn.workspace, "results/reports/analysis-route-S2.md"))).toBe(false)
  await pane().getByRole("button", { name: "results/reports/analysis-route-S1.md", exact: true }).click()
  await expect(pane().locator(".route-file-preview")).toContainText("分析路线工程演示")
  await pane().getByRole("button", { name: "展开阅读", exact: true }).click()
  await expect(pane().locator(".route-deliverables")).toBeHidden()
  await pane().getByRole("button", { name: "还原", exact: true }).click()
  await expect(pane().locator(".route-deliverables")).toBeVisible()
  await pane().getByRole("button", { name: "收起预览", exact: true }).click()
  await expect(pane().locator(".route-file-preview")).toHaveCount(0)
  const second = pane()
    .locator(".route-step")
    .filter({ has: page.locator(".route-step-id", { hasText: "S2" }) })
  if ((await second.getByRole("button", { name: /S2/ }).getAttribute("aria-expanded")) !== "true")
    await second.getByRole("button", { name: /S2/ }).click()
  await composer.fill("")
  await expect(composer).toHaveAttribute("data-ghost", "true")
  const metadataCount = dawn.requests.length
  await second.getByRole("button", { name: "跳过此步", exact: true }).click()
  await expect(second.getByRole("button", { name: "恢复此步", exact: true })).toBeEnabled()
  await second.getByRole("button", { name: "恢复此步", exact: true }).click()
  await expect(second.getByRole("button", { name: "跳过此步", exact: true })).toBeEnabled()
  await expect(composer).toHaveAttribute("data-ghost", "true")
  expect(dawn.requests.length, JSON.stringify(dawn.requests.slice(metadataCount))).toBe(metadataCount)
  const versions = pane().getByRole("combobox", { name: "路线版本" })
  await expect.poll(() => versions.locator("option").count()).toBeGreaterThan(2)
  const historical = await versions.locator("option").nth(1).getAttribute("value")
  await versions.selectOption(historical!)
  await expect(pane()).toContainText("历史版本只读")
  await expect(pane().getByRole("button", { name: "继续这一步", exact: true })).toHaveCount(0)
  page = await dawn.重开()
  const project = page.locator(".proj-list .proj-item").first()
  await expect(project).toBeVisible()
  if ((await project.locator(".proj-session-list").count()) === 0) await project.locator(".row").first().click()
  await project.locator(".proj-session-list .sess-item .row").first().click()
  await expect(page.locator(".analysis-route-summary")).toContainText("1 / 3")
  await page.locator(".analysis-route-summary").click()
  await expect(pane().locator(".route-deliverables")).toContainText("观察到工具生成")
  await pane().locator(".route-step").first().getByRole("button", { name: /S1/ }).click()
  await expect(pane()).toContainText("已选参考")
  await pane().getByRole("button", { name: "results/reports/analysis-route-S1.md", exact: true }).click()
  await expect(pane().locator(".route-file-preview")).toContainText("未运行科研代码")
})

test("无路线入口只发送规划意图；步骤依赖阻塞且允许本地展开", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "路线")
  await expect(page.locator(".right-dock")).toContainText("先描述需求，再建立路线")
  await page.getByRole("button", { name: "建立分析路线", exact: true }).click()
  await expect(page.locator(".analysis-route-summary")).toContainText("0 / 3")
  await expect(page.locator(".turn.user").last()).toContainText("本请求不批准执行")
  const pane = page.locator(".analysis-route-pane")
  const third = pane.locator(".route-step").filter({ has: page.locator(".route-step-id", { hasText: "S3" }) })
  await third.getByRole("button", { name: /S3/ }).click()
  await expect(third).toContainText("前置步骤 S2 尚未交付")
  await expect(third.getByRole("button", { name: "继续这一步", exact: true })).toBeDisabled()
  expect(existsSync(join(dawn.workspace, "results/reports/analysis-route-S1.md"))).toBe(false)
})
