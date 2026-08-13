/**
 * 命令环境里不该有 `PI_MODEL` 这类会过期的快照（2026-08-12）。**跑真实产物。**
 *
 * 作者连着换了三次模型，每次问「你是什么模型」都答 deepseek：
 *
 * > *「我切换 kimi-k3 了，我问它：你的模型是什么，回复错误：Deepseek」*
 *
 * ## 根因不是没换过去
 *
 * Kimi 自己报过「我是 Kimi，由月之暗面开发」——deepseek 说不出这句。
 * 真正发生的是：**它第一轮跑过 `env`，那份输出留在对话里**，
 * 里面写着 `PI_MODEL=deepseek-v4-flash`。之后每次它都照着那份快照念，
 * 而**快照是不会自己更新的**。
 *
 * 劝它「那份已经过期」试过了，压不住一份长得像证据的输出。
 * **所以让这份证据不存在。** 这条用例盯的就是它不存在。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("命令环境", () => {
  test.use({
    dawnOptions: { toolCall: { toolName: "bash", args: { command: "env | sort" } } },
  })

  test("**`env` 里没有 PI_MODEL / PI_PROVIDER** —— 没有快照可念", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("看看环境")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const tool = page.locator(".tool").first()
    await tool.locator(".tool-head").click()
    /**
     * **必须先展开。**
     *
     * 结果默认折叠到十几行，而 `env` 有上百行。不展开就断言「没有 PI_MODEL」
     * **是一次假通过**——它可能就躺在没显示的那部分里。
     */
    const 展开 = tool.getByRole("button", { name: /展开全部/ })
    if (await 展开.count()) await 展开.click()

    const 输出 = tool.locator(".tool-result")
    await expect(输出).toBeVisible()

    // **反空转**：先确认真的拿到了一份环境，否则下面几条在空字符串上也成立
    await expect(输出).toContainText("PATH=")

    /**
     * 这三个是作者那份旧快照的全部来源。**一个都不该在**。
     */
    await expect(输出).not.toContainText("PI_MODEL")
    await expect(输出).not.toContainText("PI_PROVIDER")
    await expect(输出).not.toContainText("PI_REASONING_LEVEL")
  })
})
