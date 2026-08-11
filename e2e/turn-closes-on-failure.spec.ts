/**
 * **一轮失败了也要收尾**（2026-08-11）。**跑真实构建产物。**
 *
 * 作者：*「对话过程中，依旧不能切换模型，这个问题其实没有解决。」*
 *
 * ## 症状与原因隔着三层
 *
 * pi 正常跑完会自己发 `turn_end`；**但 `prompt()` 直接 reject 的那条路上一个都没有**
 * （例如 `No API key found for <provider>`——它在发请求之前就抛了）。于是：
 *
 *   1. 那一轮**永远开着**，「正在思考」的动图一直转
 *   2. 界面据「有没有开着的 agent 轮次」算 `busy`，于是它永远为真
 *   3. **`busy` 为真时模型菜单整个是禁用的** —— 点了没反应
 *
 * 作者看见的是第 3 层，而原因在第 0 层。**中间没有任何一句话把它们连起来。**
 *
 * 这条用例走的正是那条 reject 路径：配置里声明一个 provider 但**不给它 key**。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/** `{{MOCK_URL}}` 由夹具换成假服务器地址 */
const PROVIDERS = `
providers:
  nokey:
    baseUrl: "{{MOCK_URL}}"
    api: openai-completions
    models: [a-1, a-2]

agents:
  没钥匙:
    kind: native
    provider: nokey
    model: a-1
    capabilities: [chat, exec]
`

test.describe("一轮失败之后", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS } })

  test("**「正在思考」会停，模型也还能换** —— 失败不该把这一段锁死", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // 失败要出声（这条 2026-08-10 就立了）
    await expect(page.locator(".turns")).toContainText(/No API key|错误/, { timeout: 60_000 })

    // ① 动图停了 —— 它是「这一轮还开着」在屏幕上的样子
    await expect(page.locator(".thinking")).toHaveCount(0, { timeout: 30_000 })

    // ② 模型菜单**不再被禁用**——这一层正是作者报的「不能切换模型」
    const pill = page.locator(".composer .model-pill")
    await pill.getByRole("button").click()
    const 菜单 = page.getByRole("menu", { name: "切换模型" })
    await expect(菜单).not.toContainText("还没说完")
    await expect(菜单.getByRole("menuitem", { name: /a-2/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )

    /**
     * ③ **换不成也要当场说为什么。**
     *
     * 这个 provider 压根没有 key，所以这一次换必然失败（pi 那边直接拒）。
     * 要害不在成不成，在于**它不能悄悄什么都不发生**——
     * 那正是「点了没反应」的另一半。原因此前只进状态栏最下面那行小字。
     */
    await 菜单.getByRole("menuitem", { name: /a-2/ }).click()
    await expect(page.locator(".composer-problem")).toContainText(/API key|没有/, {
      timeout: 20_000,
    })
  })
})
