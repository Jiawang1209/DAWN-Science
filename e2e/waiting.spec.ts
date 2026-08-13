/**
 * 「发出去了、还没回音」时的那个动记号（2026-08-13）。**跑真实构建产物。**
 *
 * 作者：*「kimi 的回复其实略微有点儿慢，导致我以为是端口卡住了，
 * 你其实可以给我一个动态响应的图，让我知道这个对话是在的。」*
 *
 * ## 这份用例的重点是「它会停」
 *
 * 这件事 2026-08-10 做过一次并被撤掉，原因写在 `views.tsx` 里：
 * 那一版靠「最后一条是自己说的」判断，**而这个条件在回复到达之后
 * 仍然成立过一会儿**——回来了那三个点还在转。
 * **「一个永远在转的记号比没有更糟」是本项目自己写下的话。**
 *
 * 所以这里两条都验，而**第二条比第一条重要**：
 *   1. 发出去之后它出现
 *   2. **回音一到它就消失**
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

test.describe("慢一点的模型", () => {
  /**
   * **让假模型在第一个字之前停 1.5 秒。**
   *
   * 不放慢的话，假模型答得比记号出现还快——那时用例只能软断言
   * 「如果它出现过就……」，**而那等于没验**。
   * 这个旋钮演的正是作者那台机器上的情形：kimi 有几秒空窗。
   */
  test.use({ dawnOptions: { firstChunkDelayMs: 1500 } })

  test("**发出去之后有记号，回音一到就消失**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 记号 = page.locator(".waiting")
    await expect(记号).toHaveCount(0)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("在吗")
    await 框.press("Enter")

    /**
     * ① 它真的出现了，**而且说得出在等什么**
     *（`Loader` 的 label 是必填的：说不出在等什么的加载指示等于没说）。
     */
    await expect(记号).toBeVisible({ timeout: 5_000 })
    await expect(记号).toContainText("正在等模型回话")

    // 回音到了
    await expect(page.locator(".turns").getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })

    /**
     * ② **它必须消失。** 这一条就是 2026-08-10 那次被撤掉的原因，
     * 也是这个功能唯一可能变成负资产的方式。
     */
    await expect(记号).toHaveCount(0)
  })
  })

/**
 * **失败时也要停下来。**
 *
 * 一个转到天荒地老的记号，比没有记号更让人不知所措——
 * 它还在暗示「再等等就好了」。
 */
test.describe("发失败", () => {
  test.use({ dawnOptions: { modelsWithoutImages: true } })

  test("**发送当场失败时，记号不会挂住**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("这一句会失败")
    await 框.press("Enter")

    // 等到对面答完（这套夹具下它会正常答）——记号不该还在
    await expect(page.locator(".turns").getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".waiting")).toHaveCount(0)
  })
})
