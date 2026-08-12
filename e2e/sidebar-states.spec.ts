/**
 * 侧栏各状态都有诚实的文案与自己的出路。
 *
 * 「不知道下一步该点哪里」是本项目被打回三次的那个问题。
 * 一个状态如果只说「没有 X」而不指向能解决它的地方，就是一条死路。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/**
 * **一条都没有时，侧栏只剩那个入口**（2026-08-12 改，T3-a）。
 *
 * 上一版这里等侧栏里一句「还没有会话」。现在不写了，理由是
 * **说话的地方换了**：一个空列表旁边挂一句「还没有会话」是同义反复，
 * 而右边那一整屏（下一条测的空对话区）本来就是给这件事准备的，
 * 且它给的是**一颗能点的按钮，不是一句提示**。
 *
 * 所以这条改成守两件仍然要紧的：**空的时候不画白占的东西**，
 * 以及**出路始终可点**。
 */
test("一条都没有时不画空列表，且新建入口可点", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(0)
  await expect(page.locator(".sidebar .side-section")).toHaveCount(0)
  // 出路：新建按钮可点
  await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
})

/**
 * **空对话区给的是一个能用的东西，不是一句提示**（2026-08-12 换主语）。
 *
 * 上一版这里等一颗「开始」按钮。作者：*「不要上来就是用 Deepseek 开始，
 * 而是要直接是对话窗口。」* —— 那颗按钮换成了输入卡本身，
 * 而这条守的意图（**别只摆一句话，摆一个能动手的东西**）一个字没变。
 */
test("空对话区给的是**能直接打字的输入卡**，不是一句提示", async ({ dawn }) => {
  const { page } = dawn
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toBeVisible()
  await box.fill("直接说")
  await box.press("Enter")
  await expect(page.locator(".turns").getByText("直接说")).toBeVisible({ timeout: 30_000 })
})

test("项目概览是侧栏底部入口，不是首页", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "项目概览" }).click()
  await expect(page.locator(".panels")).toBeVisible()
  // 能回得来——单向门不是出路
  await 开一段临时会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
})

test("设置可达且可返回", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("button", { name: "返回" })).toBeVisible()
  await page.getByRole("button", { name: "返回" }).click()
  await expect(page.locator(".conversation")).toBeVisible()
})

test("会话建好后出现在侧栏列表里", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  // 列表里应当出现这个会话，且带状态
  await expect(page.locator(".session-list .row")).toHaveCount(1)
  await expect(page.locator(".session-list .state")).toBeVisible()
})

/**
 * **侧栏左下角那三个入口，再点一次都回得去**（2026-08-11）。
 *
 * 作者：*「设置的地方，点击第二次也可以返回到界面。」*
 * 设置原来在顶栏，那颗按钮本来就是「设置 ⇄ 返回」两态；搬进侧栏时漏了这一条。
 *
 * **一个亮着的入口点下去毫无反应，人会以为它坏了**——
 * 所以这条把三个一起验，而不是只补设置那一个。
 */
for (const 名 of ["项目概览", "文件", "设置"]) {
  test(`「${名}」再点一次就回到对话`, async ({ dawn }) => {
    const { page } = dawn
    const 入口 = page.locator(".sidebar").getByRole("button", { name: 名, exact: true })
    await 入口.click()
    await expect(page.locator(".conversation, .empty-conv")).toHaveCount(0)
    await 入口.click()
    await expect(page.locator(".conversation, .empty-conv").first()).toBeVisible()
  })
}
