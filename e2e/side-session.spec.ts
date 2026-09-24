/**
 * 侧边对话（2026-09-24，spec `2026-09-24-侧边对话-design.md`）。**跑真实构建产物。**
 * 要证的是：两段真的同时跑、互不串台；坞里那段问进度时真调到 read_main_session、读到的是主对话此刻的。
 *
 * ## 为什么大多走项目会话
 *
 * 项目会话有分栏（「换到主区 / 拿下」之后能在页签里找到那段）。临时会话 2026-09-25 起也有地方
 * （侧栏「会话」那一组，`t:`）——作者的对话几乎全是临时会话，那条单独一个用例盯着（最后那个 describe）。
 *
 * ## 两处长得一样
 *
 * 主区与坞里是**同一个 `ConversationView`**：占位符、停止键、工具行都一模一样。
 * 所以每一处都先圈定范围——主区 `main.main`、坞里 `aside.right-dock`——不圈就是子串匹配撞两个。
 */
import type { Page } from "@playwright/test"
import { resolve } from "node:path"
import { test, expect, CANNED_REPLY, 在项目里开会话, 开一段临时会话, 进坞 } from "./fixtures.js"

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
        /**
         * 主区那段：拖住这一轮。**这是给坞里的时间预算，用例从不等它跑完**——收尾时整个应用被关掉。
         * 所以放得远远的（120 秒）：满负荷的全量 e2e 里坞那段起得慢，也不会因为主区先跑完
         * 而红在「正在跑：bash」上、看起来像产品 bug。
         */
        { toolName: "bash", args: { command: "sleep 120" }, when: "跑个长的", say: "我去跑一下。" },
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
      /** 回复那一侧也不许串：主区自己的罐头回复要等 sleep 跑完才来，此刻出现只可能是坞里漏过来的 */
      await expect(主区(page).locator(".turns")).not.toContainText(CANNED_REPLY)
      await expect(坞(page).locator(".turns")).not.toContainText("跑个长的")
      await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
      /** native 那段看得见主对话：「看不见」的提示这里不许出现（ACP 那条只证了它会出现） */
      await expect(坞(page).locator(".side-chat-caveat")).toHaveCount(0)
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
      /** 先等主区真换成坞里那段的内容，再断言原主那段不在——否则否定句可能赶在重渲染之前成立 */
      await expect(主区(page).locator(".turns")).toContainText(CANNED_REPLY)
      await expect(主区(page).locator(".turns")).not.toContainText("跑个长的")
    })

    await test.step("从坞里拿下：坞格回空态，那段仍在会话页签里", async () => {
      await 坞(page).getByRole("button", { name: "从坞里拿下", exact: true }).click()
      /** 等标题而不是 `.side-chat-empty`：后者「正在打开」的加载态也有 */
      await expect(坞(page).getByRole("heading", { name: "坞里的对话", exact: true })).toBeVisible()
      await expect(坞(page).locator(".side-chat-head")).toHaveCount(0)
      await expect(主区(page).locator(".session-tabs .session-tab-title").filter({ hasText: "跑个长的" })).toHaveCount(1)
    })
  })
})

/**
 * **临时会话也有地方**（2026-09-25，作者真机上撞的：他的对话几乎全是临时会话，上一版坞里只剩一行灰字）。
 * 主区是一段临时会话时，坞里「另开一段」建的是**又一段临时会话**，主区不动，新那段落进侧栏「会话」那一组。
 */
test.describe("侧边对话 · 临时会话", () => {
  test("主区是临时会话：坞里「另开一段」看得见、建出一段临时会话，主区不动", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page, "起个头")
    /** 前提：主区真是一段临时会话——散的会话没有分栏，「会话」那一组里只有它 */
    await expect(主区(page).locator(".conv-title")).toContainText("起个头")
    await expect(主区(page).locator(".session-tabs")).toHaveCount(0)
    await expect(page.locator(".session-list > li")).toHaveCount(1)

    await 进坞(page, "对话")
    const 另开 = 坞(page).getByRole("button", { name: "另开一段", exact: true })
    await expect(另开).toBeVisible()
    expect(await 另开.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await expect(坞(page).getByText("这段对话不属于任何项目，坞里没法另开", { exact: true })).toHaveCount(0)

    await 另开.click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 框(坞(page)).waitFor({ timeout: 30_000 })

    await 说(坞(page), "坞里开的头")
    await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
    /** 主区还是原来那段：标题没换、坞里那句没串过去 */
    await expect(主区(page).locator(".conv-title")).toContainText("起个头")
    await expect(主区(page).locator(".turns")).not.toContainText("坞里开的头")
    /** 新那段是一段临时会话：落进侧栏「会话」那一组，不是哪个项目底下 */
    await expect(page.locator(".session-list > li")).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator(".session-list .sess .name").filter({ hasText: "坞里开的头" })).toBeVisible({ timeout: 30_000 })
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
