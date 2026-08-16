/**
 * ACP agent 走通一整段对话（A1，2026-08-16，分支 `acp`）。**跑真实构建产物。**
 *
 * ## 这条用例是 A1 的完成判据
 *
 * 设计文档里写着：*「跑不通之前所有设计都是纸上的。」*
 * 单元那侧已经证明运行时会说 ACP，但**它证明不了这条路在应用里接上了**——
 * 配置 → `SessionManager` 的分发 → 事件流 → 转录 → 渲染，中间任何一节断了，
 * 屏幕上都是「发了没反应」。
 *
 * ## 顺带验掉一条跨平台的
 *
 * 配置里写的是 `command: node`——那是一个**记号**，会被换成
 * Electron 自己那个二进制（`ELECTRON_RUN_AS_NODE`）。
 * 所以这条用例同时证明：**一台没装 Node 的机器上，ACP 也起得来**。
 * 那正是「打包成本地软件」最先会咬人的地方。
 */
import { resolve } from "node:path"
import { test, expect, 等进了对话, 用某个agent开一段 } from "./fixtures.js"

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
  坏掉的-acp:
    kind: acp
    command: 这个命令肯定不存在-dawn
    args: []
    capabilities: [chat, exec]
`

test.describe("ACP", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**一整段对话跑得通**，且模型旁边标着 ACP", async ({ dawn }) => {
    const { page } = dawn

    // 用 ACP 那个 agent 开一段
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)

    /**
     * ① **标签要在模型旁边**（作者定的第一条）。
     *
     * 三条路的能力真的不一样——`API` 权限门管得住、`CLI` 管不到也不问、
     * `ACP` 管不到但会主动问。不标出来，
     * 「为什么这次它没问我就删了文件」永远说不清。
     */
    await expect(page.locator(".conv-head .kind")).toHaveText("ACP")

    // ② 一句话进去，回话出来——**整条链通了**
    await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假 ACP agent 已应答/).last()).toBeVisible({ timeout: 30_000 })

    // ③ **它真的收到了我们说的那句**，不是自说自话
    await expect(page.getByText(/你说的是：在吗/).last()).toBeVisible({ timeout: 30_000 })

    /**
     * ④ **这一轮要收口。** 账本靠 `idle` 关账；不收口的表现是
     * 那三个点一直转——本项目为「一个永远在转的记号」撤过一次功能。
     */
    await expect(page.locator(".waiting")).toHaveCount(0, { timeout: 30_000 })
  })

  /**
   * **起不来要说清楚。**
   *
   * 一个填错的 command 是最常见的失败（作者的机器上没有那个适配器），
   * 而它此前唯一可能的表现是「点了没反应」。
   */
  test("**适配器起不来时，屏幕上有一句人话**", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /坏掉的/)
    /**
     * 失败要出现在**屏幕上**，不是只在主进程日志里。
     * 空态那张卡上那条 `.composer-problem` 就是这类失败的家
     * （与「挑了一个起不来的 agent」共用同一个出口）。
     */
    await expect(page.locator(".composer-problem")).toContainText(/起不来 ACP 适配器/, {
      timeout: 30_000,
    })
  })
})
