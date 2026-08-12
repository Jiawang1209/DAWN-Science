/**
 * **中途加的端点，不用重启就能用**（2026-08-11 修的那个缺陷）。**跑真实构建产物。**
 *
 * ## 作者报的症状
 *
 * *「我在现在的版本，重新设置了 kimi-k3，地址写的是 https://api.moonshot.cn/v1，
 * 填写了正确的 API，设置成功后，我点击对话，发现模型选择的地方没有 kimi-k3。」*
 *
 * 查下来磁盘上三样全对——`providers.yaml`、`models.generated.json`、钥匙串里的 key。
 * 断的是下一环：**pi 从来没读过那份文件**。
 * `modelsPath` 此前是构造时钉死的，而启动那一刻配置里还没有任何 `providers:`，
 * `writeModelsJson` 于是返回 undefined，运行时拿到「不落盘」。
 * 之后重置多少次目录都一样——它每次都从 `null` 重新读。
 *
 * ## 为什么原来那批 e2e 没抓住
 *
 * **假服务器总会给一份基底 `models.json`**（`DAWN_MODELS_JSON`），
 * 于是 e2e 那条路上 `modelsPath` 从来都不是空的。
 * **测试环境比生产环境多一样东西，而那一样东西正好盖住了缺陷。**
 *
 * 所以这条用例的要害不在断言，在 `noModelsBase: true`——
 * 它把起点调回和真实安装一样。
 */
import { test, expect, CANNED_REPLY, 等进了对话 , 进设置 } from "./fixtures.js"

test.describe("启动时一个 provider 覆盖都没有", () => {
  test.use({ dawnOptions: { noModelsBase: true } })

  test("**中途加一个自定义端点，当场就能选到、能对话** —— 不用重启", async ({ dawn }) => {
    const { page, mockUrl, requests } = dawn

    await 进设置(page, "模型服务")
    await page.getByRole("button", { name: /添加模型服务/ }).click()
    await page.getByRole("radio", { name: "自定义端点" }).click()
    await page.getByLabel("新服务的名字").fill("late")
    await page.getByLabel("新服务的端点地址").fill(mockUrl)
    await page.getByLabel("新服务的模型清单").fill("late-7b")
    await page.getByLabel("新服务的 API key").fill("local")
    await page.getByRole("button", { name: "加进来" }).click()

    /**
     * **摘要上那个「1 个模型」就是本用例的第一现场。**
     *
     * 它来自 pi 的模型目录，不是我们刚填的表单——所以它显示「⚠ 没有模型」
     * 就说明目录没读到那份文件，也就是作者撞上的那一刻。
     */
    const 行 = page.locator(".svc").filter({ hasText: "late" })
    await expect(行.locator(".svc-sum")).toContainText("1 个模型", { timeout: 20_000 })

    await page.getByRole("button", { name: "返回" }).click()

    /**
     * **从空态里挑它开第一个会话。**
     *
     * 不走「新建会话」：那个按钮用的是列表里的第一个 agent（`ds-chat`／deepseek），
     * 而这个用例刻意没有基底目录、也没给 deepseek 填过 key——
     * 拿它开会话本来就该失败。**要验的是 `late` 这一条路。**
     */
    // 2026-08-11：这颗从「换一个 agent」改叫「换一个 LLM」——DAWN 自己才是那个 agent
    await page.getByRole("button", { name: /切换服务|选择 agent|ds-chat|DeepSeek/ }).click()
    await page.getByRole("menuitem", { name: "late" }).click()
    await 等进了对话(page)
    // **模型选择的地方有它**——作者说的正是这一句
    await expect(page.locator(".composer")).toContainText("late-7b", { timeout: 20_000 })

    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })

    // **反空转**：请求真的打到了刚填的那个地址上
    expect(JSON.stringify(requests)).toContain("late-7b")
  })
})
