/**
 * 产物（2026-08-26 · Task 13）。**跑真实构建产物。**
 *
 * 两条链路：
 *   1. 原生会话：假模型吐一个 `write` → pi 真的执行 → 工具包装器拍 git 快照 →
 *      agent 轮下面出现 GENERATED 条 → 点 chip 进坞「产物」格预览 → 回到清单。
 *   2. 外部 CLI 会话：文件操作不可见，**只能说「不知道」**，不列 agent 声称的文件
 *      （不变式 5：不知道不等于没改，也不等于改了）。
 */
import { resolve } from "node:path"
import { test, expect, 在项目里开会话, 用某个agent开一段, 等进了对话 } from "./fixtures.js"

test.describe("产物：对话里的 GENERATED 条与坞的「产物」格", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: {
        toolName: "write",
        args: { path: "outputs/volcano_data.csv", content: "gene,log2FC,padj\nTP53,2.1,0.001\n" },
        say: "我先把数据写出来。",
      },
    },
  })

  test("write 新建一个 csv → 产物条 → 点 chip 进坞预览 → 回到清单", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("生成一份火山图数据")
    await 框.press("Enter")

    const 条 = page.getByRole("group", { name: "本轮生成的文件" })
    await expect(条).toBeVisible({ timeout: 60_000 })
    await expect(条.getByText("GENERATED · 1")).toBeVisible()
    await 条.getByRole("button", { name: /volcano_data\.csv/ }).click()

    await expect(page.getByRole("tab", { name: "产物", exact: true })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator(".preview")).toBeVisible()
    await page.getByRole("button", { name: "回到清单" }).click()
    // `exact`：对话里的工具行「✓ write outputs/volcano_data.csv」也含这个子串（按名字找东西是子串匹配）
    await expect(page.getByText("outputs/", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /volcano_data\.csv/ }).first()).toBeVisible()
  })
})

/** 与 e2e/cli-agent.spec.ts 同一份假 CLI */
const FAKE = resolve(import.meta.dirname, "fixtures/claude")
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

test.describe("外部 CLI 会话：本轮产出未知，不列 agent 声称的文件", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("cli 会话的 agent 轮画「本轮产出未知」", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude/)
    await 等进了对话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("把结果写到 outputs/fake.csv")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 CLI 已应答/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("本轮产出未知")).toBeVisible()
    await expect(page.getByText("外部 CLI 的文件操作不可见")).toBeVisible()
    // 限在主区：侧栏的会话标题是用户那句话本身，按钮名里天然带着 fake.csv；要验的是**对话里没有一枚 chip**
    await expect(page.getByRole("main").getByRole("button", { name: /fake\.csv/ })).toHaveCount(0)
  })
})
