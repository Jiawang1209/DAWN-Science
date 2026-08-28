/**
 * 首启向导（2026-08-27，spec `2026-08-27-首启向导与环境检测-design.md`）。
 *
 * 门槛只有 key：没凭证时首屏是向导，填了 key「开始使用」才亮。
 * 解释器是可选的检测：两枚假 `python3` 放进 PATH，一枚有 ipykernel 一枚没有，列出来、状态对、选中即写进设置。
 * **只列不装**：页面上不该有任何「帮我装」的按钮。
 */
import { test, expect } from "./fixtures.js"
import { resolve } from "node:path"
import { DEFAULT_CONFIG_YAML } from "../src/config/loader.js"

const 有内核 = resolve(import.meta.dirname, "fixtures", "py-with-kernel")
const 没内核 = resolve(import.meta.dirname, "fixtures", "py-without-kernel")

test.describe("首启向导", () => {
  test.use({ dawnOptions: { showSetup: true, env: { PATH: `${有内核}:${没内核}:${process.env.PATH ?? ""}` } } })

  test("没凭证 → 首屏是向导；检测列出两枚假 python 且状态对；选中即写进设置；填 key 后开始使用", async ({ dawn }) => {
    const { page } = dawn
    const 向导 = page.locator(".setup-wizard")
    await expect(向导).toBeVisible()
    const 开始 = 向导.getByRole("button", { name: "开始使用 →" })
    await expect(开始).toBeDisabled()

    // 解释器检测（可选那段）
    await 向导.getByRole("button", { name: "检测本机解释器" }).first().click()
    const 有 = 向导.locator(".ip-python .ip-item", { hasText: 有内核 })
    const 没 = 向导.locator(".ip-python .ip-item", { hasText: 没内核 })
    await expect(有).toBeVisible({ timeout: 30_000 })
    await expect(有).toContainText("3.11.9")
    await expect(有).toContainText("ipykernel ✓")
    await expect(没).toContainText("3.14.7")
    await expect(没).toContainText("ipykernel ✗")
    // 只列不装
    await expect(向导.getByRole("button", { name: /帮我跑|安装/ })).toHaveCount(0)

    await 有.getByRole("radio").check()
    await expect.poll(async () =>
      page.evaluate(async () => {
        const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { python?: string } }> } }
        return (await w.dawn.invoke("getInterpreters", {})).data?.python
      }),
    ).toBe(`${有内核}/python3`)

    // 门槛：key
    await 向导.getByLabel("API key").fill("sk-e2e-test")
    await 向导.getByRole("button", { name: "保存", exact: true }).click()
    await expect(向导).toContainText(/已填/)
    await expect(开始).toBeEnabled()
    await 开始.click()
    await expect(page.locator(".setup-wizard")).toHaveCount(0)
    await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
  })

  test("先跳过 → 回到普通首页，底部红字还在；点红字回到向导", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".setup-wizard")).toBeVisible()
    await page.getByRole("button", { name: "先跳过" }).click()
    await expect(page.locator(".setup-wizard")).toHaveCount(0)
    // 「优化输入」常驻（2026-08-28 作者定的）：这条夹具里有 ds-chat（native），所以它不灰；灰着说理由的形状在「产品原样的默认配置」那组验
    await expect(page.getByRole("button", { name: /优化/ })).toBeVisible()
    const 红字 = page.locator(".statusbar").getByRole("button", { name: /还没有填任何 API key/ })
    await expect(红字).toBeVisible()
    await 红字.click()
    await expect(page.locator(".setup-wizard")).toBeVisible()
  })
})

/**
 * **按产品原样的默认配置跑一遍全新安装**（2026-08-28，打包版抓的）。
 *
 * 夹具默认会把 `ds-chat` 插到 `agents:` 第一个——注释里写得明白：「追加在末尾会让默认 agent
 * 从 ds-chat 变成 claude」。**测试早知道这个坑，却绕开了它而不是锁住它**：真实首启走的正是被绕开的那条路——
 * 默认配置只有 claude / codex（cli），填 key 合成的 native 追加在末尾，一开口走的是 claude CLI。
 * 这条用发布出去的那份 `DEFAULT_CONFIG_YAML`，一个字不改。
 */
test.describe("首启向导 · 产品原样的默认配置", () => {
  test.use({ dawnOptions: { showSetup: true, providersYaml: DEFAULT_CONFIG_YAML } })

  test("**填完 key 一开口，走的是刚填的那家（native），不是 claude CLI**；「优化输入」在", async ({ dawn }) => {
    const { page } = dawn
    const 向导 = page.locator(".setup-wizard")
    await expect(向导).toBeVisible()
    await 向导.getByLabel("API key").fill("sk-e2e-test")
    await 向导.getByRole("button", { name: "保存", exact: true }).click()
    await expect(向导).toContainText(/已填/)
    await 向导.getByRole("button", { name: "开始使用 →" }).click()
    await expect(向导).toHaveCount(0)

    // 空态屏就该有「优化输入」——它只给 native（草稿为空时它的无障碍名是「先写点什么再优化」）
    await expect(page.getByRole("button", { name: /优化/ })).toBeVisible()

    const 输入 = page.getByPlaceholder(/今天帮你做些什么/)
    await 输入.fill("请说一句话")
    await 输入.press("Enter")
    // 等的是只有对话态才有的东西（不是输入框）
    await expect(page.locator(".conv-title")).toBeVisible()
    // 假模型回了话 = 这段会话走的是 native 链路；走 claude CLI 的话这里是「找不到 claude」
    await expect(page.locator(".conversation")).toContainText("假模型已应答", { timeout: 30_000 })
    await expect(page.getByRole("button", { name: /优化/ })).toBeVisible()

    const agentId = await page.evaluate(async () => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: Array<{ projectId: string }> }> } }
      const projects = (await w.dawn.invoke("listProjects", {})).data ?? []
      const sessions = (await w.dawn.invoke("listSessions", { projectId: projects[0]!.projectId })).data as unknown as Array<{ agentId: string }>
      return sessions[0]?.agentId
    })
    expect(agentId).toBe("deepseek")
  })
})
