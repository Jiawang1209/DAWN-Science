/**
 * 视觉服务（2026-08-20）。**跑真实构建产物。**
 *
 * 作者：*「给 deepseek 添加一个视觉……做一个选择框，是否添加视觉，
 * 选择之后才能调用。」* 设计定案见 `specs/2026-08-20-视觉服务-design.md`。
 *
 * 两条用例合演整个闭环：
 * ① 设置卡：填地址/模型/密钥 → 勾「启用视觉」 → 存 → 「测试视觉模型」真调一次；
 * ② 贴图给一个**不收图**的模型 → 对话里出现「已由 ○○ 转述」，
 *    且 mock 服务器真收到了带 image_url 的那一发。
 *
 * 视觉端点就是那台假推理服务器——它说的本来就是同一种
 * OpenAI Chat Completions（规则 ①：mock 与 e2e 共用一份假后端）。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

test.describe("视觉服务", () => {
  /** 演作者那台机器：模型目录里没有 `input`，图送不出去——正是要视觉的场景 */
  test.use({ dawnOptions: { modelsWithoutImages: true } })

  test("**设置卡配好、测一发；贴图之后对话里出现「已转述」**", async ({ dawn }) => {
    const { page, mockUrl, requests } = dawn

    // ── ① 配好视觉服务（2026-08-23 起设置里没有那一格了——DeepSeek 自己能看图；视觉转述这条缝还在，走应用自己的 IPC 配）──
    const r = await page.evaluate(async (url) => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { ready?: boolean } }> } }
      return (await w.dawn.invoke("saveVision", { enabled: true, baseUrl: url, model: "qwen-vl-mock", secret: "sk-e2e" })).data
    }, mockUrl)
    expect(r?.ready).toBe(true)

    // ── ② 贴图那条缝 ──────────────────────────────────────────
    const 之前收到 = requests.length
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
      dt.items.add(new File([bytes], "要转述的.png", { type: "image/png" }))
      const el = document.querySelector(".composer-field") as HTMLTextAreaElement
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }))
    })
    await expect(page.locator(".attached-one")).toHaveCount(1, { timeout: 10_000 })

    await 框.fill("解读一下这张图")
    await 框.press("Enter")

    /**
     * **对话里那句话换了**：不再是「可能不会被它看到」，
     * 而是「已由 qwen-vl-mock 转述」。旧句子必须消失——
     * 两句同时在场就说明两条分支都跑了。
     */
    await expect(page.locator(".turns").getByText(/已由 qwen-vl-mock 转述/)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator(".turns").getByText(/可能不会被它看到/)).toHaveCount(0)

    /**
     * **转述的字节真到了对面**（不是空转）：从这一步起，假服务器至少收到
     * 一发带 image_url 的请求（视觉转述那一发），
     * 以及一发**并进了转述文字**的正式轮次。
     */
    const 新请求 = JSON.stringify(requests.slice(之前收到))
    expect(新请求).toContain('"type":"image_url"')
    expect(新请求).toContain("我收到了 1 张图")
  })
})
