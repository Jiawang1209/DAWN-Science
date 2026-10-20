import { test, expect, 在项目里开会话, 等进了对话, 进坞, type DawnFixture } from "./fixtures.js"
import type { Locator } from "@playwright/test"

const questions = [
  { id: "download", header: "p1 跑完后", question: "p1_0027 完成、27 块全部 done 之后，下载要怎么办？", options: [
    { label: "p1 跑完就停（我来 touch STOP）", description: "立即在 ~/amplicon_reads/_work/STOP 建标记。当前块 p1_0027 会正常跑完并验收，之后循环在开始 p2_0001 前优雅退出，不会碰那 6.5 TB。这是「盯 p1 收尾」最干净的收法。" },
    { label: "不停，p1 完自动接着下 p2", description: "保持现状。p1 一完成循环立即开始 p2_0001。注意 6.556 TB 在限流下预计要数月，且只增不减直到完成或磁盘/STOP 干预。" },
    { label: "先别动，等 p1 快到时再决定", description: "不加 STOP。我继续报进度；等 p1 剩最后几十分钟时再喊你拍板。" },
  ] },
  { id: "long", header: "长内容验证", question: "请逐项阅读以下处理范围，再选择后续需要执行的工作。", options: Array.from({ length: 8 }, (_, i) => ({ label: `处理范围 ${i + 1}`, description: "保留输入数据、参数和验证记录，先核查结果完整性，再根据实际进展决定下一步。".repeat(5) })) },
  { id: "custom", header: "补充信息", question: "还有需要遵守的要求吗？" },
]
test.use({ dawnOptions: { toolCall: { toolName: "ask_user_question", args: { questions }, perTurn: true, when: "询问框布局预览" } } })

async function openQuestions(dawn: DawnFixture) {
  await 在项目里开会话(dawn.page); await 等进了对话(dawn.page)
  const input = dawn.page.locator("main.main").getByPlaceholder(/输入问题/)
  await input.fill("询问框布局预览"); await input.press("Enter")
  const card = dawn.page.locator("main.main .question-card")
  await expect(card).toContainText(questions[0]!.question)
  return card
}

async function geometry(card: Locator) {
  return card.evaluate(el => {
    const rect = el.getBoundingClientRect()
    const body = el.querySelector(".question-card-body") ?? el
    const footer = el.querySelector(".question-card-footer") ?? el
    const answer = el.querySelector("textarea")!.getBoundingClientRect()
    const actions = el.querySelector(".question-primary-actions")!.getBoundingClientRect()
    const parent = el.closest(".main, .side-chat")!.getBoundingClientRect()
    const visible = (r: DOMRect) => r.top >= rect.top && r.bottom <= rect.bottom && r.top >= parent.top && r.bottom <= parent.bottom && r.bottom <= innerHeight
    return { bodyOverflow: body.scrollHeight - body.clientHeight, outerOverflow: el.scrollHeight - el.clientHeight,
      horizontalOverflow: el.scrollWidth - el.clientWidth, answerVisible: visible(answer), actionsVisible: visible(actions),
      footerTop: footer.getBoundingClientRect().top, height: rect.height }
  })
}

test("普通三选项完整显示；长正文滚动时回答区固定；切题复位", async ({ dawn }, testInfo) => {
  const card = await openQuestions(dawn)
  const normal = await geometry(card)
  expect(normal.bodyOverflow).toBeLessThanOrEqual(1)
  expect(normal.answerVisible).toBe(true)
  expect(normal.actionsVisible).toBe(true)
  await card.getByRole("radio").nth(1).check()
  await dawn.page.screenshot({ path: testInfo.outputPath("questions-normal.png") })
  await card.screenshot({ path: testInfo.outputPath("questions-normal-card.png") })
  await card.getByRole("button", { name: "下一题", exact: true }).click()
  const long = await geometry(card)
  expect(long.bodyOverflow).toBeGreaterThan(100)
  expect(long.outerOverflow).toBeLessThanOrEqual(1)
  expect(long.answerVisible && long.actionsVisible).toBe(true)
  await card.locator(".question-card-body").evaluate(el => { el.scrollTop = el.scrollHeight })
  expect((await geometry(card)).footerTop).toBe(long.footerTop)
  await card.getByRole("radio").last().check()
  await card.getByRole("button", { name: "上一题" }).click()
  expect(await card.locator(".question-card-body").evaluate(el => el.scrollTop)).toBe(0)
  await card.getByRole("button", { name: "后一题" }).click()
  expect(await card.locator(".question-card-body").evaluate(el => el.scrollTop)).toBe(0)
  await card.getByRole("button", { name: "下一题", exact: true }).click()
  await card.getByRole("textbox").fill("保留完整验证记录")
  await card.getByRole("button", { name: "提交答案" }).click()
  await expect(card).toHaveCount(0)
})

test("小窗口暗色长内容：输入与提交始终可见，键盘选项可达", async ({ dawn }, testInfo) => {
  const card = await openQuestions(dawn)
  await dawn.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(900, 650))
  await dawn.page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await card.getByRole("button", { name: "后一题" }).click()
  const before = await geometry(card)
  expect(before.answerVisible && before.actionsVisible).toBe(true)
  expect(before.outerOverflow).toBeLessThanOrEqual(1)
  expect(before.horizontalOverflow).toBeLessThanOrEqual(1)
  await card.getByRole("radio").last().focus()
  await dawn.page.keyboard.press("Space")
  await expect(card.getByRole("radio").last()).toBeChecked()
  expect((await geometry(card)).footerTop).toBe(before.footerTop)
  await dawn.page.screenshot({ path: testInfo.outputPath("questions-small-dark.png") })
})

test("窄侧边对话长内容：回答区不被正文挤出", async ({ dawn }, testInfo) => {
  await 在项目里开会话(dawn.page); await 等进了对话(dawn.page)
  await 进坞(dawn.page, "对话")
  const side = dawn.page.locator("aside.right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  const input = side.getByPlaceholder(/输入问题/)
  await input.fill("询问框布局预览"); await input.press("Enter")
  const card = side.locator(".question-card")
  await expect(card).toContainText(questions[0]!.question)
  await card.getByRole("button", { name: "后一题" }).click()
  const fit = await geometry(card)
  expect(fit.answerVisible && fit.actionsVisible).toBe(true)
  expect(fit.outerOverflow).toBeLessThanOrEqual(1)
  expect(fit.horizontalOverflow).toBeLessThanOrEqual(1)
  await card.locator(".question-card-body").evaluate(el => { el.scrollTop = el.scrollHeight })
  expect((await geometry(card)).footerTop).toBe(fit.footerTop)
  await dawn.page.screenshot({ path: testInfo.outputPath("questions-side.png") })
})
