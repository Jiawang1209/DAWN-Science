/**
 * 提示词增强（2026-08-21）。**跑真实构建产物 + 假模型。**
 * 假模型认纪律层的标记句，回「改写：<原文>」并复述带了哪些参考块——三档据此能确定性地验。
 */
import { test, expect, 开一段临时会话, 在项目里开会话, 等进了对话 } from "./fixtures.js"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const 输入框 = (page: import("@playwright/test").Page) => page.getByPlaceholder(/今天帮你做些什么/)
const 增强键 = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "优化输入", exact: true })

test("**基础：点一下草稿被改写；撤回回到原样；空草稿按钮灰着并说为什么**", async ({ dawn }) => {
  const { page } = dawn
  // 空草稿：灰；理由在标签里（2026-08-22 起不再常驻一句话在旁边）
  await expect(page.getByRole("button", { name: "先写点什么再优化", exact: true })).toBeDisabled()

  await 输入框(page).fill("把图画好看点")
  // 档位字标默认「标准」；这条用基础
  await page.getByRole("button", { name: /档位：/ }).click()
  await page.getByRole("menuitemradio", { name: /基础/ }).click()
  await 增强键(page).click()
  await expect(输入框(page)).toHaveValue("改写：把图画好看点", { timeout: 30_000 })
  await page.getByRole("button", { name: "撤回", exact: true }).click()
  await expect(输入框(page)).toHaveValue("把图画好看点")
  await expect(page.getByRole("button", { name: "撤回", exact: true })).toHaveCount(0)
})

test("**标准：带上本会话里相关的那几轮**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("先做一张相关的图")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  await 输入框(page).fill("再画一张")
  await page.getByRole("button", { name: /档位：/ }).click()
  await page.getByRole("menuitemradio", { name: /标准/ }).click()
  await 增强键(page).click()
  // 假判定：历史里有「相关」二字 → 相关 → 带上对话背景
  await expect(输入框(page)).toHaveValue("（参考了：对话背景）改写：再画一张", { timeout: 30_000 })
  await expect(page.getByText(/带上了：对话第 1–2 轮/)).toBeVisible()
})

test("**专家：像开发任务时带上工作区里相关的文档与代码；不像时说出来**", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "README.md"), "# 项目\n目录树：src/\n- src/plot 画图模块 plot\n")
  mkdirSync(join(workspace, "src", "plot"), { recursive: true })
  writeFileSync(join(workspace, "src", "plot", "draw.py"), "def plot():\n    pass\n")
  // **要在项目里**：临时会话的工作区是一个空的临时目录，扫不到东西
  await 在项目里开会话(page)
  await 等进了对话(page)
  await 输入框(page).fill("给 plot 模块开发一个导出 svg 的功能")
  await page.getByRole("button", { name: /档位：/ }).click()
  await page.getByRole("menuitemradio", { name: /专家/ }).click()
  await 增强键(page).click()
  await expect(输入框(page)).toHaveValue(/（参考了：项目文档、相关代码）改写：/, { timeout: 40_000 })
  await expect(page.getByText(/带上了：.*1 份文档、1 个代码文件/)).toBeVisible()

  // 不像开发任务：不扫，说出来
  await 输入框(page).fill("把这段话翻译成英文")
  await 增强键(page).click()
  await expect(输入框(page)).toHaveValue("改写：把这段话翻译成英文", { timeout: 30_000 })
  await expect(page.getByText(/这次没带上下文：.*不像开发任务/)).toBeVisible()
})

test.describe("取消", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 8_000 } })
  test("**增强中按「放弃」：草稿不动、按钮回来**", async ({ dawn }) => {
    const { page } = dawn
    await 输入框(page).fill("慢慢来")
    await 增强键(page).click()
    const 放弃 = page.getByRole("button", { name: /放弃/ })
    await expect(放弃).toBeVisible()
    await 放弃.click()
    await expect(增强键(page)).toBeVisible()
    await page.waitForTimeout(1_500)
    await expect(输入框(page)).toHaveValue("慢慢来")
  })
})
