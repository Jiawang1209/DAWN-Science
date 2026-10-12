import { test, expect, 在项目里开会话, 开一段临时会话 } from "./fixtures.js"
import type { Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const shots = "tmp/ui-refresh-verification/checkpoint-a"
test.use({ dawnOptions: { fakeSsh: true } })
async function invoke(page: Page, op: string, req: Record<string, unknown> = {}) {
  return page.evaluate(async ({ op, req }) => {
    return (window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }).dawn.invoke(op, req)
  }, { op, req })
}
async function add(page: Page, secret = "dawn", label = "生态分析服务器") {
  await page.getByRole("button", { name: "添加服务器", exact: true }).click()
  await page.locator("#conn-label").fill(label)
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-secret").fill(secret)
}
test("本机空态、添加并连接、远端新会话三条路径互不混淆", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  await invoke(page, "setCredential", { providerId: "deepseek", secret: "isolated-ui-mock-key" })
  await page.reload()
  await expect(page.locator(".statusbar .caveat")).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator(".app-shell")).toBeVisible()
  await page.getByRole("button", { name: "新建任务", exact: true }).click()
  await expect(page.locator(".empty-conv textarea")).toBeVisible()
  const before = await invoke(page, "listTasks")
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/local-new-task.png` })
  await add(page)
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/add-server.png` })
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "添加服务器", exact: true })).toHaveCount(0)
  const server = page.locator(".remote-row").filter({ hasText: "生态分析服务器" })
  await expect(server).toHaveAttribute("data-state", "ready")
  expect(await invoke(page, "listTasks")).toEqual(before)
  await expect(page.locator(".empty-conv textarea")).toBeVisible()
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/connected-server.png` })
  await server.getByRole("button", { name: "新建远端任务", exact: true }).click()
  await expect(page.locator(".conv-remote")).toContainText("生态分析服务器")
  await expect(server.locator(".server-session-list .sess-item")).toHaveCount(1)
  await page.getByRole("button", { name: "工作目录：/home/dawn", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "工作目录", exact: true })).toContainText("/home/dawn")
  await expect(page.getByRole("button", { name: "另选文件夹…", exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/remote-new-session.png` })
  await page.getByRole("button", { name: "新建任务", exact: true }).click()
  await expect(page.locator(".empty-conv textarea")).toBeVisible()
  await expect(page.locator(".conv-remote")).toHaveCount(0)
  const box = page.locator(".empty-conv textarea")
  await box.fill("本机分析测试")
  await box.press("Enter")
  await expect(page.locator(".turns")).toContainText("本机分析测试")
  await expect(page.locator(".conv-remote")).toHaveCount(0)
  const tasks = (await invoke(page, "listTasks")).data as { connectionId?: string; title?: string }[]
  expect(tasks.filter(t => t.connectionId)).toHaveLength(1)
  expect(tasks.filter(t => !t.connectionId)).toHaveLength(1)
})
test("保存后认证失败重试复用服务器ID；连接不会新建任务", async ({ dawn }) => {
  const { page } = dawn
  await add(page, "wrong-password")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "添加服务器", exact: true })
  await expect(dialog.getByRole("alert")).toContainText(/认证|authentication|密码|口令/i)
  const first = (await invoke(page, "listConnections")).data as { id: string }[]
  expect(first).toHaveLength(1)
  await page.locator("#conn-secret").fill("dawn")
  await dialog.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const next = (await invoke(page, "listConnections")).data as { id: string }[]
  expect(next.map(c => c.id)).toEqual(first.map(c => c.id))
  await expect(page.locator(".remote-row")).toHaveCount(1)
  expect((await invoke(page, "listTasks")).data).toEqual([])
})

test("取消失败弹窗保留连接与本机草稿，远端失败无本机回退", async ({ dawn }) => {
  const { page } = dawn
  await page.setViewportSize({ width: 1280, height: 800 })
  const box = page.locator(".empty-conv textarea")
  await box.fill("保留本机草稿")
  await add(page, "wrong-password")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "添加服务器", exact: true })
  await expect(dialog.getByRole("alert")).toContainText(/authentication|认证/i)
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/connection-failed-1280.png` })
  await dialog.getByRole("button", { name: "取消", exact: true }).click()
  await expect(box).toHaveValue("保留本机草稿")
  const server = page.locator(".remote-row")
  await expect(server).toHaveCount(1)
  await server.getByRole("button", { name: "新建远端任务", exact: true }).click()
  await expect(server).toHaveAttribute("data-state", "disconnected")
  await expect(server.getByRole("alert")).toHaveCount(0)
  await expect(page.locator('.statusbar').getByRole('status')).toContainText('未能创建远端会话，请检查服务器设置后重试')
  expect((await invoke(page,"listTasks")).data).toEqual([])
  await expect(box).toHaveValue("保留本机草稿")
})

test("两台服务器的同名目录与草稿隔离；连续点击只建一段远端任务", async ({ dawn }) => {
  const { page } = dawn
  for (const label of ["生态服务器 A", "生态服务器 B"]) {
    await add(page, "dawn", label)
    await page.getByRole("button", { name: "保存并连接", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  }
  const servers = page.locator(".remote-row")
  const first = servers.nth(0)
  const second = servers.nth(1)
  const newTask = first.getByRole("button", { name: "新建远端任务", exact: true })
  await newTask.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(first.locator(".sess-item")).toHaveCount(1)
  const box = page.locator("main.main textarea")
  await expect(page.locator(".conv-remote-host")).toHaveText("生态服务器 A")
  await expect(page.locator(".conv-remote-cwd")).toHaveText("~")
  await box.fill("A 的未发送内容")
  await second.getByRole("button", { name: "新建远端任务", exact: true }).click()
  await expect(page.locator(".conv-remote-host")).toHaveText("生态服务器 B")
  await expect(page.locator(".conv-remote-cwd")).toHaveText("~")
  await expect(box).toHaveValue("")
  await box.fill("B 的未发送内容")
  await first.locator(".sess-item .row").click()
  await expect(box).toHaveValue("A 的未发送内容")
  await expect(page.locator(".conv-remote-host")).toHaveText("生态服务器 A")
  await second.locator(".sess-item .row").click()
  await expect(box).toHaveValue("B 的未发送内容")
  const tasks = (await invoke(page, "listTasks")).data as { connectionId: string; workspace: string }[]
  expect(tasks).toHaveLength(2)
  expect(new Set(tasks.map(t => t.connectionId)).size).toBe(2)
  // 默认路径由会话的 remote.cwd 回报，TaskSummary.workspace 专供本机项目。
  expect(tasks.every(t => t.workspace === undefined)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 800 })
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ animations: "disabled", caret: "hide", path: `${shots}/two-servers-1280.png` })
})

test("项目、服务器、最近和会话的任务左缘一致，窄栏操作可达", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 开一段临时会话(page)
  await add(page)
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const server = page.locator(".server-navigation .remote-row").first()
  await server.getByRole("button", { name: "新建远端任务", exact: true }).click()
  await expect(server.locator(".server-session-list .sess-item")).toHaveCount(1)
  const project = page.locator(".proj-item").first()
  if (await project.locator(".proj-session-list").count() === 0) await project.locator(".proj-head > .row").click()
  for (const label of ["最近", "会话"]) {
    const toggle = page.locator(".side-section-toggle").filter({ hasText: label })
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click()
  }
  const x = (selector: string) => page.locator(selector).first().evaluate(el => el.getBoundingClientRect().left)
  expect(Math.abs(await x('.server-navigation .side-subhead .twisty') - await x('.proj-head .twisty'))).toBeLessThanOrEqual(1)
  expect(Math.abs(await x('.server-navigation .remote-label') - await x('.proj-head .sess-title'))).toBeLessThanOrEqual(1)
  expect(Math.abs(await x('.server-session-list .sess-title') - await x('.proj-session-list .sess-title'))).toBeLessThanOrEqual(1)
  for (const selector of ['.proj-session-list .sess-title', '.server-session-list .sess-title', '.loose-list .sess-title']) {
    expect(Math.abs(await x(selector) - await x('.recent-list .sess-title'))).toBeLessThanOrEqual(1)
  }
  await expect(server.locator('.server-meta')).toHaveCount(0)
  await expect(server.getByRole('img', { name: '已连接', exact: true })).toBeVisible()
  const bulk = page.getByRole('button', { name: '多选服务器', exact: true })
  await expect(page.locator('.server-navigation .side-section')).toContainText('多选')
  await server.locator('.side-subhead').hover()
  expect(await server.locator('.side-subhead').evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none')
  await page.locator('.conv-title').hover()
  expect(await server.locator('.side-subhead-row').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  const newTask = server.getByRole('button', { name: '新建远端任务', exact: true })
  await expect(server.locator('.side-subhead-row').getByRole('button', { name: '新建远端任务', exact: true })).toBeVisible()
  expect(await newTask.textContent()).toBe('')
  const machine = (await server.locator('.side-subhead-row').boundingBox())!, plus = (await newTask.boundingBox())!
  expect(Math.abs(plus.y + plus.height / 2 - machine.y - machine.height / 2)).toBeLessThanOrEqual(1)
  for (const list of ['.recent-list', '.loose-list']) {
    expect(await page.locator(list).evaluate(el => getComputedStyle(el).paddingLeft)).toBe('33px')
  }
  const sash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  await sash.focus()
  for (let i = 0; i < 3; i++) await sash.press('ArrowLeft')
  await expect.poll(() => page.locator('.sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(200)
  const header = page.locator('.server-navigation .side-section')
  const addButton = page.getByRole('button', { name: '添加服务器', exact: true })
  const tailCenters = await page.locator('.side-section .side-bulk, .side-section .server-add').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return rect.left + rect.width / 2
  }))
  expect(Math.max(...tailCenters) - Math.min(...tailCenters)).toBeLessThanOrEqual(1)
  for (const button of [bulk, addButton]) {
    const head = (await header.boundingBox())!, b = (await button.boundingBox())!
    expect(Math.abs((b.y + b.height / 2) - (head.y + head.height / 2))).toBeLessThanOrEqual(3)
  }
  await bulk.click()
  await expect(server.getByRole('checkbox', { name: '选择这台服务器：生态分析服务器', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '结束多选服务器', exact: true }).click()
  const right = await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right)
  expect((await addButton.boundingBox())!.x + (await addButton.boundingBox())!.width).toBeLessThanOrEqual(right)

  for (const button of await server.locator('.server-menu-anchor > button, .server-new').all()) {
    const b = (await button.boundingBox())!
    expect(b.x + b.width).toBeLessThanOrEqual(right)
  }
  await server.getByRole('button', { name: '管理服务器：生态分析服务器' }).click()
  await expect(server.getByRole('menuitem', { name: '断开', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await server.locator('.side-subhead').click()
  await expect(server.locator('.server-session-list')).toHaveCount(0)
  await newTask.click()
  await expect(server.locator('.server-session-list .sess-item')).toHaveCount(2)
  await expect(page.locator('.conv-remote')).toContainText('生态分析服务器')
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ animations: 'disabled', caret: 'hide', path: `${shots}/server-hierarchy-200.png` })
})
