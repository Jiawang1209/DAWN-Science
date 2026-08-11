/**
 * 删除会话与移除项目（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「会话，项目，都可以点击删除，这地方也模仿 Codex 去做。」*
 *
 * ## 这份用例的重心是「说的和做的一致」
 *
 * 删除是**不可逆**的。所以这里验的不只是「东西没了」，还有：
 *   - 确认框上摆的是**真数字**，不是「相关数据」
 *   - **磁盘上的文件夹一个字节都没动**——移除项目最容易被误读成删文件夹
 *   - 删会话**不动账本**：那件事发生过，不因为你删掉会话就没发生
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 建一段会话并说一句话。
 *
 * **2026-08-11：改成在项目里开。** 侧栏顶上那颗建的是临时会话
 * （有自己的独立目录、不属于任何项目），而这份用例要验的
 * 「移除项目会带走它的会话」只有项目里的会话才说得通。
 */
async function 建会话并说一句(page: import("@playwright/test").Page, 话: string) {
  await 在项目里开会话(page)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await expect(box).toHaveValue("")
  await box.fill(话)
  await box.press("Enter")
  await expect(page.locator(".proj-session-list .sess .name").filter({ hasText: 话 })).toBeVisible()
}

/**
 * 会话行上的删除入口 **2026-08-10 改成了 `⋯` 菜单**（对标 codex / claude app：
 * 置顶、重命名、挪顺序、删除都在一处）。
 *
 * 「入口看不看得见」这件事挪到了 `session-organize.spec.ts`——
 * 它盯的是 `.row-more` 的 `opacity`，而这份文件只管**删除本身**。
 */
async function 从菜单删(page: import("@playwright/test").Page, 行 = 0) {
  await page.locator(".sess-item").nth(行).locator(".row-more").click()
  await page.getByRole("menuitem", { name: "删除" }).click()
}

test("删除会话：确认框说清账本不动，删完列表里就没有了", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "这个会话要被删掉")

  await 从菜单删(page)

  // **「不会发生什么」要在按下之前就在屏幕上**
  await expect(page.locator(".confirm-safety")).toContainText("账本不动")
  // **限定在浮层里**：行上那个按钮的 aria-label 也以「删除会话」开头，
  // 而 Playwright 的 name 默认是子串匹配
  await page.locator(".confirm").getByRole("button", { name: "删除会话" }).click()

  await expect(page.locator(".proj-session-list .sess .name")).toHaveCount(0)
  await expect(page.getByText(/这个项目里还没有会话/)).toBeVisible()
})

test("**取消就是什么都不做**", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "不该被删掉")

  await 从菜单删(page)
  await page.getByRole("button", { name: "取消" }).click()

  await expect(page.locator(".confirm")).toHaveCount(0)
  await expect(page.locator(".proj-session-list .sess .name").filter({ hasText: "不该被删掉" })).toBeVisible()
})

test("移除项目：确认框摆真数字，**且磁盘上的文件夹还在**", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "我的数据.csv"), "a,b\n1,2\n")
  await 建会话并说一句(page, "会话一")

  await page.getByRole("button", { name: "项目概览" }).click()
  await page.getByRole("button", { name: "移除项目" }).click()

  // **真数字**：刚建了一个会话，确认框上就得是 1
  await expect(page.locator(".confirm-detail")).toContainText("1")
  await expect(page.locator(".confirm-safety")).toContainText("磁盘上的文件夹不会被删除")
  await expect(page.locator(".confirm-safety")).toContainText(workspace)

  await page.locator(".confirm").getByRole("button", { name: "移除项目" }).click()
  await expect(page.locator(".confirm")).toHaveCount(0)

  /**
   * **这一条是整份用例存在的理由。**
   * 「移除项目」写错一行就是删掉用户一整个项目的工作。
   */
  expect(existsSync(join(workspace, "我的数据.csv"))).toBe(true)
  expect(readFileSync(join(workspace, "我的数据.csv"), "utf8")).toBe("a,b\n1,2\n")
})

test("新建会话与新建项目**是同一级别的两行**", async ({ dawn }) => {
  const { page } = dawn
  const 会话 = page.getByRole("button", { name: "新建会话" })
  const 项目 = page.getByRole("button", { name: "新建项目" })

  const a = (await 会话.boundingBox())!
  const b = (await 项目.boundingBox())!
  // 同宽、同高、左缘对齐——**「同一级别」是几何上的事，不是措辞上的**
  expect(Math.abs(a.width - b.width)).toBeLessThan(2)
  expect(Math.abs(a.height - b.height)).toBeLessThan(2)
  expect(Math.abs(a.x - b.x)).toBeLessThan(2)
})
