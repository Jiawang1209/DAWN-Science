/**
 * agent 选择器在 composer 右下角（①-B″ · U0）。**跑真实构建产物。**
 *
 * 单元测试能证明「pill 在 `.composer` 的 DOM 里」。它证明不了**它真的在右下角**——
 * 那是几何，不是结构。这里量坐标。
 */
import { test, expect } from "./fixtures.js"

async function startSession(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /新建会话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
}

test("pill 在 composer 里，且**几何上确实靠右靠下**", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)

  const pill = page.locator(".composer .agent-pill")
  await expect(pill).toBeVisible()

  const p = (await pill.boundingBox())!
  /**
   * **参照系是那张卡，不是外面那条带子。**
   *
   * 2026-08-09 输入区变成了一张有宽度上限（768px）的卡，`.composer` 退化成
   * 一条通栏的容器——拿它当参照，量到的是「卡到窗口边缘还有多远」，
   * 与「控件贴不贴右」无关。**断言的意图没变，参照系跟着搬。**
   */
  const area = (await page.locator(".composer-box").boundingBox())!
  const text = (await page.locator(".composer textarea").boundingBox())!
  const row = (await page.locator(".composer .composer-controls").boundingBox())!
  const send = (await page.locator(".composer button[type=submit]").boundingBox())!

  // 靠右：**控件行**贴着输入卡的右缘。
  // 最右的是发送按钮而不是 pill —— Hermes 的 controls.tsx 就是这个顺序
  // （`ml-auto` 的那一行里，pill 在前、发送在后），照搬
  expect(area.x + area.width - (row.x + row.width)).toBeLessThan(24)
  expect(send.x).toBeGreaterThan(p.x)
  // 靠下：整行都在输入框下方
  expect(p.y).toBeGreaterThanOrEqual(text.y + text.height)
})

test("显示的是**这个会话**的 agent", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  await expect(page.locator(".composer .agent-pill")).toContainText("ds-chat")
})

test("**点开明说是新建会话** —— 不能让人以为是就地换模型", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  await page.locator(".composer .agent-pill button").click()
  await expect(page.getByRole("menu")).toContainText("新建会话")
})

test("菜单向上弹 —— pill 贴着窗口底部，向下会被切掉", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  const pillBox = (await page.locator(".composer .agent-pill").boundingBox())!
  await page.locator(".composer .agent-pill button").click()
  const menu = (await page.getByRole("menu").boundingBox())!
  expect(menu.y + menu.height).toBeLessThanOrEqual(pillBox.y + 1)
})

test("侧栏那份真的没了", async ({ dawn }) => {
  await expect(dawn.page.locator(".agent-pick")).toHaveCount(0)
})
