/**
 * 侧栏会话标题：**一行截断 · 悬停跑马灯 · 悬停全文卡**（2026-08-15）。
 * **跑真实构建产物。**
 *
 * 作者要的三件事（形态取自 Codex）：
 *   ①「会话是动态展示文字的，基于侧边栏宽度，最起码不需要换行，否则太丑」
 *   ②「鼠标挪动到会话的时候，标题还是跑马灯的效果」
 *   ③「鼠标挪动到会话的时候，在侧边栏的地方会出现详细的标题」
 *
 * ## 为什么这三条只能在真实产物上验
 *
 * 它们全是**布局算完之后才存在的事实**：截不截断取决于侧栏此刻多宽，
 * 跑不跑取决于文字比盒子宽多少，卡在哪儿取决于那一行的 `getBoundingClientRect`。
 * 单元测试读得到这些 CSS，**读不出它们最后落在哪里**。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/** 一句一定会溢出侧栏的话 */
const 长标题 =
  "我要对这个数据库进行一些修改，首先：把首页里面的跑马灯里面的乌兰敖都和大青沟合并成科尔沁沙地生态站"

async function 开一段长标题的(page: import("@playwright/test").Page) {
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill(长标题)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  return page.locator(".session-list li .sess-title").first()
}

test("**标题一行截断，不换行**", async ({ dawn }) => {
  const { page } = dawn
  const 标题 = await 开一段长标题的(page)

  const 量 = await 标题.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      高: Math.round(el.getBoundingClientRect().height),
      行距: parseFloat(cs.lineHeight),
      换行: cs.whiteSpace,
      盒宽: el.clientWidth,
      内容宽: el.scrollWidth,
    }
  })
  /** **一行就是一行**：盒子高度不超过一个行距 */
  expect(量.高, `标题换行了（高 ${量.高}，行距 ${量.行距}）`).toBeLessThanOrEqual(
    Math.ceil(量.行距) + 1,
  )
  expect(量.换行).toBe("nowrap")
  /** 这一条同时保证下面两条不是空转：**它真的溢出了** */
  expect(量.内容宽, "这句话没溢出，后面两条就测不到东西").toBeGreaterThan(量.盒宽)
})

test("**悬停时跑起来**，而且只在真的溢出时跑", async ({ dawn }) => {
  const { page } = dawn
  const 标题 = await 开一段长标题的(page)

  await expect(标题, "还没悬停就在跑").not.toHaveAttribute("data-跑", "1")
  await 标题.hover()
  await expect(标题).toHaveAttribute("data-跑", "1")

  /** 跑多远是量出来的，**不是写死的** */
  const 变量 = await 标题.evaluate((el) => ({
    远: el.style.getPropertyValue("--跑多远"),
    久: el.style.getPropertyValue("--跑多久"),
  }))
  expect(变量.远).toMatch(/^-\d+(\.\d+)?px$/)
  expect(变量.久).toMatch(/^\d+(\.\d+)?s$/)

  // 移开就停——**一个停不下来的动画比没有更烦**
  await page.locator(".conversation, .app-shell").first().hover({ position: { x: 5, y: 5 } })
  await expect(标题).not.toHaveAttribute("data-跑", "1")
})

/**
 * **短标题不跑，也不弹卡**（2026-08-15 变异测试逼出来的）。
 *
 * 上一版只测了长标题：把「只在溢出时才动」那道判断整个删掉，
 * **判据照样全绿**——因为长标题两种写法都会跑。
 * 「只在……才」这种话，**必须有一个「不该发生」的用例**，否则等于没写。
 *
 * 而这条守的是真东西：一条本来就看得全的标题在鼠标划过时抖一下，
 * 是最廉价的那种烦人；再弹一张卡挡住它自己，更糟。
 */
test("**短标题：不跑马灯，也不弹卡**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 标题 = page.locator(".session-list li .sess-title").first()
  // 先确认它**真的没溢出**，否则这条用例什么都没测到
  const 没溢出 = await 标题.evaluate((el) => el.scrollWidth - el.clientWidth <= 1)
  expect(没溢出, "这条标题也溢出了，换一句更短的").toBe(true)

  await 标题.hover()
  await page.waitForTimeout(900) // 比浮层那 420ms 长，确保「没弹」不是还没到时候
  await expect(标题, "没溢出却跑起来了").not.toHaveAttribute("data-跑", "1")
  await expect(page.locator(".sess-hover-card"), "看得全的标题还弹了卡").toHaveCount(0)
})

test("**悬停一会儿，旁边浮出全文**", async ({ dawn }) => {
  const { page } = dawn
  const 标题 = await 开一段长标题的(page)

  await expect(page.locator(".sess-hover-card")).toHaveCount(0)
  await 标题.hover()

  const 卡 = page.locator(".sess-hover-card")
  await expect(卡).toBeVisible({ timeout: 5_000 })
  /**
   * **卡上看得到的比行里多**——这才是这张卡的不变式。
   *
   * 不断言「卡里是原话」：标题在**存的时候**就按 `TITLE_MAX` 截过了
   * （截断留省略号，那是另一条既有纪律）。Codex 那张卡同样带着省略号。
   * 真正要守的是「悬停能读到行里读不到的东西」——
   * 按字数比，不按具体数字比，那样改 `TITLE_MAX` 不会误伤这条。
   */
  const 行里的 = await 标题.evaluate((el) => {
    // 行里**看得见**多少字：按宽度估，DOM 文本是全的（省略号是 CSS 干的）
    const 全 = el.textContent ?? ""
    return { 全长: 全.length, 盒宽: el.clientWidth, 内容宽: el.scrollWidth }
  })
  const 卡上的 = (await 卡.locator(".sess-hover-title").textContent()) ?? ""
  expect(卡上的.length, "卡上的标题不完整").toBe(行里的.全长)
  const 露出的比例 = 行里的.盒宽 / 行里的.内容宽
  expect(露出的比例, "行里本来就全看得见，这张卡没有存在的必要").toBeLessThan(0.9)
  expect(卡上的, "卡上应当是那句话的开头").toContain("我要对这个数据库")

  /**
   * **卡要在侧栏外面，而且没被裁掉。**
   * 它必须 `position: fixed`：侧栏是 `overflow: auto` 的，
   * 绝对定位的子元素会跟着列表滚走（本仓库栽过一次）。
   */
  const 位置 = await 卡.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const 侧 = document.querySelector(".sidebar")!.getBoundingClientRect()
    return { 定位: getComputedStyle(el).position, 左: r.left, 侧右: 侧.right, 右: r.right, 视宽: window.innerWidth }
  })
  expect(位置.定位).toBe("fixed")
  expect(位置.左, "卡压在侧栏上了").toBeGreaterThanOrEqual(位置.侧右)
  expect(位置.右, "卡被推出了屏幕右边").toBeLessThanOrEqual(位置.视宽)

  // 移开就收
  await page.locator(".app-shell").hover({ position: { x: 5, y: 5 } })
  await expect(卡).toHaveCount(0)
})
