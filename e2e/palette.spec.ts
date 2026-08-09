/**
 * 命令面板（①-B″ · U1）。**跑真实构建产物。**
 *
 * 单元测试证明的是「组件在 jsdom 里按预期渲染」。它证明不了：
 *   - `⌘K` 在真实 Electron 窗口里会不会被别人先吃掉
 *   - 面板里点一条命令，应用**是否真的到达了那个状态**
 *
 * 最后一条是这个 Task 的要害。Hermes：
 * > *"One action, one home … they **invoke the same action and state**."*
 *
 * 所以这里有一条测试专门走两遍同一个动作——一遍从面板，一遍从按钮——
 * **断言它们落到同一个地方**。
 */
import { test, expect } from "./fixtures.js"

const K = "ControlOrMeta+k"

/**
 * 叫出面板。
 *
 * **必须先等应用挂完。** `⌘K` 的监听器是 React effect 装的；
 * 窗口一出现就按，那一刻还没有人在听——第一版就是这么红的，
 * 而且看着像「快捷键不管用」，实际是按早了。
 */
async function palette(page: import("@playwright/test").Page) {
  await expect(page.locator(".app-shell")).toBeVisible()
  await page.keyboard.press(K)
  return page.getByRole("dialog", { name: "命令面板" })
}

/**
 * 面板的搜索框。
 *
 * **必须带名字**：原生 `<select>` 的隐含 role 也是 `combobox`，
 * 侧栏的项目选择器会先被选中。jsdom 里没渲染侧栏，所以那一层测试撞不到这个。
 */
const box = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "搜索命令" })

test("⌘K 在真实窗口里能叫出面板", async ({ dawn }) => {
  const { page } = dawn
  await expect(await palette(page)).toBeVisible()
  // 光标必须已经在输入框里，否则还得再点一下
  await expect(box(page)).toBeFocused()
})

test("Esc 关得掉", async ({ dawn }) => {
  const { page } = dawn
  await expect(await palette(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "命令面板" })).toBeHidden()
})

test("打字能过滤", async ({ dawn }) => {
  const { page } = dawn
  await palette(page)
  await box(page).fill("终端")
  await expect(page.getByRole("option", { name: /切换终端/ })).toBeVisible()
  await expect(page.getByRole("option", { name: /打开设置/ })).toBeHidden()
})

test("**关键词也能搜到** —— 人记得的往往不是我们起的名字", async ({ dawn }) => {
  const { page } = dawn
  await palette(page)
  await box(page).fill("凭证")
  await expect(page.getByRole("option", { name: /打开设置/ })).toBeVisible()
})

test("**面板与按钮到达同一个状态** —— 一个动作一个家", async ({ dawn }) => {
  const { page } = dawn

  // ① 从命令面板走
  await palette(page)
  await box(page).fill("打开设置")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("radiogroup", { name: "主题" })).toBeVisible()
  const viaPalette = await page.locator(".main").innerHTML()

  await page.getByRole("button", { name: "返回" }).click()

  // ② 从按钮走
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("radiogroup", { name: "主题" })).toBeVisible()
  const viaButton = await page.locator(".main").innerHTML()

  // 两条路必须落在同一处。不同 = 行为按入口分叉了
  expect(viaPalette).toBe(viaButton)
})

test("命令真的会执行 —— 主题命令改的是真的主题", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator("html.dawn-light")).toHaveCount(1)
  await palette(page)
  await box(page).fill("暗色")
  await page.keyboard.press("Enter")
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
})

test("**不可用的命令留在列表里并说明原因** —— 缺失不等于不支持", async ({ dawn }) => {
  const { page } = dawn
  // 还没有会话，「中止」用不了。但它不该消失——消失的话，
  // 搜不到的人分不清「没这个功能」和「现在用不了」
  await palette(page)
  await box(page).fill("中止")
  const row = page.getByRole("option", { name: /中止当前回合/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText("还没有会话")
  await expect(row).toHaveAttribute("aria-disabled", "true")
})

test("搜不到时说明情况，不是留白", async ({ dawn }) => {
  const { page } = dawn
  await palette(page)
  await box(page).fill("不存在的命令")
  await expect(page.getByText(/没有匹配/)).toBeVisible()
})
