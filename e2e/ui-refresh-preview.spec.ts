import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞, 进设置 } from "./fixtures.js"

const shots = "tmp/ui-refresh-verification/after"
const points = Array.from({ length: 32 }, (_, i) => {
  const x = 62 + i * 11
  const y = 300 - i * 5 + Math.sin(i * 2.1) * 39
  return `<circle cx="${x}" cy="${y}" r="4" fill="#208a7b" opacity=".8"/>`
}).join("")
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="440" viewBox="0 0 480 440"><rect width="480" height="440" fill="white"/><g font-family="Arial" fill="#18232b"><text x="240" y="35" text-anchor="middle" font-size="19">Soil pH and microbial diversity</text><g stroke="#e7ecef">${[0,1,2,3,4].map(i=>`<path d="M60 ${90+i*60}H430M${60+i*90} 75V350"/>`).join("")}</g><path d="M60 75V350H430" fill="none" stroke="#46515b"/><path d="M60 330L420 120L420 170L60 350Z" fill="#208a7b" opacity=".1"/><path d="M60 340L420 145" stroke="#208a7b" stroke-width="2"/>${points}<text x="240" y="395" text-anchor="middle" font-size="15">Soil pH</text><text transform="translate(24 225) rotate(-90)" text-anchor="middle" font-size="15">Shannon diversity</text><text x="410" y="425" text-anchor="end" font-size="11" fill="#87949d">Illustrative data</text></g></svg>`

test.use({ dawnOptions: { fakeSsh: true, reply: "## 分析已完成\n\n已检查数据，并绘制 pH 与 Shannon 多样性的关系图。图表、分析脚本和结果说明已保存。\n\n- **数据检查**：字段类型、缺失值与样本分布\n- **关系分析**：散点分布与拟合趋势\n- **结果整理**：图表、脚本与分析说明", toolCall: [
  { toolName: "write", args: { path: "outputs/ph_shannon.svg", content: svg } },
  { toolName: "write", args: { path: "outputs/analysis.R", content: '# Example analysis\nlibrary(ggplot2)\nggplot(data, aes(pH, Shannon)) + geom_point() + geom_smooth(method="lm")\n' } },
  { toolName: "write", args: { path: "outputs/README.md", content: "# Analysis outputs\n\nIllustrative data for UI verification.\n" } },
] } })

async function assertNavigationAccent(page: import("@playwright/test").Page) {
  const colors = await page.locator(".sidebar").evaluate(el => {
    const probe = document.createElement("span")
    probe.style.color = "var(--dawn-accent)"
    el.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return { accent, icons: Array.from(el.querySelectorAll(
      ".side-section-icon, .proj-head .row-icon, .server-navigation .side-subhead > svg:not(.twisty), .side-bottom .row-icon"
    )).map(icon => getComputedStyle(icon).color) }
  })
  expect(colors.icons.length).toBeGreaterThanOrEqual(6)
  expect(new Set(colors.icons)).toEqual(new Set([colors.accent]))
  await expect(page.locator(".session-tab-wrap.current .session-tab-dot")).toHaveCSS("background-color", colors.accent)
}

test("完整分析界面：多尺寸、暗色、自选强调色与真实图像预览", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(shots, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 808 })
  const suggestions = (await page.locator(".welcome .openers").boundingBox())!
  const composer = (await page.locator(".welcome > .composer").boundingBox())!
  expect(suggestions.y + suggestions.height).toBeLessThanOrEqual(composer.y)
  expect((await page.locator(".openers button").first().boundingBox())!.height).toBeLessThanOrEqual(80)
  // 展示未聚焦、未悬停的常驻外框，不能只截输入时的聚焦环。
  await page.getByRole("heading", { name: "今天想分析什么？", exact: true }).click()
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/local-new-task.png` })
  await page.setViewportSize({ width: 1440, height: 900 })
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "添加服务器", exact: true }).click()
  await page.locator("#conn-label").fill("生态分析服务器")
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const box = page.locator("main.main textarea")
  await box.fill("分析土壤 pH 与 Shannon 多样性的关系，并生成图表和分析脚本。")
  await box.press("Enter")
  await expect(page.getByRole("group", { name: "本轮生成的文件" }).last()).toContainText("已生成 3 个文件", { timeout: 60_000 })
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await page.evaluate(async () => {
    await (window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<unknown> } }).dawn.invoke("setCredential", { providerId: "deepseek", secret: "isolated-ui-mock-key" })
    const api = (window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }).dawn
    const tasks = (await api.invoke("listTasks", {})).data as Array<{ sessionId: string }>
    await api.invoke("renameSession", { sessionId: tasks[0]!.sessionId, title: "环境因子与多样性" })
  })
  // 通过真实任务协议补齐导航层级，样例仅存在于本用例的隔离配置/目录。
  const projectPaths = ["土壤微生物分析", "实验数据整理"].map(name => join(workspace, "..", name))
  projectPaths.forEach(path => mkdirSync(path, { recursive: true }))
  await page.evaluate(async paths => {
    const api = (window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }).dawn
    for (const workspace of paths) await api.invoke("createTask", { agentId: "ds-chat", workspace })
    for (const title of ["样本数据检查", "群落组成可视化"]) {
      const result = await api.invoke("createTask", { agentId: "ds-chat" })
      const task = result.data as { sessionId: string }
      await api.invoke("renameSession", { sessionId: task.sessionId, title })
    }
  }, projectPaths)
  await page.reload()
  const project = page.locator(".proj-item").filter({ has: page.getByText("workspace", { exact: true }) })
  await expect(project).toBeVisible()
  if (await project.locator(".proj-session-list").count() === 0) await project.locator(".proj-head > .row").click()
  await project.locator(".proj-session-list .sess-item .row").first().click()
  const recent = page.locator(".side-section-secondary .side-section-toggle").filter({ hasText: "最近" })
  if (await recent.getAttribute("aria-expanded") === "false") await recent.click()
  // 文件夹保留分级；文件夹内会话与最近列表使用同一条左缘。
  const hierarchy = await project.evaluate(el => {
    const left = (node: Element) => node.getBoundingClientRect().left
    const section = document.querySelector('.side-section-primary')!
    return {
      sectionArrow: left(section.querySelector('.twisty')!),
      folderArrow: left(el.querySelector('.proj-head .twisty')!),
      sectionTitle: left(section.querySelector('.side-section-title')!),
      folderTitle: left(el.querySelector('.proj-head .sess-title')!),
      taskTitle: left(el.querySelector('.proj-session-list .sess-title')!),
      recentTitle: left(document.querySelector('.recent-list .sess-title')!),
    }
  })
  expect(hierarchy.folderArrow - hierarchy.sectionArrow).toBeGreaterThanOrEqual(8)
  expect(hierarchy.folderTitle - hierarchy.sectionTitle).toBeGreaterThanOrEqual(8)
  expect(Math.abs(hierarchy.taskTitle - hierarchy.recentTitle)).toBeLessThanOrEqual(1)
  // 同级分区的数量不能跟字号/标题长短漂移；多选与添加共享尾列中心。
  // 刚展开最近时三角仍在旋转；等现有过渡结束，避免把动画中间帧当作错位。
  await page.locator('.side-section-toggle .twisty').evaluateAll(async nodes => {
    await Promise.all(nodes.flatMap(node => node.getAnimations()).map(animation => animation.finished.catch(() => {})))
  })
  const headers = await page.locator('.sidebar .side-section[data-section]').evaluateAll(nodes => nodes.map(node => {
    const left = (selector: string) => node.querySelector(selector)!.getBoundingClientRect().left
    const action = node.querySelector('.server-add, .side-bulk')?.getBoundingClientRect()
    return { arrow: left('.twisty'), icon: left('.side-section-icon'), title: left('.side-section-title'), count: left('.side-section-count'), action: action ? action.left + action.width / 2 : undefined }
  }))
  expect(headers).toHaveLength(4)
  for (const column of ['arrow', 'icon', 'title', 'count', 'action'] as const) {
    const values = headers.map(h => h[column]).filter((n): n is number => n !== undefined)
    expect(Math.max(...values) - Math.min(...values), `${column}: ${JSON.stringify(headers)}`).toBeLessThanOrEqual(1)
  }
  await assertNavigationAccent(page)
  const projectName = page.locator(".proj-head .sess-title").filter({ hasText: "土壤微生物分析" })
  expect(await projectName.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await expect(page.locator(".statusbar .caveat")).toHaveCount(0)
  await page.getByRole("group", { name: "本轮生成的文件" }).last().getByRole("button", { name: "查看产物", exact: true }).click()
  await expect(page.locator(".preview img")).toBeVisible()
  await expect(page.locator(".artifacts-compact li")).toHaveCount(3)
  for (const [width, height] of [[1080,808],[1280,800],[1440,900],[1586,992],[1920,1080]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await expect(page.locator(".composer-footer").first()).toBeVisible()
    expect(await page.locator(".composer-footer").first().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const turns = page.locator("main.main .turns-inner").locator("..")
    await turns.evaluate(el => { el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }) })
    await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/analysis-${width}.png` })
    if (width === 1586) {
      await turns.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }))
      await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/analysis-1586-top.png` })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  const sash = page.getByRole("separator", { name: "调整侧栏宽度", exact: true })
  await sash.focus()
  for (let i = 0; i < 3; i++) await sash.press("ArrowLeft")
  await expect(sash).toHaveAttribute("aria-valuenow", "200")
  await expect.poll(() => page.locator(".sidebar").evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(200)
  // 最窄侧栏下主入口及常驻操作仍在栏内；名称可以省略，但操作不能被裁掉。
  const sidebarRight = await page.locator(".sidebar").evaluate(el => el.getBoundingClientRect().right)
  for (const button of await page.locator(".proj-head .row-actions button, .side-section .side-bulk, .server-bulk, .server-add, .server-menu-anchor > button, .server-new").all()) {
    const bounds = (await button.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(sidebarRight + 1)
  }
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/sidebar-200.png` })
  const projectActions = project.getByRole("button", { name: "项目操作：workspace", exact: true })
  await projectActions.click()
  const menu = page.getByRole("menu", { name: "项目操作：workspace", exact: true })
  const menuBounds = (await menu.boundingBox())!
  expect(menuBounds.x).toBeGreaterThanOrEqual(0)
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(1440)
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(900)
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/project-menu-200.png` })
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(projectActions).toBeFocused()
  for (let i = 0; i < 3; i++) await sash.press("ArrowRight")
  await expect(sash).toHaveAttribute("aria-valuenow", "248")
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
  await assertNavigationAccent(page)
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/analysis-dark.png` })
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "亮色", exact: true }).click()
  const color = page.getByRole("textbox", { name: "颜色值，可输入 HEX 或 RGB", exact: true })
  await color.fill("#7564b1")
  await color.press("Enter")
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await assertNavigationAccent(page)
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/analysis-custom-accent.png` })

})
