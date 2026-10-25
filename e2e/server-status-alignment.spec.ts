import { SIDEBAR_MIN } from "../src/ui/state/sidebar.js"
import { test, expect } from "./fixtures.js"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

test.use({ dawnOptions: { fakeSsh: true } })
const shots = "tmp/rp-card-polish-verification"

test.describe("仅有本机模型", () => {
  test.use({ dawnOptions: { fakeSsh: true, providersYaml: `agents:
  local-acp:
    kind: acp
    command: node
    args: ["${join(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")}"]
    capabilities: [chat, exec]
` } })
  test("已连接但模型不支持远端时，新建会话给出设置提示", async ({ dawn }) => {
    const { page } = dawn
    await page.getByRole("button", { name: "添加服务器", exact: true }).click()
    await page.locator("#conn-host").fill("fake.example")
    await page.locator("#conn-user").fill("dawn")
    await page.locator("#conn-secret").fill("dawn")
    await page.getByRole("button", { name: "保存并连接", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    const row = page.locator(".remote-row").first()
    await expect(row).toHaveAttribute("data-state", "ready")
    await row.getByRole("button", { name: "新建远端任务", exact: true }).click()
    await expect(page.locator(".statusbar").getByRole("status")).toContainText("当前模型不支持远端会话，请在设置中添加支持服务器的模型")
    await expect(row).toHaveAttribute("data-state", "ready")
    await expect(row.getByRole("alert")).toHaveCount(0)
    await expect(row.locator(".sess-item")).toHaveCount(0)
  })
})

test("服务器状态与名称同排，连接失败不展示技术错误，仍可重试", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  await page.getByRole("button", { name: "添加服务器", exact: true }).click()
  await page.locator("#conn-label").fill("Heitudi")
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const row = page.locator(".remote-row").first()
  const manage = row.getByRole("button", { name: "管理服务器：Heitudi" })
  await manage.click()
  await row.getByRole("menuitem", { name: "断开", exact: true }).click()
  await expect(row.locator(".remote-status")).toHaveText("未连接")
  await page.screenshot({ path: `${shots}/server-status-time-default.png` })

  const check = async () => {
    await expect.poll(() => page.locator('.sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width)))
      .toBe(Number(await page.getByRole('separator', { name: '调整侧栏宽度', exact: true }).getAttribute('aria-valuenow')))
    const name = (await row.locator(".remote-label").boundingBox())!
    const status = (await row.locator(await row.locator(".remote-status").isVisible() ? ".remote-status" : ".server-dot").boundingBox())!
    expect(Math.abs(name.y + name.height / 2 - status.y - status.height / 2)).toBeLessThanOrEqual(2)
    expect(status.x).toBeGreaterThanOrEqual(name.x + name.width)
    expect(name.width).toBeGreaterThan(12)
    const right = await page.locator(".sidebar").evaluate(el => el.getBoundingClientRect().right)
    for (const button of [manage, row.getByRole("button", { name: "新建远端任务", exact: true })]) {
      const b = (await button.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(right)
    }
  }
  await check()
  await expect(row.locator('.server-dot')).toHaveAttribute('aria-label', '未连接')
  await expect(row.locator(".server-last")).toHaveText("<1m")
  const lastConnectedLabel = await row.locator(".server-last").getAttribute("aria-label")
  expect(lastConnectedLabel).toMatch(/^上次成功连接：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  const sash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  await sash.focus()
  for (let i = 0; i < 5; i++) await sash.press('ArrowRight')
  await check()
  await expect(row.locator('.server-last')).toBeVisible()
  await page.locator('.empty-conv').hover()
  await page.screenshot({ path: `${shots}/server-status-time-light.png` })
  await row.screenshot({ path: `${shots}/server-status-time-row.png` })
  await sash.focus()
  for (let i = 0; i < 12; i++) await sash.press('ArrowLeft')
  await expect(page.locator('.sidebar')).toHaveCSS('width', `${SIDEBAR_MIN}px`)
  await check()
  await row.locator(".side-subhead").hover()
  await expect(page.locator(".sess-hover-card")).toContainText(lastConnectedLabel!)
  await page.screenshot({ path: `${shots}/server-status-time-narrow.png` })
  const idleHeight = (await row.boundingBox())!.height
  await manage.click()
  await row.getByRole("menuitem", { name: "编辑", exact: true }).click()
  await page.locator("#conn-secret").fill("wrong-password")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await manage.click()
  await row.getByRole("menuitem", { name: "连接", exact: true }).click()
  await expect(row).toHaveAttribute("data-state", "disconnected")
  await expect(row.getByRole("alert")).toHaveCount(0)
  await expect(row).not.toContainText(/authentication|ETIMEDOUT/i)
  await check()
  expect((await row.boundingBox())!.height).toBe(idleHeight)
  await row.locator(".side-subhead").hover()
  await expect(page.locator(".sess-hover-card")).toContainText("未连接")
  await expect(page.locator(".sess-hover-card")).not.toContainText(/authentication|ETIMEDOUT/i)
  await page.screenshot({ path: `${shots}/server-status-time-failure-narrow.png` })
  await sash.focus()
  for (let i = 0; i < 8; i++) await sash.press('ArrowRight')
  await check()
  await page.locator('.empty-conv').hover()
  await page.screenshot({ path: `${shots}/server-status-time-failure-light.png` })
  await row.screenshot({ path: `${shots}/server-status-time-failure-row.png` })
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "展开", exact: true }).click()
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await check()
  await page.screenshot({ path: `${shots}/server-status-time-dark.png` })
  await expect(row).not.toContainText(/authentication|ETIMEDOUT/i)
  await manage.click()
  await row.getByRole("menuitem", { name: "编辑", exact: true }).click()
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await manage.click()
  await row.getByRole("menuitem", { name: "连接", exact: true }).click()
  await expect(row).toHaveAttribute("data-state", "ready")
  await expect(row.getByRole("img", { name: "已连接", exact: true })).toBeVisible()
})
