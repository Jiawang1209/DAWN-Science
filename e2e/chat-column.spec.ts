/**
 * 对话是**一栏**（2026-08-12）。**跑真实构建产物。**
 *
 * 作者：*「点进去可以正常聊，但是我看聊天窗口、聊天页面，和 workbuddy 还是差得挺远。」*
 *
 * 量了一次才知道差在哪：**不是配色也不是字号，是没有那一栏。**
 * CDP 连上运行中的 WorkBuddy 读到的是：内容区 `1113px`，对话列 `784px`，
 * 左右各留约 160——正文、用户气泡、输入卡**共用同一条左右缘**。
 * 我们那时是 880px 顶着侧栏铺开，右边一大片空，
 * 而输入卡自己另有一条边界。三样东西三条线，看起来就是「散的」。
 *
 * ## 为什么这条非得在真实产物上量
 *
 * 这一栏是**三个不同 CSS 规则算出来的巧合**：`.turn` 的
 * `max-width + margin:auto`、`.composer > *` 的 `max-width`、
 * 还有 `.turns` 与 `.composer` 各自的左右内边距。单元测试读得到那几个数，
 * **读不出它们最后是否落在同一条线上**——那要等布局算完。
 *
 * 断言的是「边缘对齐」而不是「宽度等于 784」：**数可以再调**
 * （作者随时可能改窗口宽度或那个上限），而三者对齐是这条设计意图本身。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**正文、气泡、输入卡在同一条左右缘上**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await page.getByPlaceholder(/回车发送/).fill("量一下这一栏")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 边 = async (sel: string) =>
    await page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { 左: Math.round(r.left), 右: Math.round(r.right), 宽: Math.round(r.width) }
    })

  const 助手 = await 边(".turn.agent")
  const 用户 = await 边(".turn.user")
  const 输入 = await 边(".composer-box")

  // 三者同宽同位。**留 2px 容差**：亚像素舍入是真实存在的，1px 的抖动
  // 不是这条要抓的东西——「差 96px 的两条边界」才是
  expect(Math.abs(助手.左 - 输入.左)).toBeLessThanOrEqual(2)
  expect(Math.abs(助手.右 - 输入.右)).toBeLessThanOrEqual(2)
  // 用户那一段的盒子是靠右的，所以只对右缘（左缘由气泡宽度决定）
  expect(Math.abs(用户.右 - 输入.右)).toBeLessThanOrEqual(2)

  /**
   * **这一栏不许铺满。**
   *
   * 这是作者那句「差得挺远」里最重的一条：铺开的文档与居中的一栏，
   * 是两种排版。留白低于两成就退回成前者了。
   */
  const 内容区 = await 边(".conversation")
  expect(助手.宽 / 内容区.宽).toBeLessThan(0.85)
})

/**
 * **自己说的那句话，右下角是尖的**（CDP 实测 `_userMessageBubble_`：
 * `border-radius: 16px 16px 0px`）。
 *
 * 上一版我把它写成了「全圆角胶囊」，注释里还挂着「实测 100px」——
 * **那个 100px 抓的是页面上另一个元素**。这次是按住文字往上爬到气泡本身读的。
 *
 * 形状的意思：那个缺口有方向，指着说话的人。胶囊没有方向，
 * 谁说的全靠位置。所以这条盯的是**缺口还在不在**，不是圆角好不好看。
 */
test("**用户气泡右下角不是圆的**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/回车发送/).fill("看看形状")
  await page.getByRole("button", { name: "发送", exact: true }).click()

  const 角 = await page.locator(".turn.user .bubble").first().evaluate((el) => {
    const s = getComputedStyle(el)
    return { 右下: s.borderBottomRightRadius, 左上: s.borderTopLeftRadius }
  })
  expect(角.右下).toBe("0px")
  expect(角.左上).not.toBe("0px")
})
