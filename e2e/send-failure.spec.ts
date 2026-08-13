/**
 * 发送失败时，**别把人的话和图一起吃掉**（2026-08-13）。**跑真实构建产物。**
 *
 * 作者：*「我使用 kimi 模型，然后我复制粘贴一个图片到对话框，让它解读这个图，
 * 但是没有任何反应呢。」*
 *
 * ## 「没有任何反应」是两件事叠在一起
 *
 * 1. 那一轮真的失败了（他自己加的 `kimi-k3` 是自定义 provider，
 *    而我们生成的模型条目**一个 `input` 都没写**——pi-ai 拼请求时看
 *    `model.input.includes("image")`，不声明就把图丢掉）。
 * 2. **而失败在屏幕上不留痕**：输入框已经清空、附件已经丢掉，
 *    原因只经 `note()` 走到了别处。
 *
 * 第 2 件才是这份用例盯的东西——**它比第 1 件更值钱**：
 * 第 1 件是一个具体的 bug，第 2 件是「以后任何一次发送失败都会变成
 * 『什么都没发生』」的那个形状。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

test.describe("发送失败", () => {
  /**
   * **演的是作者那台机器上的配置**：模型没声明收图。
   * 那时附了图按下发送会**当场失败**——而这正是他看见「没有任何反应」的那条路。
   */
  test.use({ dawnOptions: { modelsWithoutImages: true } })

  test("**失败时字还在、图还在，而且说得出为什么**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.click()
    // 粘一张图进去
    await page.evaluate(() => {
      const b64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], "要解读的.png", { type: "image/png" }))
      const el = document.querySelector(".composer-field") as HTMLTextAreaElement
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }))
    })
    await expect(page.locator(".attached-one")).toHaveCount(1, { timeout: 10_000 })

    await 框.fill("解读一下这张图")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    /**
     * ① **原因摆在输入卡旁边**，不是丢进某个角落。
     * 一条看不见的报错，与「什么都没发生」在屏幕上是同一个样子。
     */
    await expect(page.locator(".composer-problem")).toBeVisible({ timeout: 30_000 })

    /**
     * ② **那句话还在框里。** 人不该为一次失败重打一遍——
     * 而且「我打的字凭空消失」比失败本身更让人不信任这个界面。
     */
    await expect(框).toHaveValue("解读一下这张图")

    /**
     * ③ **图也还在。** 重挑一遍比重打一遍更烦——
     * 而人根本不知道是自己哪里做错了。
     */
    await expect(page.locator(".attached-one")).toHaveCount(1)

    /** ④ 报错要**说得出是哪个模型**，否则人只能去猜 */
    await expect(page.locator(".composer-problem")).toContainText(/不接收图片/)
  })
})
