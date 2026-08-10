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
import { test, expect } from "./fixtures.js"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

async function 建会话并说一句(page: import("@playwright/test").Page, 话: string) {
  await page.getByRole("button", { name: "新建会话" }).click()
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await expect(box).toHaveValue("")
  await box.fill(话)
  await box.press("Enter")
  await expect(page.locator(".session-list .sess .name").filter({ hasText: 话 })).toBeVisible()
}

/**
 * **不 hover 就得看得见。**
 *
 * 2026-08-10 作者：*「我们之前的会话，还是不能删除。」* 查下来按钮一直是好的
 * ——点了就弹确认框——**问题是它 `opacity: 0`，只有鼠标悬到那一行才显形**。
 * 这与「新建项目此前是个没有标签的 `＋`」是同一类错误：**看不见的能力等于不存在**。
 *
 * 所以这条断言不验「能点」，验的是**不动鼠标时它是否可见**。
 */
test("**当前会话的删除按钮常驻可见** —— 不该先猜到有这个东西", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "当前会话")
  // 鼠标挪开，确保测的不是悬停态
  await page.mouse.move(0, 0)

  const kill = page.locator(".sess-item.current .row-kill")
  await expect(kill).toBeVisible()
  // `toBeVisible` 对 `opacity: 0` 仍然算可见——**所以必须直接量它**
  expect(await kill.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
})

test("**它不压住状态标记** —— 上一版是绝对定位，浮在 `alive` 上面", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "当前会话")
  await page.mouse.move(0, 0)

  const state = await page.locator(".sess-item.current .state").boundingBox()
  const kill = await page.locator(".sess-item.current .row-kill").boundingBox()
  // 两块矩形横向不重叠：删除键完整地在状态标记右边
  expect(kill!.x).toBeGreaterThanOrEqual(state!.x + state!.width - 1)
})

test("删除会话：确认框说清账本不动，删完列表里就没有了", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "这个会话要被删掉")

  await page.locator(".sess-item").first().hover()
  await page.getByRole("button", { name: /删除会话：这个会话要被删掉/ }).click()

  // **「不会发生什么」要在按下之前就在屏幕上**
  await expect(page.locator(".confirm-safety")).toContainText("账本不动")
  // **限定在浮层里**：行上那个按钮的 aria-label 也以「删除会话」开头，
  // 而 Playwright 的 name 默认是子串匹配
  await page.locator(".confirm").getByRole("button", { name: "删除会话" }).click()

  await expect(page.locator(".session-list .sess .name")).toHaveCount(0)
  await expect(page.getByText(/还没有会话/)).toBeVisible()
})

test("**取消就是什么都不做**", async ({ dawn }) => {
  const { page } = dawn
  await 建会话并说一句(page, "不该被删掉")

  await page.locator(".sess-item").first().hover()
  await page.getByRole("button", { name: /删除会话：不该被删掉/ }).click()
  await page.getByRole("button", { name: "取消" }).click()

  await expect(page.locator(".confirm")).toHaveCount(0)
  await expect(page.locator(".session-list .sess .name").filter({ hasText: "不该被删掉" })).toBeVisible()
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
