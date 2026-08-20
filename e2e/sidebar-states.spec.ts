/**
 * 侧栏各状态都有诚实的文案与自己的出路。
 *
 * 「不知道下一步该点哪里」是本项目被打回三次的那个问题。
 * 一个状态如果只说「没有 X」而不指向能解决它的地方，就是一条死路。
 */
import { test, expect, 开一段临时会话, 进坞 } from "./fixtures.js"

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
  const box = page.getByPlaceholder(/今天帮你做些什么/)
  await expect(box).toBeVisible()
  await box.fill("直接说")
  await box.press("Enter")
  await expect(page.locator(".turns").getByText("直接说")).toBeVisible({ timeout: 30_000 })
})

/**
 * **概览住在坞里，侧栏底部没有它**（2026-08-20，作者定的）。
 * 此前这条验的是「项目概览是侧栏底部入口」——判据翻面，两边理由都在：
 * 当年要入口是因为它是一整屏；现在坞的标签条就是常驻入口，
 * 侧栏再放一行就是第二个入口（「文件」那一格 2026-08-18 为同一个理由摘过）。
 */
test("概览在坞里打开，侧栏底部没有那一行", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".sidebar").getByRole("button", { name: "项目概览" })).toHaveCount(0)
  await 进坞(page, "概览")
  await expect(page.locator(".dock-overview .panel").first()).toBeVisible()
  // 对话还在——坞是旁边的一栏，不是替换主区（这正是搬家的理由）
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
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
  await expect(page.locator(".session-list .row")).toHaveCount(1)
  /**
   * **这一格 2026-08-19 从 `alive` 换成了「多久之前」**（作者要的，
   * 形状取自 Hermes）。这条判据的意思一个字没变——
   * *「行上要有那一格副信息，不是光秃秃一个标题」*——只是锚换了。
   *
   * 顺带把新的两条也钉在这儿：
   *   - 刚建出来的会话写「刚刚」，**不是 `0m`**；
   *   - 状态没有消失，只是挪进了 `data-state`（视觉基线仍然靠它等落定）。
   */
  const 那一格 = page.locator(".session-list .sess-when")
  await expect(那一格).toBeVisible()
  await expect(那一格).toHaveText("刚刚")
  await expect(page.locator('.session-list .sess-item[data-state]')).toHaveCount(1)
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
// **「项目概览」2026-08-20 摘掉了**（概览搬进坞），这一组只剩「设置」
for (const 名 of ["设置"]) {
  test(`「${名}」再点一次就回到对话`, async ({ dawn }) => {
    const { page } = dawn
    const 入口 = page.locator(".sidebar").getByRole("button", { name: 名, exact: true })
    await 入口.click()
    await expect(page.locator(".conversation, .empty-conv")).toHaveCount(0)
    await 入口.click()
    await expect(page.locator(".conversation, .empty-conv").first()).toBeVisible()
  })
}

/**
 * **坞是开合的，而对话从来不被顶掉**（2026-08-17 批 2 起，2026-08-18 改了入口）。
 *
 * 这条的来历：文件曾经是**一整屏**，侧栏那一项点下去对话就没了。
 * 批 2 把它搬进右侧坞——**对话从此不被顶掉**，那正是搬家的全部理由。
 *
 * 2026-08-18 侧栏那一项摘掉了（三个房客里只有它另有一个入口，
 * 那个不对称本身就让人觉得它是另一种东西）。
 * **上面那条纪律一个字都没变**，只是换了它的着力点：
 * 现在验的是顶右角那颗开合 + 坞头部的标签条。
 */
test("坞开得起来也收得回去，**对话全程都在**", async ({ dawn }) => {
  const { page } = dawn
  const 颗 = page.getByRole("button", { name: /^面板：/ })
  await 颗.click()
  await expect(page.locator(".right-dock")).toBeVisible()
  // **三个房客的名字一直摆在坞头上**——不用先拉开一个菜单才知道有它们
  for (const 名 of ["审阅", "文件", "网页"]) {
    await expect(page.getByRole("tab", { name: 名, exact: true })).toBeVisible()
  }
  await page.getByRole("tab", { name: "文件", exact: true }).click()
  await expect(page.locator(".right-dock .files-view")).toBeVisible()
  // **对话没被顶掉**——这是搬家换来的东西，值得单独钉一句
  await expect(page.locator(".conversation, .empty-conv").first()).toBeVisible()

  await 颗.click()
  await expect(page.locator(".right-dock")).toBeHidden()
})
