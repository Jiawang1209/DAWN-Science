/**
 * 会话的整理：置顶、挪顺序、重命名、删除（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「要模仿一下 codex app 或者 claude app，就是可以置顶，
 * 可以挪动对话的顺序，可以重命名，可以删除。」*
 *
 * ## 这份用例盯的两件事
 *
 * 1. **能不能发现它。** 同一天已经栽过两次（「新建项目」那个没有标签的 `＋`、
 *    删除键那个 `opacity: 0` 的 `×`），两次作者的反馈都是「没有这个功能」，
 *    而两次代码都是好的。所以这里**先验菜单按钮看得见**。
 * 2. **顺序是后端定的。** 界面自己排等于第二份实现，两份迟早不一致。
 *    所以每个动作之后都验**重取回来的列表**长什么样。
 */
import { test, expect } from "./fixtures.js"

const 名字 = ".session-list .sess .name"

async function 建(page: import("@playwright/test").Page, 话: string, 第几个: number) {
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.locator(".session-list > li")).toHaveCount(第几个)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toHaveValue("")
  await box.fill(话)
  await box.press("Enter")
  await expect(page.locator(名字).filter({ hasText: 话 })).toBeVisible()
}

/** 打开当前那一行的操作菜单 */
async function 开菜单(page: import("@playwright/test").Page, 行: number = 0) {
  await page.locator(".sess-item").nth(行).locator(".row-more").click()
}

test("**操作入口看得见** —— 不该先猜到有这个东西", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "第一个", 1)
  await page.mouse.move(0, 0)

  const more = page.locator(".sess-item.current .row-more")
  await expect(more).toBeVisible()
  // `toBeVisible` 对 `opacity: 0` 仍然算可见——**必须直接量**
  expect(await more.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
})

test("重命名：**就地改，不用 window.prompt**（Electron 里它直接抛错）", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "本来的名字", 1)

  await 开菜单(page)
  await page.getByRole("menuitem", { name: "重命名" }).click()

  const input = page.locator(".sess-rename")
  await expect(input).toBeFocused()
  await input.fill("我起的名字")
  await input.press("Enter")

  await expect(page.locator(名字).first()).toHaveText("我起的名字")
})

test("**Esc 是取消** —— 改到一半按 Esc 却被存下来最气人", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "本来的名字", 1)

  await 开菜单(page)
  await page.getByRole("menuitem", { name: "重命名" }).click()
  await page.locator(".sess-rename").fill("不想要这个")
  await page.locator(".sess-rename").press("Escape")

  await expect(page.locator(名字).first()).toHaveText("本来的名字")
})

test("置顶：**排到最前面**，且标记看得出来", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "老的", 1)
  await 建(page, "新的", 2)
  // 新的在上
  await expect(page.locator(名字).first()).toHaveText("新的")

  // 把「老的」置顶（它现在是第 2 行）
  await 开菜单(page, 1)
  await page.getByRole("menuitem", { name: "置顶" }).click()

  await expect(page.locator(名字).first()).toContainText("老的")
  await expect(page.locator(".sess-item").first().locator(".pin-mark")).toBeVisible()
})

test("挪顺序：上移一格就真的上去了", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "老的", 1)
  await 建(page, "新的", 2)
  await expect(page.locator(名字).first()).toHaveText("新的")

  // 「老的」在第 2 行，上移
  await 开菜单(page, 1)
  await page.getByRole("menuitem", { name: "上移" }).click()

  await expect(page.locator(名字).first()).toHaveText("老的")
  await expect(page.locator(名字).nth(1)).toHaveText("新的")
})

test("**到头了就什么都不做** —— 不报错，也不假装动了", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "只有一个", 1)

  await 开菜单(page)
  await page.getByRole("menuitem", { name: "上移" }).click()

  await expect(page.locator(名字).first()).toHaveText("只有一个")
  // 没有错误横幅冒出来
  await expect(page.locator(".banner-error, .fatal")).toHaveCount(0)
})

test("从菜单里删除，走的是同一个确认框", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "要被删掉的", 1)

  await 开菜单(page)
  await page.getByRole("menuitem", { name: "删除" }).click()

  await expect(page.locator(".confirm-safety")).toContainText("账本不动")
  await page.locator(".confirm").getByRole("button", { name: "删除会话" }).click()
  await expect(page.locator(名字)).toHaveCount(0)
})

test("**拖拽排序**：拖到哪就排到哪", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "老的", 1)
  await 建(page, "新的", 2)
  await expect(page.locator(名字).first()).toHaveText("新的")

  // 把第 2 行拖到第 1 行的位置
  await page.locator(".sess-item").nth(1).dragTo(page.locator(".sess-item").nth(0))

  await expect(page.locator(名字).first()).toHaveText("老的")
  await expect(page.locator(名字).nth(1)).toHaveText("新的")
})

test("**不许跨越置顶分界** —— 拖过去等于偷偷改了置顶状态", async ({ dawn }) => {
  const { page } = dawn
  await 建(page, "普通的", 1)
  await 建(page, "要置顶的", 2)

  // 置顶第 1 行
  await 开菜单(page, 0)
  await page.getByRole("menuitem", { name: "置顶" }).click()
  await expect(page.locator(".sess-item").first().locator(".pin-mark")).toBeVisible()

  // 把没置顶的那条拖到置顶那条上——**应当什么都不发生**
  await page.locator(".sess-item").nth(1).dragTo(page.locator(".sess-item").nth(0))

  await expect(page.locator(名字).first()).toContainText("要置顶的")
  await expect(page.locator(名字).nth(1)).toHaveText("普通的")
  // 而且它没有被顺手置顶
  await expect(page.locator(".sess-item").nth(1).locator(".pin-mark")).toHaveCount(0)
})
