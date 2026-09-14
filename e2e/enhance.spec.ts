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

test("**发出去之后，「撤回」跟着那句话一起没**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  await 输入框(page).fill("把图画好看点")
  await page.getByRole("button", { name: /档位：/ }).click()
  await page.getByRole("menuitemradio", { name: /基础/ }).click()
  await 增强键(page).click()
  await expect(输入框(page)).toHaveValue("改写：把图画好看点", { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "撤回", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  /**
   * 2026-09-08 作者报的：*「对话提交上去了，竟然还[能]撤销，
   * 我撤销之后竟然还是原来的对话。」*
   *
   * 撤回栈的作用域是**框里这一版草稿**——发出去了，它就该跟着一起没。
   * 留着的后果不是多一颗按钮：按下去会把**已经发走的那句话的上一版**填回空框。
   */
  await expect(page.getByRole("button", { name: "撤回", exact: true })).toHaveCount(0)
  await expect(输入框(page)).toHaveValue("")
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

test.describe("发出去之后，还在飞的那一次改写也要作废", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 8_000 } })
  /**
   * 2026-09-08 第二半：作者报的那条缺陷不止「撤回还立着」。
   *
   * **点了「优化输入」紧接着按回车**——话发出去了、框清空了，而那一次改写还在飞。
   * 它回来时会 `setDraft(改写版)`：把**已经发出去的那句话的改写版**灌进空框，
   * 并顺手立起一颗「撤回」。人下一句话就打在这段话上面了。
   *
   * 作用域仍然是那一条：撤回栈也好、在飞的请求也好，都属于**框里这一版草稿**。
   */
  test("**点了优化紧接着回车：改写的结果不许再落进空框**", async ({ dawn }) => {
    test.setTimeout(90_000)
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    await 输入框(page).fill("把图画好看点")
    await 增强键(page).click()
    await expect(page.getByRole("button", { name: /放弃/ })).toBeVisible()

    // 不等它回来，直接发
    await 输入框(page).press("Enter")
    await expect(输入框(page)).toHaveValue("")

    // 熬过那 8 秒——改写要是没作废，就在这段时间里落回框里
    await page.waitForTimeout(12_000)
    await expect(输入框(page)).toHaveValue("")
    await expect(page.getByRole("button", { name: "撤回", exact: true })).toHaveCount(0)
  })
})

/**
 * **借了别人的模型，就要说出来**（2026-09-09，协议 7.33）。
 *
 * 作者问：*「优化输入……是不是锁死在某一个 LLM 的吧？」* 没锁死——native 会话用的
 * 就是它此刻那颗 pill 上的模型。**但空态屏与 cli / ACP 会话够不着自己的模型，
 * 只能借配置里第一个 native**，而界面此前对此一个字都不说。
 *
 * 两条一起验，缺一条这个功能就会变成另一种坏：
 *   ① 借了要说（不静默换人，规格 7.5）；
 *   ② **没借不许说**（说了是噪音，而噪音多了真正该看见的那句就沉下去）。
 */
test("**空态屏借了模型：那行灰字要说清是谁改的**", async ({ dawn }) => {
  const { page } = dawn
  // 这一屏还没有会话——后端只能借配置里第一个 native
  await 输入框(page).fill("把图画好看点")
  await page.getByRole("button", { name: /档位：/ }).click()
  await page.getByRole("menuitemradio", { name: /基础/ }).click()
  await 增强键(page).click()
  await expect(输入框(page)).toHaveValue("改写：把图画好看点", { timeout: 30_000 })
  await expect(page.getByText(/这段对话的 agent 没有可直接调用的模型，用「.+」改的/)).toBeVisible()
})

test("**native 会话没借：那行灰字一个字都不提模型**", async ({ dawn }) => {
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
  await expect(输入框(page)).toHaveValue("（参考了：对话背景）改写：再画一张", { timeout: 30_000 })
  // 上下文那句照旧在；**「用……改的」那句不许出现**——这段会话用的就是屏幕上那个模型
  await expect(page.getByText(/带上了：对话第 1–2 轮/)).toBeVisible()
  await expect(page.getByText(/没有可直接调用的模型/)).toHaveCount(0)
})
