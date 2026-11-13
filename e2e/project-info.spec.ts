import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect } from "./fixtures.js"

test("项目卡可悬停及键盘打开，显示历史会话并跳转，适配亮暗及窄窗口", async ({ dawn }, info) => {
  const { page, workspace } = dawn
  const folder = join(workspace, "土壤剖面图像与理化数据融合分析项目")
  mkdirSync(folder)
  const title = "检查土壤剖面图像、理化指标及样本分组，核对训练与独立验证结果"
  await page.evaluate(async ({ folder, title }) => {
    const invoke = async (op: string, req: unknown) => {
      const r = await window.dawn!.invoke(op, req)
      if (!r.ok) throw new Error(r.error?.message)
      return r.data as any
    }
    const { agents } = await invoke("getProviders", {})
    for (let i = 0; i < 7; i++) {
      const task = await invoke("createTask", { agentId: agents[0].agentId, workspace: folder })
      await invoke("renameSession", { sessionId: task.sessionId, title: `${i + 1}. ${title}` })
    }
  }, { folder, title })
  await page.reload()
  const row = page.locator(".proj-head").filter({ hasText: "土壤剖面图像与理化数据融合分析项目" })
  await row.locator(".row").hover()
  const card = page.getByRole("dialog", { name: "项目信息：土壤剖面图像与理化数据融合分析项目", exact: true })
  await expect(card).toBeVisible()
  await expect(card).toContainText("7 段对话")
  await expect(card).toContainText(folder)
  await expect(card.getByRole("button", { name: /^打开会话：/ })).toHaveCount(5)
  await card.hover()
  await expect(card).toBeVisible()
  await page.screenshot({ path: info.outputPath("project-info-light.png"), animations: "disabled" })
  await page.keyboard.press("Escape")
  await expect(card).toHaveCount(0)
  const trigger = row.getByRole("button", { name: /^项目操作：/ })
  await trigger.focus()
  await page.keyboard.press("ArrowDown")
  await page.getByRole("menuitem", { name: "项目信息", exact: true }).press("Enter")
  await expect(card).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole("menuitem", { name: "项目信息", exact: true }).click()
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ path: info.outputPath("project-info-dark.png"), animations: "disabled" })
  await page.setViewportSize({ width: 800, height: 560 })
  await expect(card).toHaveCount(0)
  await trigger.click()
  await page.getByRole("menuitem", { name: "项目信息", exact: true }).click()
  const bounds = (await card.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(8)
  expect(bounds.y).toBeGreaterThanOrEqual(8)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(792)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(552)
  await page.screenshot({ path: info.outputPath("project-info-narrow.png"), animations: "disabled" })
  const recent = card.getByRole("button", { name: /^打开会话：/ }).first()
  const selected = (await recent.getAttribute("aria-label"))!.replace("打开会话：", "")
  await recent.click()
  await expect(card).toHaveCount(0)
  await expect(page.locator(".topbar .conv-title")).toHaveText(selected)
  await page.reload()
  await trigger.click()
  await page.getByRole("menuitem", { name: "项目信息", exact: true }).click()
  await expect(card).toContainText("7 段对话")
  await page.locator(".topbar .brand").click()
  await expect(card).toHaveCount(0)
})
