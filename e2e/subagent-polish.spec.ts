/** 只替换推理，真实子进程读取不存在的文件，验证失败明示及窄栏几何。 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

const missing = `missing-${"long-name-".repeat(18)}.md`
const title = "数据质量与可重复性审计专家".repeat(8)
const task = `子任务：${"核对文件来源与固定参数，并保留失败详情。".repeat(24)}`
test.use({dawnOptions: {gitInit: true, toolCall: [{
  toolName: "subagent", when: "派子agent", args: {agent: "data-auditor", task},
}, {
  toolName: "read", when: "子任务", args: {path: missing}, say: "核对一份路径很长的参考文件。",
}]}})
test("280px 子面板保留失败详情、完整长参数与复制入口", async ({dawn}) => {
  const {page, workspace} = dawn
  const agents = join(workspace, ".dawn/agents"); mkdirSync(agents, {recursive: true})
  writeFileSync(join(agents, "data-auditor.md"), `---\nname: data-auditor\ntitle: ${title}\ndescription: 面板验收角色\ntools: read\n---\n只读核对。\n`)
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill("派子agent看看这个仓库")
  await page.getByRole("button", {name: "发送", exact: true}).click()
  const chip = page.locator("main.main .chip-group .chip").first()
  await expect(chip).toHaveAttribute("data-status", "ok", {timeout: 60_000})
  await chip.click()
  const pane = page.locator(".subagent-pane")
  await expect(pane.locator(".subagent-title")).toHaveText(title)
  await page.locator(".body").evaluate(el => (el as HTMLElement).style.setProperty("--dawn-dock-w", "280px"))
  const failed = pane.locator('.tool[data-tool-name="read"][data-status="error"]')
  await expect(failed.locator(".tool-head")).toHaveAttribute("aria-expanded", "true")
  await expect(failed.locator(".tool-input")).toContainText(missing)
  await expect(failed.locator(".tool-result")).toContainText("ENOENT")
  await expect(failed.getByRole("button", {name: "复制这段输出", exact: true})).toBeVisible()
  await expect(pane.getByRole("textbox", {name: "接着问它"})).toBeInViewport()
  await failed.locator(".tool-head").click()
  await expect(failed.locator(".tool-head")).toContainText("读取文件")
  expect(await pane.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await pane.locator(".subagent-task > summary").click()
  await expect(pane.locator(".subagent-task .md")).toHaveText(task)
  await expect(pane.getByRole("textbox", {name: "接着问它"})).toBeInViewport()
  await pane.locator(".subagent-task > summary").click()
  await failed.locator(".tool-head").click()
  const dir = join(process.cwd(), "tmp/subagent-polish"); mkdirSync(dir, {recursive: true})
  await pane.screenshot({path: join(dir, "panel-error-280.png")})
})
