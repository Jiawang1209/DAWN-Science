import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"
type RecordedRequest = {body: {messages?: {role: string; content: unknown}[]}}

test.use({dawnOptions: {gitInit: true}})
test("真实主会话派单 → 子资源查询可见 → 续问刷新 → 重启恢复", async ({dawn}) => {
  const {page, workspace} = dawn
  const skill = join(workspace, ".dawn/skills/resource-fixture"); mkdirSync(skill, {recursive: true})
  writeFileSync(join(skill, "SKILL.md"), "---\nname: resource-fixture\ndescription: 资源验收技能\n---\nCHILD_SKILL_EVIDENCE：参数集中并记录随机种子")
  const memory = join(workspace, ".dawn/memory"); mkdirSync(memory, {recursive: true})
  writeFileSync(join(memory, "KEY.md"), "[branch:main,master] 固定参数 CHILD_MEMORY_EVIDENCE：种子 42\n")
  await 在项目里开会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("派子agent查资源")
  await page.getByRole("button", {name: "发送", exact: true}).click()
  const chip = page.locator("main.main .chip-group .chip").first()
  await expect(chip).toHaveAttribute("data-status", "ok", {timeout: 60_000})
  await expect(page.locator("main.main").getByRole("button", {name: "停止", exact: true})).toHaveCount(0)
  await chip.click()
  const pane = page.locator(".subagent-pane")
  await expect(pane.locator(".tool-head").filter({hasText: "resource_"})).toHaveCount(4)
  const requests = (dawn.requests as RecordedRequest[]).filter(r => r.body.messages?.some(m => m.role === "user" && JSON.stringify(m.content).includes("子资源验收：")))
  expect(requests.length).toBeGreaterThanOrEqual(5)
  expect(JSON.stringify(requests[0]!.body.messages)).not.toContain("CHILD_SKILL_EVIDENCE")
  expect(JSON.stringify(requests[0]!.body.messages)).not.toContain("CHILD_MEMORY_EVIDENCE")
  expect(JSON.stringify(requests.at(-1)!.body.messages)).toContain("CHILD_SKILL_EVIDENCE")
  expect(JSON.stringify(requests.at(-1)!.body.messages)).toContain("CHILD_MEMORY_EVIDENCE")
  writeFileSync(join(memory, "KEY.md"), "固定参数 CHILD_REFRESHED_EVIDENCE：种子 17\n")
  await pane.getByRole("textbox", {name: "接着问它"}).fill("子资源验收：续问刷新")
  await pane.getByRole("button", {name: "接着问", exact: true}).click()
  await expect(pane.locator(".tool-head").filter({hasText: "resource_"})).toHaveCount(8)
  await expect.poll(() => JSON.stringify((dawn.requests as RecordedRequest[]).at(-1)?.body.messages)).toContain("CHILD_REFRESHED_EVIDENCE")
  const screenshotDir = join(process.cwd(), "tmp/child-resources"); mkdirSync(screenshotDir, {recursive: true})
  await page.screenshot({path: join(screenshotDir, "electron-resource-tools.png")})
  const restored = await dawn.重开()
  await restored.getByRole("button", {name: /^派子agent查资源/}).click()
  await restored.locator("main.main .chip-group .chip").first().click()
  await expect(restored.locator(".subagent-pane .tool-head").filter({hasText: "resource_"})).toHaveCount(8)
})
