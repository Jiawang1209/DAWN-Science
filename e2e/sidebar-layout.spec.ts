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
import { test, expect, 开一段临时会话, 等进了对话, 进设置 } from "./fixtures.js"

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
 * **点完回到那个画面，什么都不建**（2026-08-12 换主语）。
 *
 * 作者定案：*「我点击新建任务之后，依旧也是这个画面，然后我可以选择文件夹，
 * 一旦选择文件夹了，那么就是一个项目，如果直接开启一个对话，
 * 那么就算是一个普通的会话。」*
 *
 * 所以「新建任务」**不再直接进一段新对话**——它把人送回初始画面，
 * 而那个画面本身就是一个能打字的输入卡。**真正建出来的那一刻是第一次开口。**
 */
test("**点完回到初始画面，不建任何东西**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建任务" }).click()
  /**
   * **这里不能用 `等进了对话`**：这条测的恰恰是「**停在初始画面**」，
   * 而那个 helper 等的是 `.conv-title`——只有对话那一屏才有。
   * （一次全局替换把它也换了，于是它稳定超时。**判据要跟着断言的意图走**。）
   */
  await expect(page.locator(".welcome")).toBeVisible()
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(0)
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
  await 等进了对话(page)

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

  // **开口那一刻才建出来**（2026-08-12）：「新建任务」只回初始画面
  await 入口.click()
  const box = page.getByPlaceholder(/今天帮你做些什么/)
  await expect(box).toBeVisible({ timeout: 60_000 })
  await box.fill("说一句")
  await box.press("Enter")
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1, { timeout: 30_000 })

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

/**
 * **顶部那几行的图标与文字落在同一条竖线上**（2026-08-12）。
 *
 * 作者报了两次：*「远端连接和上面的新建任务其实没有对齐，并且也没有图标」*、
 * *「文字没有对齐，图标也没有对齐」*。
 *
 * 量出来差 4px，根因是 `.remote-head` 自己写了 `margin: 0 8px`，
 * 而 `.row` 统一的是 `0 12px`——**一个覆写把一整行挪了 4 像素**。
 *
 * ## 为什么这条判得了
 *
 * 「对齐」在别处常常是主观的，但**同一种行的左缘**不是：它要么相等，
 * 要么不相等。所以它该有一条扫描，而不是靠下一次有人看出来。
 * （本项目的第二条准入规则：能判定的设计规则，配一个扫描测试。）
 */
test("**固定区那几行，图标与文字同一条左缘**", async ({ dawn }) => {
  const { page } = dawn
  const 左缘 = async (sel: string) =>
    await page.locator(sel).first().evaluate((el) => {
      const icon = el.querySelector("svg")
      const name = el.querySelector(".name")
      return {
        行: Math.round(el.getBoundingClientRect().x),
        图标: icon ? Math.round(icon.getBoundingClientRect().x) : -1,
        文字: name ? Math.round(name.getBoundingClientRect().x) : -1,
      }
    })

  const 新建 = await 左缘(".side-action")
  const 远端 = await 左缘(".remote-head")

  expect(新建.图标).toBeGreaterThan(0)
  expect(远端.图标).toBeGreaterThan(0)
  // **逐项相等**：只比行的左缘不够——图标或文字任一处歪了，人一眼就看得见
  expect(远端.行).toBe(新建.行)
  expect(远端.图标).toBe(新建.图标)
  expect(远端.文字).toBe(新建.文字)
})

/**
 * **顶部四项 + 一条横线**（2026-08-12，作者定的顺序）。
 *
 * 作者：*「左边侧边栏，从上到下设置一下固定的：第一个新建任务……
 * 然后画一个横线，下面是项目 然后是会话。」*
 *
 * 这条盯的是**顺序与分界**：四项在线上面，项目/会话在线下面。
 * 「上面是我能用什么、下面是我做过什么」——那条线是这句话的可见形式。
 */
test("**固定入口在横线上面，项目与会话在下面**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  const y = async (sel: string) =>
    (await page.locator(sel).first().boundingBox())!.y

  const 横线 = await y(".side-divider")
  // 2026-08-23：技能 / 子 Agent / 插件 / MCP / 远程助理并进了设置，横线上面只剩新建任务、远端、定时
  for (const 名 of ["新建任务", "定时"]) {
    expect(await y(`.sidebar >> role=button[name=/^${名}/]`), `${名} 应在横线上面`).toBeLessThan(横线)
  }
  for (const 名 of ["Skills", "子 Agent", "插件", "MCP 服务器", "远程助理"]) {
    expect(await page.locator(`.sidebar >> role=button[name=/^${名}/]`).count(), `${名} 不该还在侧栏上`).toBe(0)
  }
  expect(await y(".remote-head"), "远端连接应在横线上面").toBeLessThan(横线)
  // 分区标题（项目 / 会话）在线下面
  expect(await y(".side-section")).toBeGreaterThan(横线)
})

/**
 * **子 Agent 那一屏列的是真东西**（2026-08-12；2026-08-15 随改名调整）。
 *
 * 我提过技能与 MCP 现在几乎是空的、建议等能用了再上；作者要求先做出来。
 * 那就做出来，但**这一屏不是占位**：`.dawn/agents/*.md` 的子 agent
 * 本来就能跑（`src/subagent/` 有加载器与执行器），此前只是界面上看不见。
 *
 * 夹具的工作区里有一份 `scout.md.example`——**带 `.example` 的加载器不认**，
 * 所以这一屏应当如实说「还没有」，并把该往哪写说清楚。
 *
 * **这条只改了入口的名字，守的还是同一件事**：不说清放哪儿，
 * 「怎么加一个」就无从下手。（那一屏 2026-08-15 从「技能」改叫「子 Agent」——
 * 技能这个词让给了 Agent Skills，两者是两种东西。）
 */
test("**子 Agent 那一屏说得出「去哪写」**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 进设置(page, "子 Agent")
  await expect(page.locator(".skills-page")).toBeVisible()
  // 目录要说出来：不说清楚放哪儿，「怎么加一个」就无从下手
  await expect(page.locator(".skills-page")).toContainText(".dawn/agents")
})

/**
 * **MCP 那一屏如实说清做到了哪儿**（2026-08-15 改写）。
 *
 * 这条原来断言的是「不假装能配」——**它当时是对的**：那时管道只通到
 * 托管的 claude / codex，内置对话那条没接，所以屏上明写着「还不能在这里配」。
 *
 * 现在真的能配了（我们自己做了 MCP 客户端，pi 不带）。**判据跟着事实走，
 * 但守的是同一件事**：这一屏不许出现「看起来能用其实不能用」的东西。
 * 于是改成——**一台都没配时，要说清去哪儿加**，而不是摆一个空列表
 * 让人以为「我还没装而已」。
 */
test("**一台都没配时，说清去哪儿加**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "MCP 服务器")
  await expect(page.locator(".skills-page")).toContainText(/还没有配 MCP 服务器/)
  // **路径要说出来**：不说清放哪儿，「怎么加一个」就无从下手（与技能那一屏同一条）
  await expect(page.locator(".skills-page")).toContainText("providers.yaml")
})
