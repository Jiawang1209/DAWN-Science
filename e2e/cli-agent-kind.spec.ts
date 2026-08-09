/**
 * `kind: cli` 的准入（①-C · C1）。**跑真实构建产物。**
 *
 * 这条守的是**无静默回退**（规格 7.5）。
 *
 * 加 `cli` 之前，`session/manager.ts` 里挑运行时的写法是
 * 「`native` ? native : pty」。加一种 kind 之后，那个三元会让 `cli`
 * **悄悄落进 PTY 运行时**——进程照样起得来，用户看到一个终端，
 * 而他配的是一个对话式 agent。**失败方式是「它能用，只是不是你要的那个」**，
 * 这类最难被发现。
 *
 * C2/C3 把 CLI 运行时做出来之前，这里必须**响亮地失败并说清怎么办**。
 */
import { test, expect } from "./fixtures.js"

const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude:
    kind: cli
    command: claude
    capabilities: [chat, exec]
`

test.describe("配了 cli agent", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS } })

  test("**建会话时响亮失败，并说清怎么办** —— 不是悄悄起一个终端", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()

    await page.keyboard.press("Meta+k")
    await page.getByRole("option", { name: "新建会话：claude" }).click()

    // 出声：说明尚未实现，并给出可执行的替代
    await expect(page.getByText(/CLI 运行时尚未实现/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/kind: pty/)).toBeVisible()

    // **没有悄悄起一个终端**
    await expect(page.locator(".term-host")).toHaveCount(0)
  })

  test("cli agent 仍然出现在可选列表里 —— 缺失不等于不支持", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await page.keyboard.press("Meta+k")
    await expect(page.getByRole("option", { name: "新建会话：claude" })).toBeVisible()
  })
})
