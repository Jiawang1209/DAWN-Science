/**
 * 托管 CLI 的会话（PTY）。**跑真实构建产物。**
 *
 * ## 这条是补上一个从来没被机器验过的主路径
 *
 * 作者 2026-08-09 试用后报「claude / codex 在 app 里不好使」。查下来是两条叠加：
 * 主区域给的是对话视图，而 **PTY 的输出根本不进对话记录**；那个输入框又把文本
 * 原样送进 PTY **不带 `\r`**，CLI 收到字符却永远等不到提交。
 *
 * **56 条 e2e 里没有任何一条跑过 PTY 会话**——所以这个缺陷能一路活到作者手里。
 * 单元测试也碰不到它：它长在「哪个组件被渲染」与「按键怎么送下去」的接缝上。
 *
 * ## 为什么托管 `bash` 而不是 claude
 *
 * 验的是**同一条通路**（PtyRuntime → 事件中枢 → 终端），
 * 而 `bash` 不需要安装、不需要登录、输出可预测。
 * 用 claude 会把「CLI 装没装、登没登录」变成这条测试的前置条件——
 * **那时它红了，你分不清是我们坏了还是环境坏了。**
 */
import { test, expect } from "./fixtures.js"

/**
 * **不再自带 providers.yaml —— 用发布出去的那份默认配置。**
 *
 * ①-C · C5 之后，默认配置里就有一个 `shell`（`kind: pty`，跑 bash）。
 * 让这条 e2e 走默认配置，验的就从「我在测试里临时编的 shell 能用」
 * 变成 **「新用户装好之后真的能开一个终端」**——那才是判据 ③。
 */
/**
 * 经命令面板新建 `shell` 会话。
 *
 * **不走 composer 的 agent pill**：试过，`/ds-chat/` 同时匹配到侧栏的会话按钮
 * 和 pill 本身——**一个能匹配到三个元素的定位器，点中哪个是运气**。
 *
 * **必须等「新建会话」按钮可用再按 ⌘K**：只等 `.app-shell` 可见是不够的，
 * 那时项目还没加载完，命令面板里没有这条命令（C4 的 e2e 上撞过，
 * 三条里飘红一条，每次不是同一条）。
 */
async function startShell(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
  /**
   * **2026-08-11：命令面板里不再有「新建会话：shell」。**
   *
   * `shell` 那种 `kind: pty` 的 agent 已经从「用哪个 LLM 开一段对话」的清单里
   * 拿掉了——它既不是 LLM，开出来的也不是对话。终端有自己的命令：**打开终端**。
   */
  await page.keyboard.press("Meta+k")
  await page.getByRole("option", { name: /打开终端/ }).click()
}

/**
 * **2026-08-11：终端搬进了底部 dock。**
 *
 * 作者：*「终端，我们要学习 Claude app、Codex app，要点击之后，界面下方
 * 单独出现一个地方。」* 于是命令面板里那条「新建会话：shell」
 * 也走同一个家——**一个动作只有一个家**，否则它建出来的东西
 * 既不在会话列表里（终端已被过滤掉），也不在 dock 里。
 *
 * 这个文件验的**通路没变**（PtyRuntime → 事件中枢 → xterm），
 * 只是终端现在长在 `.dock` 里。
 */
test.describe("PTY 会话：终端在底部 dock 里", () => {

  test("**建完就能看见终端**，不用点任何东西", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()

    await startShell(page)

    // 终端在 dock 里，**而且 dock 自己掀开了**——不用再点一次
    await expect(page.locator(".dock .term-host")).toBeVisible({ timeout: 30_000 })
    /**
     * **shell 没有把对话区占掉**（2026-08-12 换的判据）。
     *
     * 上一版断言「一个 `回车发送` 都没有」——那时空态没有输入框，
     * 所以「有输入框」只可能意味着「这个 shell 会话被当成对话渲染了」，
     * 而那个框此前把字送进黑洞。
     *
     * 现在**空态本身就是一张输入卡**（作者要的），那句断言于是恒假。
     * 它守的意图没变，换成直接说：**主区仍然是初始画面**，
     * 终端在下面那条 dock 里——两者各在各的地方。
     */
    await expect(page.locator(".welcome")).toBeVisible()
    await expect(page.locator(".turns")).toHaveCount(0)
  })

  test("**打字加回车，命令真的被执行了**", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await startShell(page)
    await expect(page.locator(".dock .term-host")).toBeVisible({ timeout: 30_000 })

    /**
     * 点进终端再打字。**回车由 xterm 变成 `\r` 送下去**——
     * 这正是修好的那一半：旧的输入框送的是 `draft.trim()`，一个 `\r` 都没有。
     */
    await page.locator(".dock .term-host").click()
    await page.keyboard.type("echo 我是从终端跑出来的")
    await page.keyboard.press("Enter")

    // bash 把结果吐回来 → PtyRuntime → 事件中枢 → xterm。**整条通路**
    await expect(page.locator(".dock")).toContainText("我是从终端跑出来的", {
      timeout: 30_000,
    })
  })
})
