/** 真实Electron + 共享假模型：通过「＋」右侧优化子菜单执行三档改写。 */
import { test, expect, 开一段临时会话, 在项目里开会话, 等进了对话 } from "./fixtures.js"
import type { Page } from "@playwright/test"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const 输入框 = (page: Page) => page.locator("main.main .composer textarea")
async function 档位菜单(page: Page) {
  const add = page.locator("main.main").getByRole("button", { name: "添加内容", exact: true })
  if (await add.getAttribute("aria-expanded") !== "true") await add.click()
  const trigger = page.getByRole("menuitem", { name: "优化输入", exact: true })
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click()
  return page.getByRole("menu", { name: "选档位", exact: true })
}
async function 优化(page: Page, mode = "基础") {
  await (await 档位菜单(page)).getByRole("menuitemradio", { name: new RegExp(mode) }).click()
}
async function 关菜单(page: Page) {
  if (await page.getByRole("menu", { name: "选档位", exact: true }).count()) {
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu", { name: "选档位", exact: true })).toHaveCount(0)
  }
  if (await page.getByRole("menu", { name: "添加内容", exact: true }).count()) {
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu", { name: "添加内容", exact: true })).toHaveCount(0)
  }
}
async function 撤回(page: Page) {
  await (await 档位菜单(page)).getByRole("menuitem", { name: "撤回上次优化", exact: true }).click()
}
async function 有撤回(page: Page, yes: boolean) {
  const menu = await 档位菜单(page)
  await expect(menu.getByRole("menuitem", { name: "撤回上次优化", exact: true })).toHaveCount(yes ? 1 : 0)
  await 关菜单(page)
}

test("基础：空草稿档位禁用，改写与撤回保留原文", async ({ dawn: { page } }) => {
  const menu = await 档位菜单(page)
  for (const item of await menu.getByRole("menuitemradio").all()) await expect(item).toBeDisabled()
  await expect(menu.getByText("先写点什么再优化", { exact: true })).toHaveCount(0)
  await 关菜单(page)
  await 输入框(page).fill("把图画好看点")
  await 优化(page)
  await expect(输入框(page)).toHaveValue("改写：把图画好看点")
  await 撤回(page)
  await expect(输入框(page)).toHaveValue("把图画好看点")
  await 有撤回(page, false)
})

test("发出去之后，优化撤回随该草稿清空", async ({ dawn: { page } }) => {
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("把图画好看点")
  await 优化(page)
  await expect(输入框(page)).toHaveValue("改写：把图画好看点")
  await 有撤回(page, true)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  await 有撤回(page, false)
  await expect(输入框(page)).toHaveValue("")
})

test("标准：带上本会话相关轮次", async ({ dawn: { page } }) => {
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("先做一张相关的图")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  await 输入框(page).fill("再画一张")
  await 优化(page, "标准")
  await expect(输入框(page)).toHaveValue("（参考了：对话背景）改写：再画一张")
  await expect(page.getByText(/带上了：对话第 1–2 轮/)).toBeVisible()
})

test("专家：开发任务参考工作区文档代码，普通改写说明未带上下文", async ({ dawn: { page, workspace } }) => {
  writeFileSync(join(workspace, "README.md"), "# 项目\n目录树：src/\n- src/plot 画图模块 plot\n")
  mkdirSync(join(workspace, "src", "plot"), { recursive: true })
  writeFileSync(join(workspace, "src", "plot", "draw.py"), "def plot():\n    pass\n")
  await 在项目里开会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("给 plot 模块开发一个导出 svg 的功能")
  await 优化(page, "专家")
  await expect(输入框(page)).toHaveValue(/（参考了：项目文档、相关代码）改写：/)
  await expect(page.getByText(/带上了：.*1 份文档、1 个代码文件/)).toBeVisible()
  await 输入框(page).fill("把这段话翻译成英文")
  await 优化(page, "专家")
  await expect(输入框(page)).toHaveValue("改写：把这段话翻译成英文")
  await expect(page.getByText(/这次没带上下文：.*不像开发任务/)).toBeVisible()
})

test.describe("取消与发送隔离", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 8_000 } })
  test("增强中从二级菜单放弃，草稿不动，按钮恢复", async ({ dawn: { page } }) => {
    await 输入框(page).fill("慢慢来")
    await 优化(page)
    await (await 档位菜单(page)).getByRole("menuitem", { name: "放弃本次优化", exact: true }).click()
    await expect(输入框(page)).toHaveValue("慢慢来")
    await expect((await 档位菜单(page)).getByRole("menuitemradio", { name: /基础/ })).toBeEnabled()
  })
  test("改写还在飞时发送，晚回结果不落进空草稿", async ({ dawn: { page } }) => {
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 输入框(page).fill("把图画好看点")
    await 优化(page)
    await expect((await 档位菜单(page)).getByRole("menuitem", { name: "放弃本次优化", exact: true })).toBeVisible()
    await 关菜单(page)
    await 输入框(page).press("Enter")
    await expect(输入框(page)).toHaveValue("")
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    await expect(输入框(page)).toHaveValue("")
    await 有撤回(page, false)
  })
})

test("空态借用模型时说明实际模型", async ({ dawn: { page } }) => {
  await 输入框(page).fill("把图画好看点")
  await 优化(page)
  await expect(输入框(page)).toHaveValue("改写：把图画好看点")
  await expect(page.getByText(/这段对话的 agent 没有可直接调用的模型，用「.+」改的/)).toBeVisible()
})

test("native会话改写不误报借用了其他模型", async ({ dawn: { page } }) => {
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("先做一张相关的图")
  await 输入框(page).press("Enter")
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  await 输入框(page).fill("再画一张")
  await 优化(page, "标准")
  await expect(输入框(page)).toHaveValue("（参考了：对话背景）改写：再画一张")
  await expect(page.getByText(/带上了：对话第 1–2 轮/)).toBeVisible()
  await expect(page.getByText(/没有可直接调用的模型/)).toHaveCount(0)
})

test("命令面板优化沿用最近档位，空草稿说明不可用", async ({ dawn: { page } }) => {
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.keyboard.press("ControlOrMeta+k")
  await page.getByRole("combobox", { name: "搜索命令" }).fill("优化输入")
  const row = page.getByRole("option", { name: /优化输入/ })
  await expect(row).toHaveAttribute("aria-disabled", "true")
  await expect(row.locator(".why")).toHaveText("先写点什么再优化")
  await page.keyboard.press("Escape")
  await 输入框(page).fill("把图画好看点")
  await 优化(page)
  await expect(输入框(page)).toHaveValue("改写：把图画好看点")
  await 撤回(page)
  await page.keyboard.press("ControlOrMeta+k")
  await page.getByRole("combobox", { name: "搜索命令" }).fill("优化输入")
  await page.getByRole("option", { name: /优化输入/ }).click()
  await expect(输入框(page)).toHaveValue("改写：把图画好看点")
  await 有撤回(page, true)
})
