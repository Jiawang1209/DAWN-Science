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

/**
 * **第一句话也要有等待记号**（2026-08-14 作者报的）。
 *
 * 作者：*「这一次没有等待模型响应了……一直在等待回复，但是界面没有任何的变化，
 * 我甚至以为是对话死掉了。」*
 *
 * 根因：`设等回话` 此前只在对话里那个输入框的提交处理器里，而**第一句走的是
 * 空态那条路**（`新建任务` → `writeToSession`），对话视图随后才挂载。
 *
 * 它还牵出第二个症状：`busy` 因此为假 → 发送按钮没变成停止 →
 * **人可以再发一次** → pi 回 `Agent is already processing`。
 * 这条把两个症状一起钉住。
 */
test.describe("第一句话", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 2500 } })

  test("**空态发出去的第一句也有记号，且发送按钮变成停止**", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()

    // **走空态那条路**：不是先进对话再发，而是在起始屏直接开口
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("帮我查一下参考基因组怎么下载")
    await 框.press("Enter")

    await expect(
      page.locator(".waiting"),
      "第一句没有等待记号——人会以为对话死了",
    ).toBeVisible({ timeout: 30_000 })

    /**
     * **同一个根的第二个症状**：记号不在 ⇒ `busy` 为假 ⇒ 还能再发一次，
     * 而 pi 会回 `Agent is already processing`。
     */
    await expect(
      page.getByRole("button", { name: "停止" }),
      "发送按钮没变成停止——这一刻人可以再发一次，pi 会报 already processing",
    ).toBeVisible()

    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".waiting")).toHaveCount(0)
  })
})

/**
 * 复制按钮按下之后那句「已复制」**不许竖着排**（2026-08-14 作者报的）。
 *
 * 按钮是按图标尺寸排版的，而中文可以在任意两字之间断行——三个汉字于是
 * 被挤成一列。西文不会暴露它（`Copied` 是一个不可断的词），
 * 所以这条**必须量形状**，不能只看文字在不在。
 */
/**
 * 复制之后弹一个提示浮层（2026-08-14，作者定的形态）。
 *
 * 上一版是把按钮里的图标换成「已复制」三个字——按钮按图标尺寸排版，
 * 内容盒只有 20px 而那三个字要 45.6px，于是字溢到按钮外面，看着像竖排了一列。
 *
 * **新形态从根上绕开它：按钮永远是图标，宽度不变；提示浮在旁边。**
 * 所以这条同时量两件事：浮层是横着的、**按钮宽度没被撑变**。
 */
test("**复制之后旁边弹出提示，而按钮宽度不变**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("在吗")
  await 框.press("Enter")
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 复制 = page.locator(".copy-btn").last()
  const 按前 = (await 复制.boundingBox())!.width

  await 复制.click()
  const 浮层 = 复制.locator(".copied-toast")
  await expect(浮层).toBeVisible()
  await expect(浮层).toHaveText("已复制")

  // **横着的**：竖排时高会大于宽
  const 盒 = (await 浮层.boundingBox())!
  expect(盒.width, `提示竖着排了：宽 ${Math.round(盒.width)} × 高 ${Math.round(盒.height)}`)
    .toBeGreaterThan(盒.height)

  // **按钮没被撑变** —— 那正是上一版的病根
  expect((await 复制.boundingBox())!.width, "按钮宽度被提示撑变了").toBe(按前)

  /**
   * **它得真的在屏幕里**（2026-08-14 截图抓到的）。
   *
   * 第一版让浮层往左浮，而用量那一行的复制按钮靠着容器左边——
   * 浮层被推到容器外面，**屏幕上根本看不见**，
   * 可 `boundingBox` 照样有值、`toBeVisible()` 也照样过。
   * 所以这里量的是**位置**，而且**跟容器比**：第一版拿它和视口比（`x >= 0`），
   * 那条永远成立——容器本身就不在视口最左边，于是浮层已经被容器裁掉了，
   * 断言却还是绿的。**参照系挑错，判据就等于没有。**
   */
  const 容器 = (await page.locator(".turns-inner").last().boundingBox())!
  expect(
    盒.x,
    `提示被容器裁掉了：浮层左边 ${Math.round(盒.x)} < 容器左边 ${Math.round(容器.x)}`,
  ).toBeGreaterThanOrEqual(容器.x)
})

/**
 * **Esc = 中断这一轮**（2026-08-16，作者：*「我在对话的时候，如果点击 ESC
 * 就是中断对话，模仿一下 Codex」*）。
 *
 * ## 为什么不是「按钮已经够了」
 *
 * 那颗按钮**框里一有字就变成「插队」了**（2026-08-15 学 Hermes 定的，
 * 理由是打了字的人按下去不该把自己的话丢掉）。代价当时就写清楚了：
 * **想停下来的人得先把自己打的字删干净。** Esc 补的正是这条路——
 * 它不看框里有没有东西。
 *
 * 所以这里**故意在框里留着字**：那是上一条路走不通的那个状态，
 * 也是这条判据唯一有意义的地方。
 */
test.describe("Esc 中断", () => {
  /**
   * **延迟必须远长于断言窗口**（变异测试逼出来的）。
   *
   * 第一版用的是 4 秒——而那一轮 4 秒后**自己就结束了**，
   * 于是「按 Esc 之后按钮变回发送」在把 Esc 整支删掉之后照样成立：
   * 用例全绿，什么也没证明。20 秒 vs 5 秒的断言窗口，
   * **这中间的差就是「是不是它停的」**。
   */
  test.use({ dawnOptions: { firstChunkDelayMs: 20_000 } })

  test("**框里有字时按 Esc，照样停得下来**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("在吗")
    await 框.press("Enter")
    await expect(page.getByRole("button", { name: "停止", exact: true })).toBeVisible({
      timeout: 5_000,
    })

    // 打第二句：那颗按钮此刻是「插队」，**没有「停止」可按了**
    await 框.fill("这半句还没发")
    await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "插队", exact: true })).toBeVisible()

    await 框.press("Escape")

    // ① 真的停了：按钮在**远早于那一轮自己结束**的时候就变回了「发送」
    await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({
      timeout: 5_000,
    })
    // ② 那句回话**没来过**——停在了它到达之前
    await expect(page.locator(".turns").getByText(/假模型已应答/)).toHaveCount(0)
    // ③ 那三个点也得停——**一个永远在转的记号比没有更糟**
    await expect(page.locator(".waiting")).toHaveCount(0)
    // ④ **没打完的那半句还在**：Esc 不清草稿
    await expect(框).toHaveValue("这半句还没发")
  })
})
