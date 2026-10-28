import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect } from "./fixtures.js"
import type { Page } from "@playwright/test"

async function invoke(page: Page, operation: string, input: unknown = {}) {
  return page.evaluate(async ({ operation, input }) => {
    const response = await window.dawn!.invoke(operation, input)
    if (!response.ok) throw new Error(response.error?.message)
    return response.data as any
  }, { operation, input })
}

test("跨项目切换保持省略号入口，删除经菜单确认且只作用于目标会话", async ({ dawn }, info) => {
  const { page, workspace } = dawn
  const rootA = join(workspace, "项目甲"), rootB = join(workspace, "项目乙")
  mkdirSync(rootA); mkdirSync(rootB)
  writeFileSync(join(rootA, "保留数据.txt"), "KEEP_ORIGINAL_DATA")
  const providers = await invoke(page, "getProviders")
  const agentId = providers.agents.find((agent: any) => agent.kind === "native").agentId
  const a = await invoke(page, "createTask", { agentId, workspace: rootA })
  const b = await invoke(page, "createTask", { agentId, workspace: rootB })
  await invoke(page, "renameSession", { sessionId: a.sessionId, title: "会话甲" })
  await invoke(page, "renameSession", { sessionId: b.sessionId, title: "会话乙" })
  await page.reload()
  const sidebar = page.locator(".sidebar")
  await expect(sidebar.locator(".workspace-title")).toHaveCSS("font-weight", "600")
  for (const title of ["项目甲", "项目乙"]) {
    const project = sidebar.locator(".proj-item").filter({ has: page.locator(".proj-head .name", { hasText: title }) })
    if (!(await project.locator(".sess-item").count())) await project.locator(".proj-head .row").click()
  }
  const check = async () => {
    await expect(sidebar.getByRole("button", { name: /^删除会话：/ })).toHaveCount(0)
    const projectTrigger = sidebar.getByRole("button", { name: "项目操作：项目甲", exact: true })
    const projectSize = (await projectTrigger.boundingBox())!
    expect([projectSize.width, projectSize.height]).toEqual([28, 32])
    await projectTrigger.focus()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Shift+Tab")
    await expect(projectTrigger).toBeFocused()
    await expect(projectTrigger).toHaveCSS("outline-offset", "-2px")
    for (const trigger of await sidebar.locator(".sess-item .row-more").all()) {
      const size = (await trigger.boundingBox())!
      expect([size.width, size.height]).toEqual([projectSize.width, projectSize.height])
      await trigger.focus()
      await expect(trigger).toHaveCSS("outline-offset", "-2px")
    }
    for (const name of await sidebar.locator(".proj-head .name, .side-section-title").all()) {
      await expect(name).toHaveCSS("font-size", "14px")
    }
    for (const title of ["会话甲", "会话乙"]) {
      const trigger = sidebar.getByRole("button", { name: `会话操作：${title}`, exact: true })
      await expect(trigger).toHaveText("⋯")
      await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
    }
  }
  for (const [title, folder] of [["会话甲", "项目甲"], ["会话乙", "项目乙"]]) {
    await sidebar.getByRole("button", { name: new RegExp(`^${title}(?:\\s|$)`) }).click()
    await expect(page.locator("main.main .ws-chip-label")).toHaveText(folder!)
    await check()
  }
  const fallback = sidebar.getByRole("button", { name: "会话操作：会话甲", exact: true })
  await fallback.click()
  await expect(page.getByRole("menu", { name: "会话操作：会话甲", exact: true })).toBeVisible()
  await expect(page.locator(".confirm")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(fallback).toBeFocused()
  await fallback.click()
  await page.screenshot({ path: info.outputPath("uniform-sidebar-menu.png"), animations: "disabled" })
  await page.getByRole("menuitem", { name: "删除", exact: true }).click()
  await expect(page.locator(".confirm")).toBeVisible()
  await page.locator(".confirm").getByRole("button", { name: "取消", exact: true }).click()
  expect((await invoke(page, "listTasks")).some((task: any) => task.taskId === a.taskId)).toBe(true)
  await fallback.click()
  await page.getByRole("menuitem", { name: "删除", exact: true }).click()
  await page.locator(".confirm").getByRole("button", { name: "删除 1 段", exact: true }).click()
  await expect(fallback).toHaveCount(0)
  const remaining = await invoke(page, "listTasks")
  expect(remaining.some((task: any) => task.taskId === b.taskId)).toBe(true)
  expect(remaining.some((task: any) => task.taskId === a.taskId)).toBe(false)
  expect(readFileSync(join(rootA, "保留数据.txt"), "utf8")).toBe("KEEP_ORIGINAL_DATA")
  await expect(page.locator("main.main .ws-chip-label")).toHaveText("项目乙")
})
