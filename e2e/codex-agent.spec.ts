/**
 * codex 在对话框里（①-C · C6）。**跑真实构建产物。**
 *
 * claude 那条（`cli-agent.spec.ts`）已经验过判据 ① 与 ②，
 * 但 **codex 的多轮语义与它完全不同**——一轮一个进程，靠
 * `exec resume <thread_id>` 续接。那条路此前只有单元测试走过。
 *
 * **不带 resume 的话，每轮都是全新对话，而它看起来一切正常**
 * （每轮都答得出话），只是不记得上文。**那种坏法最难被发现**，
 * 所以假 CLI 在回复里标出「首轮」还是「续接」，让它可断言。
 */
import { resolve } from "node:path"
import { test, expect, 等进了对话 } from "./fixtures.js"

const FAKE = resolve(import.meta.dirname, "fixtures/codex")

const PROVIDERS = `agents:
  codex:
    kind: cli
    command: "${FAKE}"
    args: []
    model: gpt-5.1-codex
    models: [gpt-5.1-codex, gpt-5.1-codex-mini]
    capabilities: [chat, exec]
`

async function startCodex(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
  await page.keyboard.press("Meta+k")
  await page.getByRole("option", { name: "新建会话：codex" }).click()
  await 等进了对话(page)
}

const say = async (page: import("@playwright/test").Page, text: string) => {
  await page.getByPlaceholder(/回车发送/).fill(text)
  await page.getByRole("button", { name: "发送", exact: true }).click()
}

test.describe("codex：一轮一进程 + 续接", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**第二轮真的续接上了** —— 不续接的话它看起来也一切正常", async ({ dawn }) => {
    const { page } = dawn
    await startCodex(page)

    await say(page, "第一句")
    await expect(page.getByText(/假 codex 首轮：第一句/)).toBeVisible({ timeout: 30_000 })

    await say(page, "第二句")
    // **这一句是全部要害**：走了 resume 才会是「续接」
    await expect(page.getByText(/假 codex 续接：第二句/)).toBeVisible({ timeout: 30_000 })
  })

  test("**thread_id 落库了** —— 重开应用后靠它接上", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await startCodex(page)
    await say(page, "你好")
    await expect(page.getByText(/假 codex 首轮/)).toBeVisible({ timeout: 30_000 })

    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const row = db.prepare("SELECT cli_thread_id FROM sessions").get() as { cli_thread_id: string | null }
    db.close()
    expect(row.cli_thread_id).toBe("线程-e2e")
  })

  test("**stderr 有噪声也不算失败** —— 实测 codex 每轮都打，而退出码是 0", async ({ dawn }) => {
    const { page } = dawn
    await startCodex(page)
    await say(page, "你好")
    await expect(page.getByText(/假 codex 首轮/)).toBeVisible({ timeout: 30_000 })
    // 没有把那行 stderr 当成失败报出来
    await expect(page.getByText(/退出码/)).toHaveCount(0)
  })

  test("工具调用落在账本上", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await startCodex(page)
    await say(page, "跑个命令")
    await expect(page.getByText(/假 codex 首轮/)).toBeVisible({ timeout: 30_000 })

    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const types = (db.prepare("SELECT request_type FROM runs").all() as { request_type: string }[])
      .map((r) => r.request_type)
    db.close()
    // 工具名用 item 类型原样记 —— 不归一成 bash（那等于声称两者等价）
    expect(types).toContain("tool_call:command_execution")
  })
})

test.describe("在一个对话里换模型（作者试用后补）", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  /**
   * **作者报的那件事**：*「我的一个对话里面，不能切换不同的模型。
   * 点击新的模型之后，就默认的跳入新的对话里面了。」*
   *
   * 根因不是坏了，是没做——cli 会话里没有模型选择器，
   * 只有 agent pill，而它点了必然新建会话。
   */
  test("**换完之后是同一个对话，且下一轮真的用了新模型**", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await startCodex(page)
    await say(page, "第一句")
    await expect(page.getByText(/假 codex 首轮/)).toBeVisible({ timeout: 30_000 })

    // 模型选择器在 composer 右下角——**它存在本身就是这次修的东西**
    await page.getByRole("button", { name: /gpt-5\.1-codex$/ }).click()
    await page.getByRole("menuitem", { name: /gpt-5\.1-codex-mini/ }).click()

    await say(page, "第二句")
    // **同一个对话**：第一句仍在，且第二轮走的是 resume（续接）
    await expect(page.getByText(/假 codex 首轮：第一句/)).toBeVisible()
    await expect(page.getByText(/假 codex 续接：第二句/)).toBeVisible({ timeout: 30_000 })
    // **新模型真的传下去了**
    await expect(page.locator(".turn.agent").last()).toContainText("--model gpt-5.1-codex-mini")

    // 而且**没有新建会话**
    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const n = (db.prepare("SELECT COUNT(*) c FROM sessions").get() as { c: number }).c
    db.close()
    expect(n).toBe(1)
  })
})
