/**
 * 记忆(2026-08-25,规格 `specs/2026-08-25-记忆-design.md`):
 * ① 插件第四卡三工具 + 记忆屏空态;
 * ② 假模型点名调 memory_propose → 设置入口角标 → 记忆屏采纳 → 记忆库可见;
 * ③ **注入判据**:采纳后开一段新会话,假模型收到的请求里 system 真含那条
 *   (`dawn.requests` 是假服务器收到的原始请求体——观察,不是屏幕看起来对)。
 */
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"

test("插件第三张卡三工具;记忆屏空态如实说", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "插件")
  const 卡 = page.locator(".plugin-card").nth(2)
  await expect(卡).toContainText("记忆")
  await expect(卡).toContainText("memory_propose")
  await expect(卡).toContainText("skill_propose")
  await 进设置(page, "记忆")
  await expect(page.getByText(/没有待确认的/)).toBeVisible()
  await expect(page.getByText(/这条轨还是空的/)).toBeVisible()
})

test.describe("提议 → 角标 → 采纳 → 新会话注入", () => {
  test.use({
    dawnOptions: {
      toolCall: {
        toolName: "memory_propose",
        args: { target: "key", content: "DAWN_记忆_物证:口径用基线年龄", reason: "统计口径决策" },
        say: "我提议记一条。",
      },
    },
  })
  test("整链路(判据走假服务器收到的 system,不走屏幕)", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("记一下口径")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    // 工具真跑了,回执说明「等确认」
    await expect(page.locator(".turns")).toContainText("memory_propose")

    // 设置入口带角标(待确认 1)
    await 进设置(page, "插件")
    const 记忆行 = page.locator(".settings-nav").getByRole("button", { name: "记忆", exact: true })
    await expect(记忆行.locator(".side-count")).toHaveText("1")

    // 记忆屏:看到建议 → 采纳 → 待确认清零、记忆库 key 轨可见
    await 记忆行.click()
    await expect(page.getByText("DAWN_记忆_物证:口径用基线年龄")).toBeVisible()
    await page.getByRole("button", { name: "采纳", exact: true }).click()
    await expect(page.getByText(/没有待确认的/)).toBeVisible()
    await page.getByRole("tab", { name: "项目关键记忆", exact: true }).click()
    await expect(page.locator(".memory-entries")).toContainText("口径用基线年龄")

    // **注入判据**:开一段新会话再发一句——假服务器收到的请求里 system 含那条。
    // (采纳发生在第一段会话建立之后,所以旧会话没有、新会话必须有——
    //  这同时验证了「下一段会话生效」的契约。)
    const 之前的请求数 = dawn.requests.length
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("现在口径是什么")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    const 新请求 = dawn.requests.slice(之前的请求数)
    expect(新请求.length).toBeGreaterThan(0)
    const 带物证 = 新请求.some((r) => JSON.stringify(r).includes("DAWN_记忆_物证:口径用基线年龄"))
    expect(带物证, "新会话的请求里应带着已采纳的记忆(system 注入)").toBe(true)
  })
})
