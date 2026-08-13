/**
 * 模型没声明收图时**照样把这一轮发出去**（2026-08-13）。**跑真实构建产物。**
 *
 * 作者定的：*「其实也可以传入……你不能解析就回复不能解析图片就好了，
 * **但是对话是要有的**。」*
 *
 * ## 我上一版把方向搞反了
 *
 * 我在运行时那一层加了一道防线：模型的目录里没声明 `input: ["image"]` 就抛错。
 * 理由是「不能让图被静默丢掉」——**但代价是整轮对话都没了**，
 * 人看见的是一个空会话写着「还没有对话」。作者报了两次。
 *
 * **丢一张图，人还能接着聊；拦住整轮，人连对话都没有。** 后者坏得多。
 * 现在改成：**照发，并在对话里留一句说明**。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

test.describe("模型没声明收图", () => {
  /** 演作者那台机器上的配置：模型目录里没有 `input` */
  test.use({ dawnOptions: { modelsWithoutImages: true } })

  test("**对话照样发生，而且说清了图可能没送到**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.click()
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
    await 框.press("Enter")

    /**
     * ① **对话是有的。** 这一条就是作者要的全部——
     * 他此前看到的是一个空会话写着「还没有对话」。
     */
    await expect(page.locator(".turns").getByText("解读一下这张图")).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator(".turns").getByText("还没有对话")).toHaveCount(0)

    /**
     * ② **而且如实说了一句**：这个模型的目录里没声明支持图片。
     * 不说的话，图被丢掉这件事**只有模型的回答才透露得出来**，
     * 而人会去怪模型笨。
     */
    await expect(page.locator(".turns").getByText(/没有声明支持图片/)).toBeVisible({
      timeout: 30_000,
    })

    // ③ 发完就清空——留着的话下一句会把同一张图再送一遍
    await expect(page.locator(".attached-one")).toHaveCount(0)
  })
})
