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
  // **两种语言下都是 `alive` / `connecting` / `exited`**（2026-08-16 作者定的）
  // ——夹具跑在中文，而这一列本来就不跟语言变
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

/**
 * **切了语言，这一列不变**（2026-08-16 作者定的：
 * *「无论是中文模式，还是英文模式，我们都是 alive/connecting/exited」*）。
 *
 * 今天这条用例改过两次方向，两次都对着当时的决定：
 * 先是「切得动」（中文 `连接/断连` ↔ 英文 `alive/exited`），
 * 现在是「切不动」。**留着它是因为两个方向都需要判据**——
 * 「不变」同样是一句会被无意打破的承诺：任何人给这三个词套上 `t()`，
 * 中文界面下它们就会变回中文，而那正是作者不要的。
 *
 * 顺带守住下面这件：**会话行那一列也是 `alive` / `exited`**，
 * 两列在两种语言下读的是同一套词。
 */
test("**切了语言，服务器状态词不变**：始终 alive / exited", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  const 状态 = page.locator(".remote-row").first().locator(".remote-status")
  await expect(状态).toHaveText("exited")

  await page.locator(".remote-row").first().getByRole("button", { name: "连接" }).click()
  await expect(状态).toHaveText("alive", { timeout: 15_000 })

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "外观", exact: true }).click()
  await page.getByRole("radio", { name: "English" }).click()
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")

  await 展开远端英文(page)
  // 同一台机器、同一个状态，**换了语言也还是这个词**
  await expect(状态, "有人给这三个词套上了 t()").toHaveText("alive")

  await page.locator(".remote-row").first().getByRole("button", { name: "Disconnect" }).click()
  await expect(状态).toHaveText("exited")
})

/** 英文界面下那一区的标题是 `Remote servers` */
async function 展开远端英文(page: import("@playwright/test").Page) {
  const head = page.getByRole("button", { name: /Remote servers/ })
  await expect(head).toBeVisible()
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
}

/**
 * **那三颗动作永远在一行里，且没被裁掉**（2026-08-16，作者三句）：
 *
 * > *「新对话、连接、编辑，竟然出现了换行折叠，这是不行的，不好看」*
 * > *「不是宽度的问题，是折叠换行的效果不好看」*
 * > *「你就模仿下面会话收纳里面，会话标题不换行，不折叠就好了」*
 *
 * 原来的症状是**词被拆开**：「连接」竖成「连／接」。`flex-wrap` 本来就是 `nowrap`——
 * 断的是**每颗按钮内部**，因为 flex 项目能缩到 `min-content`，
 * 而中文的 `min-content` 是一个字。
 *
 * 这条用例挑的是**最紧的那个组合**：英文（词更长）＋ 侧栏拖到最窄（`SIDEBAR_MIN` = 200）。
 * 中文能过说明不了什么——出事的一定是英文那一侧。
 */
test("**服务器那三颗动作不换行、不被裁**：英文 + 最窄侧栏", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "外观", exact: true }).click()
  await page.getByRole("radio", { name: "English" }).click()
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")
  await 展开远端英文(page)

  /**
   * 把侧栏收到最窄（下界 200 由 `clampWidth` 把住，多按也停在那儿）。
   *
   * **走键盘而不是合成指针拖动**：拖动这条路在这里量到过只走了 13px 就停
   * （`dragging` 是 React 状态，前几个 `pointermove` 落在它变 true 之前），
   * 于是用例是在一条 251 宽的侧栏上做的——**全绿，什么也没证明**。
   * 键盘那条一步 16px，确定、且本身就是一条真实的无障碍路径。
   *
   * **宽度是异步落下来的**：按完立刻量，量到的还是旧值（这里踩过一次，
   * 症状是「按了六下还是 260」，看着像键盘那条路坏了）。所以用轮询等它落定。
   */
  const sash = page.locator(".side-sash")
  await sash.focus()
  for (let i = 0; i < 6; i++) await sash.press("ArrowLeft")
  await expect
    .poll(() => page.evaluate(() => Math.round(document.querySelector(".sidebar")!.getBoundingClientRect().width)), {
      message: "侧栏没收到最窄",
      timeout: 5000,
    })
    .toBe(200)

  const m = await page.evaluate(() => {
    const box = document.querySelector(".remote-actions") as HTMLElement
    const r = box.getBoundingClientRect()
    return {
      侧栏宽: Math.round(document.querySelector(".sidebar")!.getBoundingClientRect().width),
      容器右: r.right,
      行高: r.height,
      颗: [...box.querySelectorAll("button")].map((b) => {
        const q = b.getBoundingClientRect()
        return { 字: b.textContent?.trim() ?? "", 顶: Math.round(q.top), 右: q.right, 高: Math.round(q.height) }
      }),
    }
  })
  /**
   * **先验前提**：拖到底了吗。
   *
   * 拖不动的话，下面三条就是在一条 264 的宽侧栏上做的——全绿，什么也没证明。
   * 这类「前提悄悄没成立」的假绿，本项目栽过不止一次。
   */
  expect(m.侧栏宽, "没拖到最窄，下面几条就白做了").toBe(200)
  expect(m.颗.length, "这一行本来有三颗").toBe(3)

  // ① 同一个 `top` = 在同一行上。**这是「不换行」的事实形式**
  const 顶 = [...new Set(m.颗.map((c) => c.顶))]
  expect(顶, `换行了：${JSON.stringify(m.颗)}`).toHaveLength(1)

  // ② 每颗都只有一行高。整颗不换行、词内也不断
  for (const c of m.颗) {
    expect(c.高, `「${c.字}」被拆成了两行`).toBeLessThanOrEqual(m.行高)
  }

  // ③ 没被裁掉。`overflow: hidden` 是兜底，**不该在最窄处就用上**
  const 末 = m.颗[m.颗.length - 1]!
  expect(末.右, `「${末.字}」被裁掉了 ${Math.round(末.右 - m.容器右)}px`).toBeLessThanOrEqual(m.容器右)
})

/**
 * **真放不下时是裁掉，不是换行**——照 `.sess-title` 那一副
 * （作者：*「你就模仿下面会话收纳里面，会话标题不换行，不折叠就好了」*）。
 *
 * 上一条用例证明的是「当前这几个词在最窄的侧栏里放得下」。**它证明不了机制**：
 * 眼下还剩 8px 余量，于是把 `white-space: nowrap` 和 `flex-wrap: nowrap`
 * 一起撤掉，那条用例照样绿——变异测试当场量到了这件事。
 *
 * 所以这里**主动把一颗按钮的字撑长**，逼出那个条件。撑长之后只有两种结局：
 * 裁掉（对）或者换行（错），而它们在几何上是分得开的——行高变不变。
 */
test("**动作条挤爆时裁掉而不换行**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await expect(page.locator(".remote-actions")).toBeVisible()

  const m = await page.evaluate(() => {
    const box = document.querySelector(".remote-actions") as HTMLElement
    const 原高 = box.getBoundingClientRect().height
    const 颗 = [...box.querySelectorAll("button")]
    // **在同一个 evaluate 里改完就量**：React 没有机会重画回去
    颗[0]!.textContent = "＋ 新对话 这是一个长得离谱的名字 用来把这一行挤爆 for good measure"
    const r = box.getBoundingClientRect()
    return {
      原高,
      现高: r.height,
      容器右: r.right,
      颗: 颗.map((b) => {
        const q = b.getBoundingClientRect()
        return { 字: (b.textContent ?? "").slice(0, 8), 顶: Math.round(q.top), 高: Math.round(q.height), 右: q.right }
      }),
    }
  })

  // ① 行没变高 = 谁都没换行（换行了这里会翻倍）
  expect(m.现高, `挤爆之后这一行从 ${m.原高} 长到了 ${m.现高}`).toBeLessThanOrEqual(m.原高)

  // ② 三颗仍在同一条基线上
  expect([...new Set(m.颗.map((c) => c.顶))], `换行了：${JSON.stringify(m.颗)}`).toHaveLength(1)

  // ③ 每颗都还是一行高——词内也没被拆（中文的 `min-content` 是一个字）
  for (const c of m.颗) expect(c.高, `「${c.字}…」被拆成了两行`).toBeLessThanOrEqual(m.原高)

  // ④ 容器没被撑宽：超出的那截落在框外，由 `.sidebar` 的 `overflow-x: hidden` 裁掉
  expect(m.颗[m.颗.length - 1]!.右, "容器被撑开了，那就不是裁").toBeGreaterThan(m.容器右)
})

/**
 * **侧栏里没有一行是靠换行来容纳的**（2026-08-16，作者：
 * *「远端服务器/Remote servers 也在换行。我们把侧边栏固定的选项，
 * 中文/英文 也都不换行」*）。
 *
 * 这条**不点名任何一条入口**。点名的话，它只证明「远端服务器」这一条没事，
 * 而下一个被加进侧栏的长词照样会断——那正是今天这件事的来路：
 * 上一轮修好了服务器那三颗动作，分区标题却还在断。
 *
 * 扫的是几何：**内容高度超过一个行高 = 断了**。中英各扫一遍，
 * 且把侧栏收到最窄——**英文 + 最窄是最紧的那个组合**，
 * 实测也只有它抓得出东西（`Remote servers` 断成两行，52px）。
 */
test("**侧栏所有固定入口都不换行**：中英 × 最窄侧栏", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)

  const 扫 = () =>
    page.evaluate(() => {
      const 断了: { 字: string; 高: number; 行高: number }[] = []
      const 选 =
        ".sidebar .row, .sidebar .side-section, .sidebar .side-head, .sidebar .remote-group-name"
      for (const e of document.querySelectorAll(选)) {
        const cs = getComputedStyle(e)
        const 行高 = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
        const 内 =
          e.getBoundingClientRect().height -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom)
        // 留 1.4 倍的余地：`min-height` 撑出来的那点不算断行
        if (内 > 行高 * 1.4) {
          断了.push({ 字: (e.textContent ?? "").trim().slice(0, 20), 高: Math.round(内), 行高: Math.round(行高) })
        }
      }
      return 断了
    })

  const 收到最窄 = async () => {
    const sash = page.locator(".side-sash")
    await sash.focus()
    for (let i = 0; i < 6; i++) await sash.press("ArrowLeft")
    await expect
      .poll(() =>
        page.evaluate(() => Math.round(document.querySelector(".sidebar")!.getBoundingClientRect().width)),
      )
      .toBe(200)
  }

  await 收到最窄()
  expect(await 扫(), "中文界面上有一行断了").toEqual([])

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "外观", exact: true }).click()
  await page.getByRole("radio", { name: "English" }).click()
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")
  await 展开远端英文(page)
  expect(await 扫(), "英文界面上有一行断了").toEqual([])
})

/**
 * **远端会话里打开「文件」，看到的必须是那台服务器**（批 3，2026-08-17）。
 *
 * 这条是这一批的收口判据，而它对应一个**已经存在过的 bug**：
 * `listDirectory` / `readFile` 此前只认 `projectId`，用本地 fs 读；
 * 而远端会话挂在一个隐藏的临时项目下，那个项目的工作区是**本机的 scratch 目录**。
 * 于是你在 gs191 的会话里打开文件，看到的是本机的一个临时目录——
 * **它不报错，就是安静地给你看错东西**。
 */
test("**远端会话的文件面板长在那台服务器上**，不是本机", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()
  const 面板 = page.locator(".right-dock .files-view")
  await expect(面板).toBeVisible()

  /**
   * ① **头上写着是哪台机器**。不写的话本地与远端在屏幕上长得一模一样，
   * 而那正是上面说的那个 bug 的形状——你根本没机会发现。
   */
  await expect(面板.locator(".files-where-name")).toHaveText("假机器")

  // ② 树上是**那台机器**的东西（假服务器家目录里有「读我.md」与「数据」）
  await expect(面板.getByRole("button", { name: /读我\.md/ })).toBeVisible({ timeout: 30_000 })
  await expect(面板.getByRole("button", { name: "数据", exact: true })).toBeVisible()

  // ③ 预览读的也是那台机器上的字节
  await 面板.getByRole("button", { name: /读我\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("这是一台假服务器", { timeout: 30_000 })
})

/** **远端那棵树认得出目录与文件**——混了就是点一个目录去解码图片 */
test("远端树上，目录点得开，文件点了是预览", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()

  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "数据", exact: true }).click()
  // 点开目录之后，里面那个 CSV 出现了——**而且它被读成表，不是一坨逗号**
  await 面板.getByRole("button", { name: /样本\.csv/ }).click()
  await expect(page.locator(".file-preview")).toContainText("3.14", { timeout: 30_000 })
})

/**
 * **从服务器下载一个文件**（批 4a，2026-08-17）。
 *
 * 三件事一起验：文件真的落到本机、屏幕上说得出落在哪儿、
 * 以及**本地文件不给「下载」那颗按钮**——它已经在这台机器上了，
 * 给一颗「下载到本机」是荒唐的。
 */
test("**远端文件下得下来**，而且说得出落在哪儿", async ({ dawn }) => {
  const { page, dir } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()

  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: /读我\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("这是一台假服务器", { timeout: 30_000 })

  await page.getByRole("button", { name: "下载", exact: true }).click()

  // **传完之后要说得出落在哪儿**，否则人得自己去猜
  const 条 = page.locator(".xfer-text")
  await expect(条).toContainText("传好了", { timeout: 30_000 })

  // 文件真的在本机上，且内容一字不差
  const 落点 = (await 条.textContent())!.replace(/^.*传好了：/, "").trim()
  expect(落点, "说的落点不在这次的隔离目录里").toContain(dir)
  const { readFileSync } = await import("node:fs")
  expect(readFileSync(落点, "utf8")).toContain("这是一台假服务器")
})

/**
 * **下载两次不会互相覆盖**（批 4a）。
 *
 * 默默覆盖是这里唯一不能选的：**你可能正在覆盖昨天那一版结果**。
 * 「覆盖 / 另存一份 / 取消」那个三选一要问人，连同上传在 4b 做；
 * 这一版先一律「另存一份」。
 */
test("下载同一个文件两次，第二份另存，不覆盖第一份", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()
  await page.locator(".right-dock .files-view").getByRole("button", { name: /读我\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("这是一台假服务器", { timeout: 30_000 })

  const 落点 = async () => {
    await page.getByRole("button", { name: "下载", exact: true }).click()
    const 条 = page.locator(".xfer-text")
    await expect(条).toContainText("传好了", { timeout: 30_000 })
    return (await 条.textContent())!.replace(/^.*传好了：/, "").trim()
  }
  const 第一份 = await 落点()
  const 第二份 = await 落点()

  expect(第二份, "第二次下载把第一份覆盖了").not.toBe(第一份)
  expect(第二份).toContain("(1)")
  const { existsSync } = await import("node:fs")
  expect(existsSync(第一份), "第一份不见了").toBe(true)
  expect(existsSync(第二份)).toBe(true)
})

/** **本地文件不给「下载」**——它已经在这台机器上了 */
test("本地文件没有「下载」那颗按钮", async ({ dawn }) => {
  const { page, workspace } = dawn
  const { writeFileSync } = await import("node:fs")
  writeFileSync(`${workspace}/本地的.md`, "# 本地\n")
  await 开一段临时会话(page)
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: /本地的\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("本地", { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "下载", exact: true })).toHaveCount(0)
})

/**
 * **上传：撞名要问，而且账本上留得下**（批 4b，2026-08-17）。
 *
 * 三件事：文件真的到了那台机器；同名时**不默默覆盖**而是问三选一；
 * 上传落一条 `file_upload` 的 Run（不变式 5——数据是什么时候、
 * 从哪儿进去的，不该只有你自己记得）。
 */
test.describe("上传", () => {
  test.use({ dawnOptions: { fakeSsh: true, pickFiles: ["/tmp/dawn-上传的.txt"] } })

  test("**传上去、撞名问三选一、落一条账**", async ({ dawn }) => {
    const { page, dbPath } = dawn
    const { writeFileSync } = await import("node:fs")
    writeFileSync("/tmp/dawn-上传的.txt", "这是从本机传上去的\n")

    await 展开远端(page)
    await 加一台(page, { label: "假机器" })
    await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
    await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
    await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()

    const 面板 = page.locator(".right-dock .files-view")
    await 面板.getByRole("button", { name: "传到这里", exact: true }).click()
    await expect(page.locator(".xfer-text")).toContainText("传好了", { timeout: 30_000 })

    // ① 树上真的多了那个文件
    await 面板.getByRole("textbox", { name: "跳到路径" }).fill("/home/dawn")
    await 面板.getByRole("textbox", { name: "跳到路径" }).press("Enter")
    await expect(面板.getByRole("button", { name: /dawn-上传的\.txt/ })).toBeVisible({ timeout: 30_000 })

    // ② **再传一次要问，不默默覆盖**
    await 面板.getByRole("button", { name: "传到这里", exact: true }).click()
    await expect(page.getByText(/已经在那台机器上了/)).toBeVisible({ timeout: 30_000 })
    // 三条路都在，且**没有一个是另一个的子串**
    await expect(page.getByRole("button", { name: "覆盖", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "另存一份", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "另存一份", exact: true }).click()
    await expect(page.locator(".xfer-text")).toContainText("传好了", { timeout: 30_000 })

    // ③ **上传进账本**（不变式 5）
    const { readRuns } = await import("./fixtures.js")
    await expect
      .poll(
        async () =>
          (await readRuns(dbPath)).filter((r) => String(r["request_type"]).startsWith("file_upload")).length,
        { message: "上传没有落账", timeout: 15_000 },
      )
      .toBeGreaterThan(1)
  })
})

/**
 * **删除：本地与远端不是同一个操作**（批 5，2026-08-17）。
 *
 * 本地走废纸篓（**后悔得回来**），远端只有 `unlink`（**没了就是没了**）。
 * 同一颗按钮、同一个「删除」二字，一边可恢复一边不可恢复——
 * **这次的代价是数据**，所以文案与确认框必须分得开。
 */
test("远端删除说「永久」，本地说「废纸篓」，且都落账", async ({ dawn }) => {
  const { page, workspace, dbPath } = dawn
  const { writeFileSync, existsSync } = await import("node:fs")
  writeFileSync(`${workspace}/要删的.txt`, "删我\n")

  // ── 本地：文案是「移到废纸篓」，确认框说找得回来
  await 开一段临时会话(page)
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: /要删的\.txt/ }).click()
  await expect(page.locator(".file-preview")).toContainText("删我", { timeout: 30_000 })
  await page.getByRole("button", { name: "移到废纸篓", exact: true }).click()
  await expect(page.getByText(/可以从废纸篓找回来/)).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "移到废纸篓", exact: true }).click()

  // 文件真的没了，**而且预览也清空了**——留着一张已经不存在的东西是最不能忍的
  await expect
    .poll(async () => existsSync(`${workspace}/要删的.txt`), { timeout: 15_000 })
    .toBe(false)
  await expect(page.locator(".file-preview")).toContainText("选一个文件")

  // ── 远端：文案是「永久删除」，确认框说找不回来
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  /**
   * **不用再点一次「文件」**——坞还开着，而面板**跟着会话走**。
   * 再点一次是收起来（那正是切换键该有的语义）。
   * 顺手把「换了会话，面板自己跟过去」钉在这儿。
   */
  await expect(面板.locator(".files-where-name")).toHaveText("假机器", { timeout: 30_000 })
  await 面板.getByRole("button", { name: /读我\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("这是一台假服务器", { timeout: 30_000 })

  await expect(
    page.getByRole("button", { name: "移到废纸篓", exact: true }),
    "远端也说「废纸篓」——那台机器上根本没有废纸篓",
  ).toHaveCount(0)
  await page.getByRole("button", { name: "永久删除", exact: true }).click()
  await expect(page.getByText(/上没有废纸篓，删了找不回来/)).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "永久删除", exact: true }).click()

  // 树上没有它了
  await expect(面板.getByRole("button", { name: /读我\.md/ })).toHaveCount(0, { timeout: 30_000 })

  // **两次删除都落账，而且可恢复与不可恢复在账本上长得不一样**
  const { readRuns } = await import("./fixtures.js")
  await expect
    .poll(
      async () => {
        const 账 = await readRuns(dbPath)
        const 删 = 账.map((r) => String(r["request_type"])).filter((x) => x.startsWith("file_delete"))
        return { 废纸篓: 删.filter((x) => x.includes(":trash:")).length, 永久: 删.filter((x) => x.includes(":permanent:")).length }
      },
      { message: "删除没有落账，或者两种删法在账本上长得一样", timeout: 15_000 },
    )
    .toEqual({ 废纸篓: 1, 永久: 1 })
})

/**
 * **删目录：入口常驻，确认框先说清删掉多少**（2026-08-18）。
 *
 * 两条纪律一起验：
 * ① 那颗「⋯」**始终看得见**——不是悬停才出现（本项目栽过两次，
 *    而 `toBeVisible()` 对 `opacity: 0` 仍然算可见，所以直接量它）；
 * ② 确认框里**有数字**：作者定的是「自己为自己的数据负责」，
 *    而负责的前提是知道自己要删掉什么。
 */
test("删目录：「⋯」常驻可见，确认框说得出有多少个文件", async ({ dawn }) => {
  const { page, workspace } = dawn
  const { mkdirSync, writeFileSync, existsSync } = await import("node:fs")
  /**
   * **里面要有一层子目录**：平的话，「数目录要递归」那条判据
   * 删掉递归也照样绿（2026-08-18 变异测试当场抓到的假绿）。
   */
  mkdirSync(`${workspace}/要删的目录/深一层`, { recursive: true })
  writeFileSync(`${workspace}/要删的目录/a.txt`, "1\n")
  writeFileSync(`${workspace}/要删的目录/b.txt`, "2\n")
  writeFileSync(`${workspace}/要删的目录/深一层/c.txt`, "3\n")

  await 开一段临时会话(page)
  await page.locator(".sidebar").getByRole("button", { name: "文件", exact: true }).click()
  const 面板 = page.locator(".right-dock .files-view")
  const 那颗 = 面板.getByRole("button", { name: /目录操作：要删的目录/ })
  await expect(那颗).toBeVisible({ timeout: 30_000 })

  // **直接量透明度**：`toBeVisible()` 对 `opacity: 0` 仍然算可见
  const 透明度 = await 那颗.evaluate((el) => getComputedStyle(el).opacity)
  expect(透明度, "那颗「⋯」是悬停才出现的——等于没有").not.toBe("0")

  await 那颗.click()
  // **确认框里有真数字**，不是一句「相关文件」
  // 三个：顶上两个 + 子目录里那个。**数错一个都说明没递归**
  await expect(page.getByText(/3 个文件/)).toBeVisible()
  await expect(page.getByText(/可以从废纸篓找回来/)).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "移到废纸篓", exact: true }).click()

  await expect.poll(async () => existsSync(`${workspace}/要删的目录`), { timeout: 15_000 }).toBe(false)
})
