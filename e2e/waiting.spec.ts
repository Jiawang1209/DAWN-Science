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
 * **跑起来之后，发送按钮就是停止按钮**（2026-08-13，作者提）。
 *
 * 他的原话：*「我没有看到哪里结束或者中止，我的发送按钮一直是好的。
 * 是不是需要在模型响应的过程中，这个发送按钮要变化一下呢？」*
 *
 * 「停止」此前在**对话标题栏**上——离输入框半个屏幕，而人正盯着输入框等回答。
 * 中止的入口应该在手已经在的地方。**标题栏那颗同时摘掉了**：一个动作一个家。
 */
test.describe("跑起来的时候", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 1500 } })

  test("**发送按钮变成停止，回音一到再变回来**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 发送 = page.getByRole("button", { name: "发送", exact: true })
    const 停止 = page.getByRole("button", { name: "停止", exact: true })
    await expect(发送).toBeVisible()
    await expect(停止).toHaveCount(0)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("在吗")
    await 框.press("Enter")

    // ① 跑起来了：**同一个位置**上现在是「停止」
    await expect(停止).toBeVisible({ timeout: 5_000 })
    await expect(发送).toHaveCount(0)

    /**
     * ② 它在输入卡里面——**不是在别处又长出一颗**。
     * 「中止的入口应该在手已经在的地方」，判据就是这个包含关系。
     */
    expect(await page.locator(".composer-box .send-btn").count()).toBe(1)

    // ③ 回音到了就变回「发送」
    await expect(page.locator(".turns").getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })
    await expect(发送).toBeVisible()
    await expect(停止).toHaveCount(0)
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

/**
 * **按下停止之后，那个记号必须停**（2026-08-13）。
 *
 * 这是这个功能唯一可能变成负资产的方式，而它比「回音到了」那条更难：
 * 回音会往转录里添一条，记号自然收；**而中止不一定产生任何新条目**——
 * 如果它不产生，`等回话` 就永远等下去。
 *
 * 2026-08-10 那一版正是死在这里（判据挂不住 → 记号永远在转），
 * 所以这条必须单独钉。
 */
test.describe("中止", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 4000 } })

  test("**按下停止，记号跟着停**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("说点什么")
    await 框.press("Enter")

    const 记号 = page.locator(".waiting")
    await expect(记号).toBeVisible({ timeout: 5_000 })

    // 同一个位置上那颗现在是「停止」
    await page.getByRole("button", { name: "停止", exact: true }).click()

    /** **记号必须消失**，而且不能等到 4 秒后那个回音把它带走 */
    await expect(记号).toHaveCount(0, { timeout: 3_000 })
  })
})

/**
 * **等待要等到「有东西可读」，不是「有新条目」**（2026-08-14 作者报的）。
 *
 * 作者的原话：*「等待模型响应的动作结束之后，结果还没有映射完，
 * 我其实是在等待 DAWN 的回复，然后直接弹出来就是 53s 想了一下。」*
 *
 * 老判据是「冒出任何新条目就撤销记号」。而带思考的模型第一个到达的是
 * **思考块**，且它整块完成后才落地——于是等待动画消失、屏幕上弹出一行
 * 「53s 想了一下」，而真正的回答还没开始。**那一刻人面前什么都没有。**
 */
test.describe("会思考的模型", () => {
  test.use({
    dawnOptions: {
      thinking: "让我想想这个问题该怎么答",
      firstChunkDelayMs: 800,
      // **想完之后停 2.5 秒再开口**：那段真空正是作者报的现象发生的地方
      thinkingHoldMs: 2500,
    },
  })

  /**
   * **记号要扛住整段思考，直到真的出字。**
   *
   * 老判据是「冒出任何新条目就撤销」。而带思考的模型在「想完」与「开口」之间
   * 有一段真空——作者的原话：*「等待模型响应的动作结束之后，结果还没有映射完，
   * 我其实是在等待 DAWN 的回复，然后直接弹出来就是 53s 想了一下。」*
   * 那一刻人面前既没有等待动画、也还没有回答。
   *
   * 这条用**真时间**验：假模型停 2.5 秒，而记号必须一直在。
   */
  test("**想完到开口那段真空里，记号不撤**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("在吗")
    await 框.press("Enter")

    const 记号 = page.locator(".waiting")
    await expect(记号).toBeVisible()

    // **停在真空中间再看一眼**：这一刻屏幕上还没有任何回答
    await page.waitForTimeout(2000)
    await expect(page.getByText(/假模型已应答/)).toHaveCount(0)
    await expect(记号, "回答还没出来，记号却先撤了——那正是作者报的那个空窗").toBeVisible()

    // 真的说出字了，才撤
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    await expect(记号).toHaveCount(0)
  })

  /**
   * **秒数要自己走。** 作者：*「我也可以看到 模型思考 1s 2s --- 53s 的这种感觉。」*
   * 一个不动的转圈回答不了「它是慢，还是卡住了」——而那正是人盯着屏幕时
   * 唯一想知道的事。
   */
  test("**记号自己会走秒**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("在吗")
    await 框.press("Enter")

    const 秒 = page.locator(".waiting .thought-secs")
    await expect(秒).toBeVisible()
    await expect(秒).toHaveText(/^\d+s$/)

    // **它真的在走**，不是画了个 0s 在那儿
    const 头 = Number((await 秒.textContent())!.replace("s", ""))
    await page.waitForTimeout(2200)
    const 后 = Number((await 秒.textContent())!.replace("s", ""))
    expect(后, `秒数没有在走：${头}s → ${后}s`).toBeGreaterThan(头)
  })
})
