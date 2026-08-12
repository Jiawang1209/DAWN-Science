/**
 * 侧栏的形状（2026-08-11 建，**2026-08-12 按 T3-a 换了主语**）。
 * **跑真实构建产物。**
 *
 * ## 换掉的是什么
 *
 * 原来是三个入口、两列：「新建会话」领着临时会话，「新建项目」领着项目。
 * 作者 2026-08-12 把它收成一句话：
 *
 * > *「点击完新建任务后，在对话窗口选择文件夹之后，就属于是一个项目管理，
 * > 那么就会归类到左边侧边栏的项目里面。然后如果……不选择文件夹，直接对话，
 * > 那么就属于是一个会话，那么就会归类到左边侧边栏的会话里面。」*
 *
 * **入口一个，去处两个——分栏是结果，不是选择。**
 *
 * ## 为什么这份文件是重写而不是删掉
 *
 * 红了就删是这类测试唯一的死法。这里删掉的每一条，删的理由都是
 * **它的主语没了**（「顶上那颗回首页」——那颗按钮不存在了），
 * 而它守着的意图**都在下面找得到新的主语**：
 * 入口与它统领的那一列必须挨着、空着的时候不许白占空隙、
 * `⋯` 不许被列表裁掉。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/**
 * **一个入口。**
 *
 * 三个入口意味着三条各自演化的路。本项目已经因为「同一个动作两个入口」
 * 出过事：agent pill 那个菜单一度有两组语义相近的项，
 * 作者点了会新建会话的那一颗，以为自己是在换模型。
 */
test("**只有「新建任务」一个入口**", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByRole("button", { name: "新建任务" })).toBeVisible()
  await expect(page.getByRole("button", { name: "新建会话" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "新建项目" })).toHaveCount(0)
})

/**
 * **点完直接进对话，中间没有一屏。**
 *
 * 作者量的 WorkBuddy 就是这样：*「新建任务之后，直接就是干净的对话窗口。」*
 * 上一版这里要先落到首页挑一次 LLM——**那一步现在长在 composer 的 pill 上**，
 * 是作者自己定的位置（对标 Hermes 的 model pill）。
 */
test("**点完直接进对话**，不绕中间那一屏", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建任务" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".welcome")).toHaveCount(0)
})

/**
 * **没给路径的归「会话」。**
 *
 * 这条盯的是**计数**：作者报过「点一次冒出两行」——
 * 任务表列一次、旧的「对话」列又列一次。
 * 「多一行」和「多两行」在截图上很容易看成同一件事，在断言里不会。
 */
test("**没给路径 → 会话那一栏，且只多一行**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)
  await expect(page.locator(".side-section").filter({ hasText: "会话" })).toBeVisible()
  // **一条项目都没有时，那一整块不出现**：写着 `(0)` 的标题占一行、什么都没说
  await expect(page.locator(".side-section").filter({ hasText: "项目" })).toHaveCount(0)
})

/**
 * **给了路径的归「项目」，同一个路径合并成一条。**
 *
 * 作者选的是「一个项目底下挂两段」，不是两条同名并列项——
 * 它要回答的是「我上次在这个目录聊过什么」，而重名条目回答不了。
 *
 * 这里用项目行上那颗 `＋` 开第二段：**它已经知道路径了**，
 * 不必让人再把同一个文件夹选一遍。
 */
test("**同一个路径合并成一个项目**，底下挂两段", async ({ dawn }) => {
  const { page, workspace } = dawn

  /**
   * 先造出一个**带路径**的任务。
   *
   * **走协议，不走界面**：界面上设工作路径是 T3-b 的事，这条测的是
   * 「有路径的任务怎么归类」——两件事，不该互相挡着。
   * 走的是应用自己那条 IPC（`window.dawn.invoke`），**不是另造一条后门**：
   * 后门验过的东西不等于真实那条路验过。
   */
  await page.evaluate(async (ws) => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<unknown> }
    }
    await w.dawn.invoke("createTask", { agentId: "ds-chat", workspace: ws })
  }, workspace)

  // 界面上还没刷新到——**重开一次侧栏数据最省事的办法是重载**
  await page.reload()
  const 项目 = page.locator(".proj-list .proj-item").first()
  await expect(项目).toBeVisible({ timeout: 30_000 })

  // 展开它，看见里面那一段
  await 项目.locator(".row").first().click()
  await expect(项目.locator(".proj-session-list .sess-item")).toHaveCount(1)

  // 在同一个项目里再开一段——**入口就在它自己那一行上**
  await 项目.getByRole("button", { name: /里开一段新对话/ }).click()
  await expect(项目.locator(".proj-session-list .sess-item")).toHaveCount(2, { timeout: 30_000 })

  // **仍然只有一个项目**：路径相同就是同一个地方
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1)
})

/**
 * **入口与它统领的那一列挨着，中间不许白占空隙**（2026-08-11 的原意，主语换了）。
 *
 * 作者当时的原话：*「初始状态下……新建会话和新建项目是连着的，
 * 并且二者之间的间隙要基于个数来控制。」* 现在只有一个入口，
 * 于是量的是**入口与第一条会话之间**：空着的时候不该有一块白地。
 */
test("**空着的时候不留白地**，加一条会话就正好多一行", async ({ dawn }) => {
  const { page } = dawn
  const 入口 = page.getByRole("button", { name: "新建任务" })

  const 底边 = async () => {
    const b = (await 入口.boundingBox())!
    return b.y + b.height
  }
  const 侧栏底 = async () =>
    (await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().bottom)) as number

  // 空态：入口下面直到底部那些常驻入口之间，没有列表占位
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(0)
  await expect(page.locator(".side-section")).toHaveCount(0)

  await 入口.click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)

  // 多出来的是**一行会话 + 一行分区标题**，都是内容，不是白地
  const 行 = (await page.locator(".sidebar .sess-item").first().boundingBox())!
  expect(行.y).toBeGreaterThan(await 底边())
  expect(行.y + 行.height).toBeLessThan(await 侧栏底())
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
