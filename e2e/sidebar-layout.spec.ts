/**
 * 侧栏的形状（2026-08-11）。**跑真实构建产物。**
 *
 * 作者分两次说清了它：
 *   ①*「新建的项目，就在左侧的新建项目的下面，新建的会话，就在左侧的
 *   新建会话下面。然后新建完的项目，里面可以有多个会话。」*
 *   ②*「项目下也需要嵌套会话，因为一个项目下面可能会有多个会话。
 *   而会话，其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
 *
 * 于是上下两列**问的是两件事**：
 *   - 上面「会话」= **临时会话**，没有项目、自带一个独立目录
 *   - 下面「项目」= 你打开的文件夹，**展开就看见它自己的会话**
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/**
 * **两颗「新建」各走各的**（2026-08-11）。
 *
 * 作者：*「如果没有在项目下，新建对话的话，就出现 App 首页；
 * 如果在项目下，新建对话的话，就在项目下面新建对话。」*
 *
 * 顶上那颗**不建任何东西**——它把你送回首页，让你先挑 LLM
 * （*「新会话的话，我应该是直接可以重新选择 LLM」*）。
 * 项目行上那颗直接建，因为你已经用「在哪个项目」回答过一半了。
 */
test("**顶上那颗回首页，不直接建**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建会话" }).click()

  // 首页：起手卡片 + 「用 X 开始」都在
  await expect(page.locator(".welcome")).toBeVisible()
  await expect(page.getByRole("button", { name: /开始/ })).toBeVisible()
  // **一条都没建**——它只是把你送到挑 LLM 的地方
  await expect(page.locator(".session-list .sess")).toHaveCount(0)
  await expect(page.getByPlaceholder(/回车发送/)).toHaveCount(0)

  // 在首页上挑完才真的建
  await page.getByRole("button", { name: /开始/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".session-list .sess")).toHaveCount(1)
})

test("**项目行上那颗直接建**，不绕首页", async ({ dawn }) => {
  const { page } = dawn
  await page.locator(".proj-item").first().getByRole("button", { name: /里开一段新对话/ }).click()
  // 直接进对话，没有中间那一屏
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".welcome")).toHaveCount(0)
  await expect(page.locator(".proj-session-list .sess")).toHaveCount(1)
})

test("**首页那颗按钮说的是 LLM，不是 agent**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.locator(".welcome")).toBeVisible()
  /**
   * 作者：*「我做的这个就属于是一个 agent，因此首页不应该是更换一个 agent，
   * 而应该是更换一个 LLM。」*——**DAWN 自己才是那个 agent**。
   */
  await expect(page.locator(".welcome")).not.toContainText("换一个 agent")
  const pill = page.locator(".welcome .agent-pill")
  if ((await pill.count()) > 0) await expect(pill).toContainText("LLM")
})

test("**上面那一列是临时会话** —— 不属于任何项目", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建会话" }).click()
  await page.getByRole("button", { name: /开始/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  // 它在上面那一列里
  await expect(page.locator(".session-list .sess")).toHaveCount(1)
  // **项目的会话数没有涨**：它不属于那个项目
  await expect(page.locator(".proj-item").first()).toContainText("0 个会话")
})

test("**项目下嵌套它自己的会话**", async ({ dawn }) => {
  const { page } = dawn
  const 项目 = page.locator(".proj-list .proj-item").first()
  await expect(项目).toContainText("0 个会话")

  // 在这个项目里开一段——入口就在它自己那一行上
  await 项目.getByRole("button", { name: /里开一段新对话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  // 数字跟着涨（**它是真的从后端来的**），而且会话就嵌在这一行下面
  await expect(项目).toContainText("1 个会话", { timeout: 30_000 })
  await expect(项目.locator(".proj-session-list .sess")).toHaveCount(1)
  // 上面那一列还是空的：那里只放临时会话
  await expect(page.locator(".session-list .sess")).toHaveCount(0)
})

test("**顺序就是作者说的那个**：新建会话领着会话，新建项目领着项目", async ({ dawn }) => {
  const { page } = dawn
  const 顺序 = await page.locator(".sidebar").evaluate((el) => {
    // **只看顶层的那几块**：嵌套的会话列表是项目行内部的事
    const 点 = [...el.querySelectorAll(".side-action, :scope > .session-list, :scope > .proj-list")]
    return 点.map((x) =>
      x.classList.contains("side-action")
        ? "side-action"
        : x.classList.contains("session-list")
          ? "session-list"
          : "proj-list",
    )
  })
  /**
   * **头上多了「新建任务」那一区**（T2，2026-08-12）。
   *
   * 任务将取代下面那两列，但这一批先并排放着——那两个名字被几十条 e2e
   * 当作选择器用，一次换掉会红一大片，而**红成一片就没人看得出哪条是真问题**。
   *
   * 这个夹具里一条任务都没有，**于是任务列一行都不占**（与会话列同一条纪律）——
   * 所以顶上只多出那一颗按钮。去掉它之后，
   * **这条断言原本守的东西一个字都没变**：「新建 X」紧挨着它统领的那一列。
   */
  expect(顺序[0]).toBe("side-action") // 新建任务
  expect(顺序.slice(1)).toEqual(["side-action", "session-list", "side-action", "proj-list"])
})

/**
 * **两颗按钮之间的距离 = 中间有几条会话**（2026-08-11）。
 *
 * 作者：*「初始状态下（没有任何新建会话和新建项目）的情况下，
 * 新建会话和新建项目是连着的，并且二者之间的间隙要基于个数来控制。
 * 如果有一个临时的会话，那么新建会话和新建项目中间会有一个临时会话。」*
 *
 * 所以这里量的是**像素**：空着的时候两行紧挨着（一行的高度以内），
 * 有一条会话时正好多出一条会话行的高度。
 */
test("**空着的时候两颗按钮是连着的**，加一条会话就正好多一行", async ({ dawn }) => {
  const { page } = dawn
  const 会话按钮 = page.getByRole("button", { name: "新建会话" })
  const 项目按钮 = page.getByRole("button", { name: "新建项目" })

  const 间距 = async () => {
    const a = (await 会话按钮.boundingBox())!
    const b = (await 项目按钮.boundingBox())!
    return b.y - (a.y + a.height)
  }

  // 空态：**连着**——中间连一句「还没有会话」的占位都没有
  const 空的时候 = await 间距()
  expect(空的时候).toBeLessThan(8)

  await 会话按钮.click()
  await page.getByRole("button", { name: /开始/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".session-list .sess")).toHaveCount(1)

  // 多了一条会话，就正好多出一行的高度
  const 一条行高 = (await page.locator(".session-list .sess-item").first().boundingBox())!.height
  const 有一条时 = await 间距()
  expect(有一条时 - 空的时候).toBeGreaterThan(一条行高 * 0.8)
  /**
   * **上界从 1.6 放到 2.4**（2026-08-12）。
   *
   * 侧栏加了分区标题「对话 N」（作者要的，学自 WorkBuddy）——
   * 多出来的那一行是**内容**（它说「下面这些是一类，一共几条」），
   * 不是空占的间距。
   *
   * **这条断言原本守的东西没变**：中间不许有白占的空隙。
   * 一行会话 + 一行标题仍然应当远小于两行会话的量级。
   */
  expect(有一条时 - 空的时候).toBeLessThan(一条行高 * 2.4)
})

test("**下拉框没了** —— 它装不下「一列项目，每个里面还有会话」", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByLabel("当前项目")).toHaveCount(0)
})

/**
 * `⋯` 菜单不该被会话列表裁掉（2026-08-11，作者提）。
 *
 * 作者：*「即便是有多少对话，我只要是弹出 `⋯` 的时候，应该在对话的右侧
 * 弹出一个滚动条，而不是在对话的地方弹出来滚动条。」*
 *
 * 根因：会话列表是 `max-height: 45vh; overflow-y: auto`，而菜单原来是
 * `position: absolute`——**它被这个滚动容器裁掉**，浏览器于是给出一条
 * 滚动条让人去够它。**只有一条对话时更难受**：列表本身没得滚，
 * 那个菜单就永远只露半截。
 */
test("**菜单开在行的右侧，且没被列表裁掉**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const 行 = page.locator(".session-list .sess-item").first()
  await expect(行).toBeVisible({ timeout: 30_000 })

  const 按钮 = 行.getByRole("button", { name: /会话操作/ })
  await 按钮.click()
  const 菜单 = page.locator(".row-menu")
  await expect(菜单).toBeVisible()

  const b = (await 按钮.boundingBox())!
  const m = (await 菜单.boundingBox())!
  // **在行的右侧**：作者的原话
  expect(m.x).toBeGreaterThanOrEqual(b.x + b.width - 1)

  /**
   * **整个菜单都在窗口里**——不是只露半截。
   * 这一条才是「够不着」的直接判据：裁切的症状就是它有一部分在视口之外。
   */
  // **量真实窗口**：Electron 里没有 Playwright 意义上的 viewport，`viewportSize()` 是 null
  const 窗高 = await page.evaluate(() => window.innerHeight)
  expect(m.y).toBeGreaterThanOrEqual(0)
  expect(m.y + m.height).toBeLessThanOrEqual(窗高)

  /** **列表没有因此变得可滚**：那条滚动条正是作者报的东西 */
  const 溢出 = await page.locator(".session-list").evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(溢出).toBeLessThanOrEqual(1)
})
