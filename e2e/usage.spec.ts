/**
 * 「设置 → 用量」（S21，2026-08-16）。**跑真实构建产物。**
 *
 * 这一条盯的是**整条线通没通**：跑一轮对话 → token 落进账本 →
 * 汇总查出来 → 画在屏上。中间任何一节断了，这里都是零。
 *
 * 假模型报的是 `prompt_tokens: 12 / completion_tokens: 8`（写死在
 * `scripts/mock-inference-server.mjs` 里），所以**数是可预期的**。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

async function 进用量(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "用量", exact: true }).click()
  /**
   * **等数据到了再往下走。**
   *
   * 这一屏在 `getUsage` 回来之前显示的是「正在读用量…」，
   * 那时 `.usage-heat` 根本不存在。第一版少了这一句：单独跑绿、
   * 全量跑红（机器忙，查询慢了一拍），报的是
   * `Cannot read properties of null` —— 又一次「前提悄悄没成立」。
   */
  await expect(page.locator(".usage-heat")).toBeVisible({ timeout: 15_000 })
}

test("**跑一轮之后，用量那一屏上有真数**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  await 进用量(page)

  /**
   * ① 累计不是 0。**这一条就是「整条线通没通」**——
   * 账本没记 token 的那一版，这里永远是 0，而屏幕看起来一切正常。
   */
  const 累计 = page.locator(".usage-stat").first()
  await expect(累计).toContainText("累计 Token")
  await expect(累计.locator(".usage-stat-value")).not.toHaveText("0")

  // ② 按模型那一块真的分出了模型，不是「还没有记到」
  await expect(page.locator(".usage-pie")).toBeVisible()
  await expect(page.locator(".usage-legend-list li")).not.toHaveCount(0)

  // ③ 今天那一格也有数——日历按本地时区切，切错了这里会是 0
  const 今天格 = page.locator(".usage-stat").nth(1)
  await expect(今天格).toContainText("今天")
  await expect(今天格.locator(".usage-stat-value")).not.toHaveText("0")
})

/**
 * 日历、饼图、两栏洞察（2026-08-16 作者要的那几件）。
 *
 * **每日预算那条用例随功能一起撤了**：作者当天定的
 * *「不需要每日预算，因为不用 token，怎么干活呢」*——
 * 超了我们也不会拦，那条进度条只剩下让人焦虑这一个作用。
 */
test("**日历铺满、带月份；饼图与日历都有悬停浮层**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  // ① 铺满：图的宽度贴着它所在那一块，**不是缩在左上角一小方块**
  const 尺寸 = await page.evaluate(() => {
    const svg = document.querySelector(".usage-heat") as SVGElement
    const 块 = svg.closest(".usage-block") as HTMLElement
    return { 图: svg.getBoundingClientRect().width, 块: 块.getBoundingClientRect().width }
  })
  expect(尺寸.图, `没铺满：${尺寸.图} / ${尺寸.块}`).toBeGreaterThan(尺寸.块 * 0.9)

  // ② 月份标出来了（一年 53 列，至少跨得过两个月）
  await expect(page.locator(".usage-month").first()).toBeVisible()
  expect(await page.locator(".usage-month").count()).toBeGreaterThanOrEqual(2)

  /**
   * ③ 悬停出浮层，且**是我们自己画的那一颗**。
   * 原生 `title` 有半秒延迟、没有样式，设计契约为此禁掉了按钮上的 `title=`。
   */
  await expect(page.locator(".usage-tip")).toHaveCount(0)
  /**
   * **悬停「真正有用量的那一格」，不是「最后一格」。**
   *
   * 第一版停在最后一格上，而那一格是不是今天要看跑用例的时刻——
   * 2026-08-17 凌晨跨过午夜时它红了一次：最后一格是昨天，浮层里写的是
   * 「没有用量」。**一条会随时钟变色的判据不该留着**。
   * `l4` 是最深那一档，夹具里只有今天有数，所以它就是那一天。
   */
  await page.locator(".usage-cell.l4").last().hover()
  await expect(page.locator(".usage-tip")).toBeVisible()
  await expect(page.locator(".usage-tip")).toContainText("Token")

  // ④ 饼图那一块也有：悬停出的是**具体那个模型的数**
  await page.locator(".usage-slice").first().hover()
  await expect(page.locator(".usage-tip")).toContainText("%")
  // **不带厂家**（作者：「不需要提供运营商，直接显示模型就可以了」）
  await expect(page.locator(".usage-legend-name").first()).not.toContainText("/")
})

/**
 * 活动洞察那一栏（形状学自作者给的截图）。
 *
 * **每一格都得是账本里数出来的。** 这条用例盯的就是这件事：
 * 跑一轮、调一次工具，那两个数就该动。
 */
test("**活动洞察数的是真事**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  const 取 = (名: string) =>
    page.locator(".usage-facts li").filter({ hasText: 名 }).locator(".usage-fact-value")
  await expect(取("对话总数")).not.toHaveText("0")
  await expect(取("回合总数")).not.toHaveText("0")
  // **平均每回合不是 0，也不是「—」**——两者都表示「还没跑过」
  await expect(取("平均每回合")).toContainText("token")
})

/**
 * 一半饼图、一半排行；图例在饼图**下面**且**列对齐**
 * （2026-08-16 作者要的：*「饼图的位置应该占据页面的一半…
 * 图例的位置应该在饼图的下面…模型名字应该对齐，消耗的 token 应该对齐」*）。
 *
 * 「对齐」的事实形式是**几何**：几行图例的同一列，左缘要在同一条竖线上。
 * 只看「有没有那几个字」是验不出对齐的——上一版用 flex 时字也都在。
 */
test("**饼图占一半、图例在下面且列对齐**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  const m = await page.evaluate(() => {
    const 半 = document.querySelector(".usage-half") as HTMLElement
    const 饼块 = 半.children[0] as HTMLElement
    const 排行块 = 半.children[1] as HTMLElement
    const svg = document.querySelector(".usage-pie") as SVGElement
    const 图例 = document.querySelector(".usage-legend-list") as HTMLElement
    const 数们 = [...document.querySelectorAll(".usage-legend-num")].map(
      (e) => e.getBoundingClientRect().left,
    )
    const 名们 = [...document.querySelectorAll(".usage-legend-name")].map(
      (e) => e.getBoundingClientRect().left,
    )
    return {
      整宽: 半.getBoundingClientRect().width,
      饼块宽: 饼块.getBoundingClientRect().width,
      排行块左: 排行块.getBoundingClientRect().left,
      饼块右: 饼块.getBoundingClientRect().right,
      饼底: svg.getBoundingClientRect().bottom,
      图例顶: 图例.getBoundingClientRect().top,
      数们,
      名们,
    }
  })

  // ① 两块各占一半（各自不少于四成，且左右分开）
  expect(m.饼块宽 / m.整宽, "饼图那一块没占到一半").toBeGreaterThan(0.4)
  expect(m.排行块左, "两块叠在一起了").toBeGreaterThanOrEqual(m.饼块右 - 1)

  // ② 图例在饼图**下面**，不是右边
  expect(m.图例顶, "图例还在饼图旁边").toBeGreaterThanOrEqual(m.饼底 - 1)

  /**
   * ③ 列对齐。**只有一行时这一条什么也证明不了**，所以显式跳过并说清楚——
   * 假模型只有一个模型，多模型的场景由单元那侧的口径判据覆盖。
   */
  if (m.数们.length > 1) {
    expect(Math.max(...m.数们) - Math.min(...m.数们), "token 那一列没对齐").toBeLessThanOrEqual(1)
    expect(Math.max(...m.名们) - Math.min(...m.名们), "名字那一列没对齐").toBeLessThanOrEqual(1)
  }

  // ④ 另一半是「按项目」，且数得出东西
  await expect(page.getByRole("heading", { name: "按项目" })).toBeVisible()
  await expect(page.locator(".usage-rank li").first()).toBeVisible()
})

/**
 * 日历的三个视角（2026-08-16 作者要的：*「每日，每周，累计」*）。
 *
 * 它们回答三个不同的问题，**不是同一张图的三种皮肤**：
 * 哪天在干活 / 这一周花了多少 / 到这周为止一共花了多少。
 * 所以判据盯的是**格子数与文案都真的变了**——只验按钮点得动是没用的。
 */
test("**日历三视角：每日 / 每周 / 累计**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await 进用量(page)

  // 每日：一年铺开是几百格
  const 每日格数 = await page.locator(".usage-cell").count()
  expect(每日格数).toBeGreaterThan(300)

  /**
   * **三个视角是同一张日历**（2026-08-16 作者二次定的）。
   *
   * 上一版这条断言的是「每周时格子数掉一个数量级」——那是我把每周画成
   * 一行 53 格的设计，而作者说的是*「还是一个日历表，不过悬浮的时候
   * 展示的是一周的」*。**格子数不变才是对的**，变的是每格代表什么。
   */
  await page.getByRole("button", { name: "每周", exact: true }).click()
  await expect.poll(() => page.locator(".usage-cell").count()).toBe(每日格数)
  // 同上：挑有数的那一格，别挑「最后一格」
  await page.locator(".usage-cell.l4").last().hover()
  await expect(page.locator(".usage-tip")).toContainText("那一周")

  await page.getByRole("button", { name: "累计", exact: true }).click()
  await expect.poll(() => page.locator(".usage-cell").count()).toBe(每日格数)
  await page.locator(".usage-cell").last().hover()
  await expect(page.locator(".usage-tip")).toContainText("为止一共")

  /**
   * **「整列同色」这条在这里验不了，所以不装作验了。**
   *
   * 夹具里只有今天一天有数据，而今天（跑这条用例的那天可能是周日）
   * 那一列只画得出一格——一格永远「同色」。我写过一版断言，
   * 变异（改回逐日上色）之后它照样绿：**一条判不出来的断言比没有更坏**。
   *
   * 每周确实在按周聚合，由上面那两条悬停文案证明（「那一周」/「为止一共」
   * 只可能来自周聚合那一支）。整列同色是它的视觉推论，
   * 真要盯住得把算格子那段抽成纯函数、在单元那侧喂多天数据——**记在这儿，没做**。
   */
  await page.getByRole("button", { name: "每日", exact: true }).click()
  await expect.poll(() => page.locator(".usage-cell").count()).toBe(每日格数)
  await page.locator(".usage-cell").last().hover()
  await expect(page.locator(".usage-tip")).not.toContainText("那一周")
})
