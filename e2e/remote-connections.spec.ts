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
import { test, expect } from "./fixtures.js"

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
  const head = page.getByRole("button", { name: /远端连接/ })
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
  // **刚加的是「未连」，不是「连不上」**——我们还没试过
  await expect(row.locator(".remote-status")).toHaveText("未连")

  await row.getByRole("button", { name: "连接" }).click()
  await expect(row.locator(".remote-status")).toHaveText("连着", { timeout: 15_000 })
  await expect(row).toHaveAttribute("data-state", "ready")

  await row.getByRole("button", { name: "断开" }).click()
  // **人按的断开是「未连」，不是「断了」**——后者要报原因，两者不能混
  await expect(row.locator(".remote-status")).toHaveText("未连")
  await expect(row.locator(".remote-reason")).toHaveCount(0)
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
  await expect(row.locator(".remote-status")).toHaveText("断了")
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
  await expect(page.locator(".remote-row").first().locator(".remote-status")).toHaveText("连着", {
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
   * 侧栏那一行也挂上了这段对话，**而且用的是与别处同一种行**
   * （`.sess-item` —— 带删除/改名/置顶/挪位置）。
   * 作者报过：*「在服务器的对话，不能删除，也不能挪动顺序」*——
   * 那是因为这里当初图省事画了一个只能点的行。
   */
  await expect(row.locator(".sess-item")).toHaveCount(1)
  await expect(row.locator(".sess-item .sub")).toHaveText("~")
})

test("**命令跑在远端，`cd` 之后粘住**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, { label: "假机器" })
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  await page.getByPlaceholder(/回车发送/).fill("看看这儿有什么")
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
