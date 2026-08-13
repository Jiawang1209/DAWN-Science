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


/**
 * **首页第一句话没发出去时，不许留下一条空壳对话**（2026-08-13，作者要修的）。
 *
 * 他撞过两次：*「回车，结果给我的反馈是：还没有对话。」*
 *
 * ## 根因是顺序
 *
 * 此前是**先进对话、再发第一句**——于是第一句失败时人已经站在那个空会话里，
 * 屏幕上写着「还没有对话」，而他刚打的字和挑的图都没了。
 *
 * 现在：**发成功了才进去**；失败就把刚建的那条收掉，人留在原地。
 * **建会话 + 发第一句是一个意图，要么都成，要么都不留下痕迹。**
 *
 * ## 怎么造一个「真的会失败的写入」
 *
 * 用 `pickFiles` 注入一个**不存在的 `.png` 路径**：主进程读盘时
 * `readFile` 会抛，后端据此返回 `invalid_request`。
 * 这是这条路上少有的、**确定性的**写入失败——
 * 而模型侧的失败（`failStatus`）只让回答失败，写入本身照样成功，
 * **拿它当判据的话这条用例是假绿的**（第一版就是）。
 */
test.describe("第一句就失败", () => {
  const 不存在的图 = "/tmp/dawn-这张图不存在-e2e.png"
  test.use({ dawnOptions: { pickFiles: [不存在的图] } })

  test("**人留在原地，字还在，侧栏不多一条空壳**", async ({ dawn }) => {
    const { page } = dawn
    await page.locator(".composer").waitFor({ timeout: 30_000 })

    const 起初 = await page.locator(".sidebar .sess-item").count()

    // 挑一张「存在于选择器、不存在于磁盘」的图
    await page.locator(".composer-controls .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传图片", exact: true }).click()
    await expect(page.locator(".attached-one")).toHaveCount(1, { timeout: 10_000 })

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("这一句会失败")
    await 框.press("Enter")

    // ① **原因摆在输入卡旁边**，不是丢进某个角落
    await expect(page.locator(".composer-problem")).toBeVisible({ timeout: 30_000 })

    // ② **人还在原地**：没有被拽进一个空对话
    await expect(page.locator(".conv-title")).toHaveCount(0)

    // ③ **字和图都还在**：不该为一次失败重打一遍、重挑一遍
    await expect(框).toHaveValue("这一句会失败")
    await expect(page.locator(".attached-one")).toHaveCount(1)

    // ④ **侧栏不多一条空壳**：话没送出去，这段对话就不该存在
    await expect(page.locator(".sidebar .sess-item")).toHaveCount(起初)
  })
})
