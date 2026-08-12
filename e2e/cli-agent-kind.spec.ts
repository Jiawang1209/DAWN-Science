/**
 * `kind: cli` 的准入（①-C · C1 立、C4 改）。**跑真实构建产物。**
 *
 * 这条守的是**无静默回退**（规格 7.5）。
 *
 * 加 `cli` 之前，挑运行时的写法是「`native` ? native : pty」。加一种 kind 之后，
 * 那个三元会让 `cli` **悄悄落进 PTY 运行时**——进程照样起得来，用户看到一个终端，
 * 而他配的是一个对话式 agent。**失败方式是「它能用，只是不是你要的那个」**，
 * 这类最难被发现。
 *
 * **2026-08-09 C4 改写**：原来断言的是「CLI 运行时尚未实现」那条占位失败，
 * 而 C4 已经把它实现掉了——**主体没了，意图还在**。
 * 现在守的是同一条纪律在新形态下的样子：**认不出的 CLI 响亮失败**。
 */
import { test, expect } from "./fixtures.js"

const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  某个没听说过的:
    kind: cli
    command: 某个没听说过的cli
    capabilities: [chat, exec]
`

test.describe("配了一个认不出的 cli agent", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS } })

  test("**响亮失败并说清怎么办** —— 不是悄悄起一个终端", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()

    await page.keyboard.press("Meta+k")
    await page.getByRole("option", { name: "新建会话：某个没听说过的" }).click()

    // 出声，且给出可执行的替代
    await expect(page.getByText(/不支持的外部 CLI/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/kind: pty/)).toBeVisible()

    // **没有悄悄起一个终端**
    await expect(page.locator(".term-host")).toHaveCount(0)
  })

  test("它仍然出现在可选列表里 —— 缺失不等于不支持", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
    await page.keyboard.press("Meta+k")
    await expect(page.getByRole("option", { name: "新建会话：某个没听说过的" })).toBeVisible()
  })
})
