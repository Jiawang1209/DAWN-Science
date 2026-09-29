/**
 * **用户气泡即时上屏**（2026-09-29，A1，学自 dsh 的 `PendingSubmissionBubble`）。**跑真实构建产物。**
 *
 * 按下发送那一帧，渲染进程先在转录里画一条**回显**（`data-echo`，没有操作行）；
 * 后端把 `u{n}` 推回来时在同一次落地里顶掉它。要钉的两件事：
 *   ① 气泡先于后端回灌出现——第一次冒出来的那条人话带 `data-echo`；
 *   ② 任何一刻屏幕上都只有一条（「两处长得一样的东西」那条坑）。
 *
 * 判据不靠「点完立刻看一眼」（那是在赌时序），而是在按下之前挂一个 MutationObserver，
 * **把每一次 DOM 变化时的人话条数都记下来**，事后看记录。
 */
import { test, expect, 开一段临时会话, 等进了对话, CANNED_REPLY } from "./fixtures.js"

/** 在页面里挂一个观察者：记下第一次出现的那条人话是不是回显、以及任何一刻最多有几条 */
async function 挂观察(page: import("@playwright/test").Page, 话: string): Promise<void> {
  await page.evaluate((话) => {
    const w = window as unknown as { __回显记录: { 首条是回显?: boolean; 最多: number; 见过回显: boolean } }
    w.__回显记录 = { 最多: 0, 见过回显: false }
    const 数 = () => {
      const 条 = [...document.querySelectorAll(".turn.user")].filter((x) => x.textContent?.includes(话))
      const r = w.__回显记录
      if (条.length > 0 && r.首条是回显 === undefined) r.首条是回显 = 条[0]!.hasAttribute("data-echo")
      if (条.some((x) => x.hasAttribute("data-echo"))) r.见过回显 = true
      r.最多 = Math.max(r.最多, 条.length)
    }
    new MutationObserver(数).observe(document.body, { childList: true, subtree: true, attributes: true })
  }, 话)
}

const 读记录 = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __回显记录: { 首条是回显?: boolean; 最多: number; 见过回显: boolean } }).__回显记录)

test.describe("用户气泡即时上屏", () => {
  test("**按下就有，真的来了顶掉它，始终只有一条**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 话 = "回显这一句先上屏"
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill(话)
    await 挂观察(page, 话)
    await 框.press("Enter")

    // 真的那条到了（没有 data-echo、带操作行），回复也到了
    const 真的 = page.locator(".turn.user:not([data-echo])", { hasText: 话 })
    await expect(真的).toHaveCount(1, { timeout: 30_000 })
    await expect(真的.locator(".turn-actions")).toHaveCount(1)
    await expect(page.locator(".turns").getByText(CANNED_REPLY)).toBeVisible({ timeout: 30_000 })

    const r = await 读记录(page)
    // ① 第一次冒出来的是回显——它先于后端回灌
    expect(r.首条是回显).toBe(true)
    // ② 任何一刻都只有一条
    expect(r.最多).toBe(1)
    await expect(page.locator(".turn.user")).toHaveCount(1)
    await expect(page.locator(".turn[data-echo]")).toHaveCount(0)
  })
})

/**
 * **空态第一句**（A1 补）：会话是开口那一刻才建的，第一句写进去之后才切进对话；
 * 切过去到订阅快照回来之间，屏幕上原来是「还没有对话」。现在那一下画的是这一段的回显，
 * 快照带着真的那条到了再换掉——同样：第一次看见的是回显，任何一刻只有一条。
 */
test.describe("回显 · 空态第一句", () => {
  test("**进对话的第一帧就有这句，从不出现「还没有对话」，也从不两条**", async ({ dawn }) => {
    const { page } = dawn
    await page.locator(".composer").waitFor({ timeout: 30_000 })

    const 话 = "空态第一句先上屏"
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill(话)
    await 挂观察(page, 话)
    // 另记一笔：对话挂上之后有没有出现过「还没有对话」
    await page.evaluate(() => {
      const w = window as unknown as { __空过?: boolean }
      w.__空过 = false
      new MutationObserver(() => {
        if (document.querySelector(".conv-title") && document.querySelector(".turns .empty")) w.__空过 = true
      }).observe(document.body, { childList: true, subtree: true })
    })
    await 框.press("Enter")

    const 真的 = page.locator(".turn.user:not([data-echo])", { hasText: 话 })
    await expect(真的).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator(".turns").getByText(CANNED_REPLY)).toBeVisible({ timeout: 30_000 })

    const r = await 读记录(page)
    expect(r.首条是回显).toBe(true)
    expect(r.最多).toBe(1)
    expect(await page.evaluate(() => (window as unknown as { __空过?: boolean }).__空过)).toBe(false)
    await expect(page.locator(".turn.user")).toHaveCount(1)
    await expect(page.locator(".turn[data-echo]")).toHaveCount(0)
  })
})

/**
 * **发送失败：回显撤掉，话退回输入框。** 造失败的办法与 `send-failure.spec.ts` 同一个：
 * 注入一张「选得到、磁盘上没有」的图，主进程读盘时抛。
 */
test.describe("回显 · 发送失败", () => {
  test.use({ dawnOptions: { pickFiles: ["/tmp/dawn-回显-这张图不存在-e2e.png"] } })

  test("**回显撤掉，屏幕上不留一条没发出去的话，字回到框里**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    await page.locator(".composer-card .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传图片", exact: true }).click()
    await expect(page.locator(".attached-one")).toHaveCount(1, { timeout: 10_000 })

    const 话 = "这一句会失败"
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill(话)
    await 挂观察(page, 话)
    await 框.press("Enter")

    await expect(page.locator(".composer-problem")).toBeVisible({ timeout: 30_000 })
    await expect(框).toHaveValue(话)
    await expect(page.locator(".turn.user")).toHaveCount(0)
    const r = await 读记录(page)
    // 回显确实画过（按下那一帧），失败后撤掉了
    expect(r.见过回显).toBe(true)
    expect(r.最多).toBe(1)
  })
})
