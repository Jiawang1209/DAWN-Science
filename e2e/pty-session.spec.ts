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

/** 托管一个 bash 当 PTY agent。native 的那个仍在，别的用例要用 */
const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  shell:
    kind: pty
    command: bash
    args: ["--norc", "--noprofile", "-i"]
    capabilities: [chat, exec]
`

/**
 * 经命令面板新建 `shell` 会话。
 *
 * **不走 composer 的 agent pill**：第一版试过，`/ds-chat/` 同时匹配到侧栏的
 * 会话按钮和 pill 本身——**一个能匹配到三个元素的定位器，点中哪个是运气**。
 * 命令面板里每个 agent 各有一条命令，标题唯一。
 */
async function startShell(page: import("@playwright/test").Page): Promise<void> {
  await page.keyboard.press("Meta+k")
  await page.getByRole("option", { name: "新建会话：shell" }).click()
}

test.describe("PTY 会话：终端就是主体", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS } })

  test("**建完就能看见终端**，不用点任何东西", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()

    await startShell(page)

    // **终端直接在主区域**，没有折叠开关
    await expect(page.locator(".term-view .term-host")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: /终端/ })).toHaveCount(0)
    // 也不该有输入框——那个框此前把字送进黑洞
    await expect(page.getByPlaceholder(/回车发送/)).toHaveCount(0)
  })

  test("**打字加回车，命令真的被执行了**", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await startShell(page)
    await expect(page.locator(".term-view .term-host")).toBeVisible({ timeout: 30_000 })

    /**
     * 点进终端再打字。**回车由 xterm 变成 `\r` 送下去**——
     * 这正是修好的那一半：旧的输入框送的是 `draft.trim()`，一个 `\r` 都没有。
     */
    await page.locator(".term-view .term-host").click()
    await page.keyboard.type("echo 我是从终端跑出来的")
    await page.keyboard.press("Enter")

    // bash 把结果吐回来 → PtyRuntime → 事件中枢 → xterm。**整条通路**
    await expect(page.locator(".term-view")).toContainText("我是从终端跑出来的", {
      timeout: 30_000,
    })
  })
})
