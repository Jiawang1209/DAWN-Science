/**
 * 设置先当一条栏（2026-09-16，规格 `2026-09-16-设置右栏-design.md`）。
 *
 * 作者：*「我们点击设置的时候，其实设置页面整体就弹出来了，其实我想要的是
 * 初始是类似于点击面板后的效果，然后也有一个按钮，可以展开。」*
 *
 * 八条判据各自对着一件会悄悄坏掉的事。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/** 侧栏那颗「设置」。**精确匹配**——「设置」是别处按钮文案的子串（那条踩过） */
const 设置键 = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "设置", exact: true })

test("**点设置 → 右边出现一条栏，而对话还在**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  // 对话没有被顶掉——这是整件事的全部意义
  await expect(page.locator(".turns")).toBeVisible()
  // 还没挑，停在名单上
  await expect(page.locator(".settings-column-list")).toBeVisible()
})

test("**名单 → 点一项 → 换成那一项；返回键回名单**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await page.locator(".settings-column-list").getByRole("button", { name: "外观", exact: true }).click()
  await expect(page.locator(".settings-column-list")).toHaveCount(0)
  await expect(page.locator(".settings-column .dock-title")).toHaveText("外观")
  await page.locator(".settings-column-back").click()
  await expect(page.locator(".settings-column-list")).toBeVisible()
})

test("**⤢ 展开 → 整页，选中项不变；⤡ 收起 → 回栏，仍是同一项**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await page.locator(".settings-column-list").getByRole("button", { name: "内核", exact: true }).click()

  await page.getByRole("button", { name: "展开", exact: true }).click()
  await expect(page.locator(".settings-shell")).toBeVisible()
  await expect(page.locator(".settings-column")).toHaveCount(0)
  await expect(page.locator(".settings-nav-item.current")).toHaveText(/内核/)

  // 「收回」而不是「收起」：后者是「收起面板」「收起添加模型服务」的子串（`design-contract` 抓的）
  await page.getByRole("button", { name: "收回", exact: true }).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  await expect(page.locator(".settings-column .dock-title")).toHaveText("内核")
})

/**
 * Task 5 那两条 CSS 缺陷的判据（2026-09-16）。它们在 Task 5 那一轮**没有任何测试能证明**——
 * 组件还没人渲染。接线之后它们就能量了，所以在这里补上，别留成「看着还行」。
 */
test("**窄栏的头部不比坞的头高**——`h2` 的浏览器默认外距要被清掉", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  const 外距 = await page.evaluate(() => {
    const t = document.querySelector(".settings-column .dock-title") as HTMLElement
    const cs = getComputedStyle(t)
    return [cs.marginTop, cs.marginBottom]
  })
  // 全局没有标题重置（`*{box-sizing}` 而已），不写 `margin: 0` 就是 UA 的 0.83em ≈ 21.6px
  expect(外距).toEqual(["0px", "0px"])

  /**
   * **上面那条断的是「因」，这一条断「果」。**（Task 5 审查提的）
   * 只断外距的话，将来有人改了 `.dock-head` 的内距、或者让标题变得比工具行还高，
   * 两个头就又不一样高了，而那条断言照样是绿的。
   *
   * 直接比「窄栏的头」和「坞的头」量不了——那条不变式保证它们永远不会同屏。
   * 退而求其次、且与字号无关的判据：**标题不许是头里最高的那个孩子**
   * （实测 20.15 vs 工具行 28.59），因为头高就是由最高的那个定的。
   */
  const 谁更高 = await page.evaluate(() => {
    const 头 = document.querySelector(".settings-column .dock-head") as HTMLElement
    const 标题 = 头.querySelector(".dock-title") as HTMLElement
    const 工具 = 头.querySelector(".settings-column-tools") as HTMLElement
    return { 标题: 标题.getBoundingClientRect().height, 工具: 工具.getBoundingClientRect().height }
  })
  expect(谁更高.标题).toBeLessThanOrEqual(谁更高.工具)
})

test("**十四行的 `›` 落在同一条右边缘**——有没有计数都一样", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column-list")).toBeVisible()
  const 右缘们 = await page.evaluate(() =>
    [...document.querySelectorAll(".settings-column-list .settings-column-arrow")].map((e) =>
      Math.round(e.getBoundingClientRect().right),
    ),
  )
  expect(右缘们.length).toBeGreaterThanOrEqual(14)
  /**
   * **防空转**（Task 5 审查提的）：这一条要证的是「有计数的行和没计数的行，箭头一样齐」。
   * 哪天夹具让十四行全都没有计数，它会绿得毫无意义——**抓不住的判据比没有更坏**。
   * 所以先证这一屏上两种行都在。
   */
  const 有计数几行 = await page.locator(".settings-column-list .side-count").count()
  /**
   * **这个数由用例数出来，不再写在注释里**（2026-09-17）。
   *
   * 「几项没有计数」这条分支已经写错过三次（七 → 九到十 → 又一次七），
   * 每一次都是照抄上一处而不是去数。**注释里的数字没有人验，断言里的有**——
   * 所以把它从一句话改成一条判据，第四次写错在结构上就不可能了。
   *
   * 实测：十四项里**四项**带计数（技能 / 子 agent / 插件 / MCP），
   * 于是**十项**没有。记忆那项是 `记忆待确认数 || undefined`，
   * 夹具里待确认是 0，所以它退成「没有计数」的那一类。
   */
  expect(有计数几行, "一行计数都没有，这条判据就退化成空转了").toBeGreaterThan(0)
  expect(
    有计数几行,
    "带计数的行数变了：要么 `设置分区` 增删了 `count`，要么夹具里记忆有了待确认项。两种都该有人看一眼",
  ).toBe(4)
  expect(
    右缘们.length - 有计数几行,
    "不带计数的行数变了——这一条要证的正是「这十项的箭头跟那四项一样齐」",
  ).toBe(10)
  // 把箭头推到右边的原本是 `.side-count` 的 `margin-left: auto`，所以少了那条规则，
  // 没计数的那十行箭头会贴着标题——同一份名单看起来像两种控件
  expect(new Set(右缘们).size, `箭头右缘不齐：${[...new Set(右缘们)].join(" / ")}`).toBe(1)
})

test("**坞开着 → 开设置 → 坞让位 → 关掉设置 → 坞自己回来**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await page.getByRole("button", { name: "面板", exact: true }).click()
  await expect(page.locator(".right-dock")).toBeVisible()

  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  await expect(page.locator(".right-dock")).toHaveCount(0)

  await page.locator(".settings-column .dock-close").click()
  await expect(page.locator(".settings-column")).toHaveCount(0)
  await expect(page.locator(".right-dock")).toBeVisible()
})

test("**设置栏开着时点「面板」，设置让开、面板真的出来**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  // 反方向的互斥（2026-09-16 审查抓的）：缺了它这一下就是「点了没反应」——
  // 状态里坞开了，而屏幕上还是设置栏
  await page.getByRole("button", { name: "面板", exact: true }).click()
  await expect(page.locator(".right-dock")).toBeVisible()
  await expect(page.locator(".settings-column")).toHaveCount(0)
})

test("**来时右边空的，走时右边就空的**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await 设置键(page).click()
  await page.locator(".settings-column .dock-close").click()
  // 不是「关掉设置就给你开个面板」
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await expect(page.locator(".settings-column")).toHaveCount(0)
})
