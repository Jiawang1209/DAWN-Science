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
  /**
   * **只等 `.app-shell` 不够。**
   *
   * 那一刻壳画出来了，但项目还没加载完，装 `⌘K` 监听器的那个 effect
   * 也未必跑过。机器一忙就会撞上——症状是「快捷键不管用」，
   * 而页面看起来完全正常（2026-08-09 在 load≈8 时稳定复现）。
   *
   * 「新建会话」可用意味着项目已经到位，那时应用才真的可交互。
   * 与 `cli-agent.spec.ts` 学到的是同一条。
   */
  await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
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
  // 原来搜的是「终端」。**那条命令 2026-08-09 删了**——它的对象
  // （可折叠的终端 dock）不存在了，而没有对象的动作不该留在面板里。
  // 换一条同样无条件存在的来验过滤，**验的是过滤本身，与是哪条命令无关**
  await box(page).fill("概览")
  await expect(page.getByRole("option", { name: /项目概览/ })).toBeVisible()
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

  /**
   * **等到那一屏真的画完再取快照。**
   *
   * 2026-08-11 修的一个真 flake：设置页里的内核列表是**异步到达**的
   * （`listKernels` 要扫盘）。只等 radiogroup 出现的话，两次取到的 DOM
   * 可能一次带着内核列表、一次还没有——于是这条用例随机红，
   * 而它红的时候看起来像「两条路真的分叉了」，**指向一个根本不存在的缺陷**。
   */
  const 画完了 = async () => {
    await expect(page.getByRole("radiogroup", { name: "主题" })).toBeVisible()
    await expect(page.locator(".set-section").filter({ hasText: "内核" })).toBeVisible()
    // 内核列表那一块要么有、要么确定没有——等它落定
    await expect(page.locator(".settings-page")).toContainText("解释器")
  }

  // ① 从命令面板走
  await palette(page)
  await box(page).fill("打开设置")
  await page.keyboard.press("Enter")
  await 画完了()
  const viaPalette = await page.locator(".main").innerHTML()

  await page.getByRole("button", { name: "返回" }).click()

  // ② 从按钮走
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await 画完了()
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
