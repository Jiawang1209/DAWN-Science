/**
 * 远端连接（②-B · R3/R4）。**跑真实构建产物，对着那台假服务器。**
 *
 * 作者：*「左边搞一个固定的『远端连接』，可以增加分组，分组里面是 ssh 的服务器，
 * 类似 XTerminal 的那种登陆效果。」*
 *
 * ## 这份用例是那台假服务器存在的理由
 *
 * 没有它，「添加 → 连接 → 连上了」只能靠人拿真机试——**那意味着它几乎不会被试**。
 * 而它假的只是「另一端是谁」：认证真判、退出码真带、断线真断。
 *
 * 三条盯死：
 *   1. **入口看得见**（不是悬停才出现的 `＋`——那已经被作者报过两次「没有这个功能」）
 *   2. **口令不回显**，且改别的字段不会把它弄丢
 *   3. **连不上要说清是为什么**，就在那一行上
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.use({
  dawnOptions: {
    fakeSsh: true,
    // 假模型被安排去跑一条**会换目录**的命令：`cd` 粘不住的话，
    // 头上那一条不会变，而那正是要验的东西
    toolCall: { toolName: "bash", args: { command: "cd 数据 && pwd" } },
  },
})

/** 打开那一区。**默认收起**——没有远端的人不该为此多占一行 */
async function 展开远端(page: import("@playwright/test").Page) {
  // **2026-08-14 改名**：「远端连接」→「远端服务器」（作者定的）
  const head = page.getByRole("button", { name: /远端服务器/ })
  await expect(head).toBeVisible()
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
}

async function 加一台(
  page: import("@playwright/test").Page,
  opts: { host?: string; user?: string; secret?: string; group?: string; label?: string } = {},
) {
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill(opts.host ?? "fake.example")
  await page.locator("#conn-user").fill(opts.user ?? "dawn")
  if (opts.label) await page.locator("#conn-label").fill(opts.label)
  if (opts.group) await page.locator("#conn-group").fill(opts.group)
  // 假服务器认的口令写死为 `dawn`（见 src/remote/fake-ssh.ts）
  await page.locator("#conn-secret").fill(opts.secret ?? "dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
}

test("**整条路**：加一台 → 连上 → 断开", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)

  // 一台都没有时**说清楚**，不是一片空白
  await expect(page.getByText("还没有服务器")).toBeVisible()

  await 加一台(page, { label: "实验室", group: "集群" })

  const row = page.locator(".remote-row").first()
  await expect(row).toBeVisible()
  await expect(row.locator(".remote-label")).toHaveText("实验室")
  // **分组是一个标签，不是树**；没分组的不会被塞进一个叫「未分组」的假分组
  await expect(page.locator(".remote-group-name")).toHaveText("集群")
  await expect(row.locator(".remote-sub")).toContainText("dawn@fake.example")
  // **刚加的写 `exited`，且没有原因行**——我们还没试过，谈不上「连不上」。
  // 「连不上」长什么样，由下面那条用例守（`exited` + 一行原因 + 红点）
  await expect(row.locator(".remote-status")).toHaveText("exited")
  await expect(row.locator(".remote-reason")).toHaveCount(0)

  await row.getByRole("button", { name: "连接" }).click()
  // **2026-08-15 改词**：连上写 `alive`、断了写 `exited`——与侧栏会话行同一套
  await expect(row.locator(".remote-status")).toHaveText("alive", { timeout: 15_000 })
  await expect(row).toHaveAttribute("data-state", "ready")

  await row.getByRole("button", { name: "断开" }).click()
  /**
   * **人按的断开也写 `exited`**（2026-08-16 作者定的：
   * *「not connected 其实就是 exited，connected 就是 alive」*）。
   *
   * 这推翻了 2026-08-15 的分法（那时人按的断开写「未连」，掉线才写 `exited`）。
   * **两者仍分得出来，只是不靠这个词**：掉线多一行原因、点是红的。
   * 所以这里连着断言「没有原因行」——**没了它，这条用例与「连不上」那条
   * 就再没有任何区别**，而那正是我们分不清两种断开的那一刻。
   */
  await expect(row.locator(".remote-status")).toHaveText("exited")
  await expect(row.locator(".remote-reason")).toHaveCount(0)
  await expect(row).toHaveAttribute("data-state", "idle")
})

test("**连不上时说清是为什么**，就在那一行上", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "口令错的", secret: "不对的口令" })

  const row = page.locator(".remote-row").first()
  await row.getByRole("button", { name: "连接" }).click()

  /**
   * 一句「连不上」什么都没说：口令错、主机不通、私钥读不到，
   * 要人去改的东西完全不同。所以底层那句话要原样上来。
   */
  await expect(page.locator(".remote-problem")).toContainText(/authentication/i, {
    timeout: 15_000,
  })
  await expect(row.locator(".remote-status")).toHaveText("exited")
  await expect(row.locator(".remote-reason")).toBeVisible()
})

test("**口令不回显**，且改别的字段不会把它弄丢", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "甲" })

  const row = page.locator(".remote-row").first()
  await row.getByRole("button", { name: "编辑" }).click()

  // **框是空的**：回显一次，它就落进了截图、日志和录屏
  await expect(page.locator("#conn-secret")).toHaveValue("")
  // 但要明说「已配置」，否则人会以为自己没配过
  await expect(page.locator("#conn-secret")).toHaveAttribute("placeholder", /已配置/)

  // 只改分组，**不碰口令那个框**
  await page.locator("#conn-group").fill("挪过去")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(page.locator(".remote-group-name")).toHaveText("挪过去")

  // 口令还在：连得上就是证据（假服务器认的口令是 `dawn`）
  await page.locator(".remote-row").first().getByRole("button", { name: "连接" }).click()
  await expect(page.locator(".remote-row").first().locator(".remote-status")).toHaveText("alive", {
    timeout: 15_000,
  })
})

test("**入口看得见**：不是悬停才出现的 ＋", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  const add = page.getByRole("button", { name: /添加服务器/ })
  /**
   * `toBeVisible()` 对 `opacity: 0` **仍然算可见**——本项目栽过。
   * 所以直接量它。
   */
  const opacity = await add.evaluate((el) => getComputedStyle(el).opacity)
  expect(Number(opacity)).toBeGreaterThan(0.5)
  // 而且带文字，不是一个光秃秃的符号
  await expect(add).toContainText("添加服务器")
})

test("删掉一台：**先说会连带发生什么**，再删", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "要删的" })

  await page.locator(".remote-row").first().getByRole("button", { name: "编辑" }).click()
  await page.getByRole("button", { name: "删除", exact: true }).click()

  // 不可逆的动作要说清连带后果**与不会发生什么**
  await expect(page.getByRole("dialog")).toContainText("钥匙串")
  await expect(page.getByRole("dialog")).toContainText("那台服务器上的文件不会有任何变化")

  await page.getByRole("button", { name: "删除", exact: true }).click()
  await expect(page.getByText("还没有服务器")).toBeVisible()
})

/**
 * **这条是整批的落点：agent 的手真的落在那台机器上了吗。**
 *
 * 前面几条验的都是「连得上」。连得上而工具还打在本地，是这条线最坏的一种坏法——
 * **它一点异常都不会表现出来**：命令照跑、输出照回，只是跑在了错的机器上。
 */
test("**在服务器上开一段对话**：起点是家目录，命令打到那台机器", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })

  const row = page.locator(".remote-row").first()
  await row.getByRole("button", { name: /新对话/ }).click()

  /**
   * **头上那一条必须显示「在哪台机器的哪个目录」。**
   *
   * 它是这条线上唯一的防线：*你以为在 A 目录、实际在 B 目录，
   * 然后说一句「把这里的文件都删了」。*
   */
  const 头 = page.locator(".conv-remote")
  await expect(头).toBeVisible({ timeout: 30_000 })
  await expect(头.locator(".conv-remote-host")).toHaveText("假机器")
  // 假服务器的家目录是 /home/dawn，显示成 `~`
  await expect(头.locator(".conv-remote-cwd")).toHaveText("~")

  /**
   * **这一区不再列对话了**（2026-08-14 作者定的，判据跟着翻面）。
   *
   * 原来这条钉的是「侧栏那一行也挂上了这段对话」，理由是作者报过
   * *「在服务器的对话，不能删除，也不能挪动顺序」*——那时这里画的是一个
   * 只能点的行，所以改成了与别处同一种 `.sess-item`。
   *
   * **那个诉求现在由另一条路满足**：远端对话成了一等任务
   * （`b399f49`），落在侧栏「服务器」收纳里，天然能改名/置顶/批量删。
   * 于是这里再列一份就是**同一个东西有两个家**，作者要求撤掉。
   *
   * 判据翻面而不是删除：**理由留在这儿**，下一个人看到的不是一条凭空消失的规则。
   */
  await expect(row.locator(".sess-item"), "这一区不该再列对话了").toHaveCount(0)
})

test("**命令跑在远端，`cd` 之后粘住**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  await page.getByPlaceholder(/今天帮你做些什么/).fill("看看这儿有什么")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  /**
   * 假模型被安排去跑 `cd 数据 && pwd`。三件事要同时成立：
   *   1. 命令**打到了那台假服务器**（本地根本没有 `/home/dawn`）
   *   2. `cd` **粘住了**——头上那一条跟着变
   *   3. 内部标记**不出现在输出里**
   */
  const tool = page.locator(".tool").first()
  await expect(tool).toBeVisible()
  await tool.locator(".tool-head").click()
  await expect(tool.locator(".tool-result")).toContainText("/home/dawn/数据")
  await expect(tool.locator(".tool-result")).not.toContainText("__DAWN_CWD__")

  await expect(page.locator(".conv-remote-cwd")).toHaveText("~/数据", { timeout: 15_000 })
})

/**
 * **在服务器上开的对话，要落进侧栏那个「服务器」收纳**（2026-08-14 作者报的）。
 *
 * 作者：*「我刚刚在同一个服务器里面加入了一个新的会话……
 * 但是我发现会话，没有收录到服务器的收纳的对话里面。」*
 *
 * 根因：那颗「新对话」走的是 `createRemoteSession`——**它只起会话、不建任务**，
 * 而侧栏在任务模型之后以任务为骨架，于是那段对话在收纳里根本不存在。
 * 改走 `createTask({connectionId})` 之后才收得到。
 *
 * 收纳的三层：**服务器（收纳）→ 每台机器 → 那台机器上的会话**。
 */
test("**在服务器上开的对话，出现在侧栏的「服务器」收纳里**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })

  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  // 等它真的开起来（头上那一条是这条线的既有判据）
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  // 第一层：收纳标题
  const 收纳 = page.locator(".side-section", { hasText: "服务器" })
  await expect(收纳, "侧栏没有「服务器」这个收纳").toBeVisible()

  // 第二层：那台机器
  const 机器 = page.locator(".side-server")
  await expect(机器, "收纳里没有这台机器").toHaveCount(1)
  await expect(机器.locator(".side-subhead")).toContainText("假机器")

  // 第三层：那台机器底下真的有一条会话
  await expect(
    机器.locator("li").first(),
    "机器底下一条会话都没有——那正是作者报的现象",
  ).toBeVisible()
})

/**
 * **同一台机器上开第二段，仍然归在同一台底下**（作者：*「一个 IP 其实可以包含多个会话」*）。
 * 归错的表现是同一台机器出现两次——那时「这两段在不在同一台上」就说不清了。
 */
test("**同一台机器上的多段对话，收在同一台底下**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })

  const 新对话 = page.locator(".remote-row").first().getByRole("button", { name: /新对话/ })
  await 新对话.click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await 展开远端(page)
  await 新对话.click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  await expect(page.locator(".side-server"), "同一台机器被拆成了两组").toHaveCount(1)
  await expect(page.locator(".side-server li")).toHaveCount(2)
})

/**
 * **服务器行与下面的会话行落在同一条线上**（2026-08-16，作者报的两件）：
 *
 * > *「服务器的连接和未连接，能不能和下面会话中的 exited 保持对齐呢」*
 * > *「服务器的位置也要和下面的会话也对齐一下」*
 *
 * 改之前量到的：服务器行通铺 `0 → 264`，会话行内缩 `12 → 216`；
 * 状态词一个在 231、一个在 178，**差 53px**。
 *
 * 这里比的是**两者之间的差**，不是写死的坐标——侧栏可以被拖宽，
 * 而「同一列里只有一条起跑线」不该随宽度变。
 */
test("**服务器行与会话行同一条线**：左缘、名字、状态词都对齐", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await expect(page.locator(".session-list li .state").first()).toBeVisible()

  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await expect(page.locator(".remote-status").first()).toBeVisible()

  const 量 = await page.evaluate(() => {
    const 盒 = (sel: string) => {
      const e = document.querySelector(sel) as HTMLElement | null
      if (!e) return null
      const r = e.getBoundingClientRect()
      return { 左: r.left, 右: r.right, 字号: getComputedStyle(e).fontSize }
    }
    return {
      服务器行: 盒(".remote-row"),
      服务器名: 盒(".remote-label"),
      服务器状态: 盒(".remote-status"),
      会话行: 盒(".session-list li .row"),
      会话名: 盒(".session-list li .sess-title"),
      会话状态: 盒(".session-list li .state"),
    }
  })
  for (const [名, 盒] of Object.entries(量)) expect(盒, `没量到 ${名}`).not.toBeNull()
  const m = 量 as { [K in keyof typeof 量]: NonNullable<(typeof 量)[K]> }

  const 差 = (a: number, b: number) => Math.abs(a - b)
  expect(差(m.服务器行.左, m.会话行.左), "两种行的左内缩不一样").toBeLessThanOrEqual(2)
  expect(差(m.服务器行.右, m.会话行.右), "服务器行没给行尾那一格留位置").toBeLessThanOrEqual(2)
  expect(差(m.服务器名.左, m.会话名.左), "名字的起跑线不一样").toBeLessThanOrEqual(2)
  // 状态词是**右对齐**的一列：右缘才是它的那条线
  expect(差(m.服务器状态.右, m.会话状态.右), "状态词落不到同一条竖线上").toBeLessThanOrEqual(2)
  expect(m.服务器状态.字号, "状态词字号不同档").toBe(m.会话状态.字号)
})
