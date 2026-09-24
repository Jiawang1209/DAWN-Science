/**
 * 侧边对话（2026-09-24，spec `2026-09-24-侧边对话-design.md`）。**跑真实构建产物。**
 * 要证的是：两段真的同时跑、互不串台；坞里那段问进度时真调到 read_main_session、读到的是主对话此刻的。
 *
 * ## 为什么走项目会话
 *
 * 临时会话没有「同一个地方」（Task 6：坞格对它直说「没处挂」），「另开一段」只在项目会话下有。
 *
 * ## 两处长得一样
 *
 * 主区与坞里是**同一个 `ConversationView`**：占位符、停止键、工具行都一模一样。
 * 所以每一处都先圈定范围——主区 `main.main`、坞里 `aside.right-dock`——不圈就是子串匹配撞两个。
 */
import type { Page } from "@playwright/test"
import { resolve } from "node:path"
import { test, expect, CANNED_REPLY, 在项目里开会话, 进坞 } from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: ReturnType<typeof 主区>) => 区.getByPlaceholder(/今天帮你做些什么/)

async function 说(区: ReturnType<typeof 主区>, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}

/** 主区开一段项目会话、说「跑个长的」，等假模型开口——此后 `sleep` 拖住这一轮 */
async function 主区忙起来(page: Page) {
  await 在项目里开会话(page)
  await 说(主区(page), "跑个长的")
  await expect(主区(page).locator(".turns")).toContainText("我去跑一下。", { timeout: 30_000 })
}

/** 坞「对话」格 → 另开一段；等**只有挂着态才有**的 `.side-chat-head` */
async function 坞里另开一段(page: Page) {
  await 进坞(page, "对话")
  await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
  await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
  await 框(坞(page)).waitFor({ timeout: 30_000 })
}

test.describe("侧边对话 · native", () => {
  test.use({
    dawnOptions: {
      toolCall: [
        /** 主区那段：拖住这一轮。15 秒够坞里走完两轮问答（busy-gap 用 5 秒拖一轮，这里要拖三轮） */
        { toolName: "bash", args: { command: "sleep 15" }, when: "跑个长的", say: "我去跑一下。" },
        { toolName: "read_main_session", args: {}, when: "主对话跑到哪了" },
      ],
    },
  })

  test("**两段同时跑不串台**；坞里问进度真调到 read_main_session、读到的是主对话此刻的", async ({ dawn }) => {
    const { page } = dawn
    await 主区忙起来(page)
    await 坞里另开一段(page)

    await test.step("坞里说一句：坞里有回复，主区没有这句；主区那段仍在跑", async () => {
      await 说(坞(page), "你好")
      await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
      await expect(主区(page).locator(".turns")).not.toContainText("你好")
      await expect(坞(page).locator(".turns")).not.toContainText("跑个长的")
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
    })

    await test.step("坞里问进度：调到 read_main_session，结果里是主对话此刻的", async () => {
      await 说(坞(page), "主对话跑到哪了")
      const 工具 = 坞(page).locator(".tool").filter({ hasText: "read_main_session" })
      await expect(工具).toHaveCount(1, { timeout: 30_000 })
      await expect(工具).toHaveAttribute("data-status", "ok", { timeout: 30_000 })
      await 工具.locator(".tool-head").click()
      const 结果 = 工具.locator(".tool-result")
      await expect(结果).toContainText("跑个长的")
      await expect(结果).toContainText("正在跑：bash")
      /** 主区那一轮在这期间一直没停——读到「正在跑」本身就证明两段是同时的 */
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
      await expect(主区(page).locator(".tool")).toHaveCount(1)
      await expect(主区(page).locator(".tool").filter({ hasText: "read_main_session" })).toHaveCount(0)
    })
  })

  test("**换到主区 / 从坞里拿下**，三颗按钮都看得见（opacity 1）", async ({ dawn }) => {
    const { page } = dawn
    await 主区忙起来(page)
    await 进坞(page, "对话")

    const 另开 = 坞(page).getByRole("button", { name: "另开一段", exact: true })
    await expect(另开).toBeVisible()
    expect(await 另开.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")

    await 坞里另开一段(page)
    await 说(坞(page), "你好")
    await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })

    const 换 = 坞(page).getByRole("button", { name: "换到主区", exact: true })
    const 拿下 = 坞(page).getByRole("button", { name: "从坞里拿下", exact: true })
    for (const b of [换, 拿下]) {
      await expect(b).toBeVisible()
      expect(await b.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    }

    await test.step("换到主区：主区是坞里那段，坞里是原主那段", async () => {
      await 换.click()
      await expect(主区(page).locator(".conv-title")).toContainText("你好")
      await expect(坞(page).locator(".side-chat-title")).toContainText("跑个长的")
      await expect(坞(page).locator(".turns")).toContainText("我去跑一下。")
      await expect(主区(page).locator(".turns")).not.toContainText("跑个长的")
    })

    await test.step("从坞里拿下：坞格回空态，那段仍在会话页签里", async () => {
      await 坞(page).getByRole("button", { name: "从坞里拿下", exact: true }).click()
      await expect(坞(page).locator(".side-chat-empty")).toBeVisible()
      await expect(坞(page).locator(".side-chat-head")).toHaveCount(0)
      await expect(主区(page).locator(".session-tabs .session-tab-title").filter({ hasText: "跑个长的" })).toHaveCount(1)
    })
  })
})

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

test.describe("侧边对话 · ACP", () => {
  test.use({
    dawnOptions: {
      providersYaml: `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`,
    },
  })

  test("**ACP 那段挂进坞，直说它看不见主对话**", async ({ dawn }) => {
    const { page } = dawn
    /** 先在项目里建一段 ACP 会话，再由夹具建一段 ds-chat 并切过去（最新的排最前） */
    await page.locator(".app-shell").waitFor({ timeout: 60_000 })
    await page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
      const r = (await w.dawn.invoke("listProjects", {})) as { data?: { workspace: string }[] }
      await w.dawn.invoke("createTask", { agentId: "claude-acp", workspace: r.data?.[0]?.workspace })
    })
    await 在项目里开会话(page)
    /** 前提：主区是 native 那段——它有模型 pill，ACP 会话没有（acp-agent.spec.ts 盯着那条） */
    await expect(主区(page).locator(".composer-card .model-pill")).toHaveCount(1)

    await 进坞(page, "对话")
    const 挑 = 坞(page).locator(".side-chat-pick")
    await expect(挑).toHaveCount(1)
    await 挑.click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await expect(坞(page).getByText("这个 agent 看不见主对话", { exact: true })).toBeVisible()
  })
})
