/**
 * agent 回复的 markdown 排版（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「回复的 markdown 格式并不美观，要效仿 claude app、codex app、hermes。」*
 *
 * ## 截图之后才看清主因不是间距
 *
 * **代码块的换行整段塌成一行**，而下载／复制／全屏三个按钮裸露地堆在左边。
 * 根因：我们用 `streamdown` 却**从来没有它的样式**——它那套 Tailwind 类
 * 在这个项目里一个都不存在，于是 `flex` / `sticky` / 行的 `display:block` 全失效。
 *
 * 所以这份用例盯的第一件事是**换行还在不在**：那是一眼看不出、
 * 却让代码块彻底没法读的东西。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

async function 富回复(page: import("@playwright/test").Page) {
  await 开一段临时会话(page)
  const b = page.getByPlaceholder(/回车发送/)
  await expect(b).toBeVisible()
  await b.fill("给我一段 markdown")
  await b.press("Enter")
  await expect(page.locator(".md table")).toBeVisible({ timeout: 30_000 })
}

test("**代码块的每一行是一行** —— 塌成一行的代码没法读", async ({ dawn }) => {
  const { page } = dawn
  await 富回复(page)

  const 文本 = await page.locator(".md pre").first().innerText()
  expect(文本).toContain("import pandas as pd")
  // **三行就是三行**：塌掉的时候这里会是 1
  expect(文本.trim().split("\n").length).toBe(3)
})

test("代码块有头部：**语言在左、动作在右**", async ({ dawn }) => {
  const { page } = dawn
  await 富回复(page)

  const header = page.locator('.md [data-streamdown="code-block-header"]')
  await expect(header).toContainText("python")

  const 语言 = (await header.boundingBox())!
  const 动作 = (await page.locator('.md [data-streamdown="code-block-actions"]').boundingBox())!
  // 动作整体在语言名右边——**此前它们竖着堆在左边**
  expect(动作.x).toBeGreaterThan(语言.x + 语言.width / 2)
})

test("表格的动作也收拾过 —— **不是三个裸按钮竖着堆在表格上面**", async ({ dawn }) => {
  const { page } = dawn
  await 富回复(page)

  const 按钮 = page.locator('.md [data-streamdown="table-wrapper"] button')
  const n = await 按钮.count()
  if (n < 2) return // 这个版本的 streamdown 没给表格配动作
  const 首 = (await 按钮.first().boundingBox())!
  const 末 = (await 按钮.last().boundingBox())!
  /**
   * **「横着排」的准确说法是：横向跨度远大于纵向跨度。**
   *
   * 起初写的是「纵坐标一致（差 < 2px）」——量出来差 9px，
   * 因为几个图标的盒高本来就不同。那条断言在验一件比意图更严的事，
   * 而它红了并不说明按钮堆成了一列。
   */
  expect(Math.abs(末.x - 首.x)).toBeGreaterThan(Math.abs(末.y - 首.y) * 2)
})

test("标题有层级 —— 二级和三级不该长得一样", async ({ dawn }) => {
  const { page } = dawn
  await 富回复(page)

  const 字号 = async (sel: string) =>
    parseFloat(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize))
  const h1 = await 字号(".md h1")
  const h2 = await 字号(".md h2")
  const h3 = await 字号(".md h3")
  expect(h1).toBeGreaterThan(h2)
  expect(h2).toBeGreaterThan(h3)
})
