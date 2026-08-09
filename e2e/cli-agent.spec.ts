/**
 * 外部 CLI 在对话框里说话（①-C · C4）。**跑真实构建产物。**
 *
 * **这是 ①-C 判据 ① 与 ② 的验收点**：
 *
 * > ① claude 与 codex 都能在对话框里说话，多轮记得上文。
 * > ② 它们干的活落在账本上——工具调用是 Run，不是一团字节。
 *
 * 用**假 CLI**而不是真 claude：真 CLI 会把「装没装、登没登录、余额够不够」
 * 变成这条测试的前置条件，**红了分不清是我们坏了还是环境坏了**。
 * 与 ①-B″ 的 PTY e2e 选 `bash` 是同一条理由。
 */
import { resolve } from "node:path"
import { test, expect } from "./fixtures.js"

/**
 * **假 CLI 的文件名必须是 `claude`**：`familyOf(command)` 按命令名判
 * 该用哪个 driver。写成「node + 脚本路径」的话命令名是 node，认不出家族——
 * 第一版就是这么错的，表现是会话根本建不起来。
 */
const FAKE = resolve(import.meta.dirname, "fixtures/claude")

/** 把假 CLI 配成一个 `kind: cli` 的 agent */
const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude:
    kind: cli
    command: "${FAKE}"
    args: []
    models: [opus, sonnet, haiku]
    capabilities: [chat, exec]
`

/**
 * 建一个假 claude 会话。
 *
 * **必须等「新建会话」按钮可用再按 ⌘K**：只等 `.app-shell` 可见是不够的——
 * 那时项目还没加载完，命令面板里没有这条命令。第一版就是只等了 shell，
 * 三条里飘红一条（**每次不是同一条**），页面停在「还没有会话」。
 */
async function startFakeClaude(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(page.getByRole("button", { name: /新建会话/ })).toBeEnabled()
  await page.keyboard.press("Meta+k")
  await page.getByRole("option", { name: "新建会话：claude" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })
}

test.describe("CLI agent 在对话框里", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**打一句，它答一句** —— 判据 ①", async ({ dawn }) => {
    const { page } = dawn
    await startFakeClaude(page)

    // **是对话视图，不是终端** —— cli 与 pty 是两件事
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".term-host")).toHaveCount(0)

    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 CLI 已应答：你好/)).toBeVisible({ timeout: 30_000 })
  })

  test("**模型选择器真的出现** —— 上一轮就是漏了这一条，发了个哑的出去", async ({ dawn }) => {
    const { page } = dawn
    await startFakeClaude(page)
    /**
     * 它的渲染条件是「有清单 **且** 知道当前是哪个」。
     * 只声明 `models` 不声明 `model` 时，**整个选择器不渲染**——
     * 而单元测试当时只断言了 `models`，于是那一半悄悄坏掉，
     * 作者试用时看到的是「好像没有任何变化」。
     */
    /**
     * **不钉 `model` 时也要出现**，当前那格标「CLI 默认」。
     * 钉 `model` 会盖掉用户自己 CLI 的配置——作者两个 CLI 都撞上了。
     */
    await expect(page.getByRole("button", { name: /CLI 默认/ })).toBeVisible()
  })

  test("**你自己说的话也要在对话里** —— 作者试用时报的那个", async ({ dawn }) => {
    const { page } = dawn
    await startFakeClaude(page)
    await page.getByPlaceholder(/回车发送/).fill("我说的这句话")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 CLI 已应答/)).toBeVisible({ timeout: 30_000 })

    /**
     * 走 native 时你看得见自己说的话，走 cli 时看不见——
     * 根因是 `userTurn` 的门写的是 `kind !== "native"`，
     * 本意是「PTY 终端自己会回显」，加了 `cli` 之后**含义悄悄变了**。
     */
    await expect(page.locator(".turn.user")).toContainText("我说的这句话")
  })

  test("**agent 的气泡要收尾** —— 不收尾它永远显示成还在说", async ({ dawn }) => {
    const { page } = dawn
    await startFakeClaude(page)
    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 CLI 已应答/)).toBeVisible({ timeout: 30_000 })
    // 「中止」在没有进行中的回合时应当不可用——它反映的正是 busy 已经落回 false
    await page.keyboard.press("Meta+k")
    await expect(page.getByRole("option", { name: /中止/ })).toContainText(/没有正在进行|暂未开放/)
  })

  test("**工具调用落在账本上** —— 判据 ②，走 PTY 时这里只有一团字节", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await startFakeClaude(page)
    await page.getByPlaceholder(/回车发送/).fill("读个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 CLI 已应答/)).toBeVisible({ timeout: 30_000 })

    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const rows = db
      .prepare("SELECT id, parent_run_id, request_type, status FROM runs")
      .all() as { id: string; parent_run_id: string | null; request_type: string; status: string }[]
    db.close()

    const turn = rows.find((r) => r.request_type === "agent_turn")
    const tool = rows.find((r) => r.request_type === "tool_call:Read")
    expect(turn, `账本里没有 agent_turn：${JSON.stringify(rows)}`).toBeDefined()
    expect(tool, `账本里没有 tool_call:Read：${JSON.stringify(rows)}`).toBeDefined()
    // 挂在这一轮下面，且收了口
    expect(tool!.parent_run_id).toBe(turn!.id)
    expect(tool!.status).toBe("completed")
  })

  test("**工具调用在对话里看得见**", async ({ dawn }) => {
    const { page } = dawn
    await startFakeClaude(page)
    await page.getByPlaceholder(/回车发送/).fill("读个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".tool")).toContainText("Read", { timeout: 30_000 })
  })
})
