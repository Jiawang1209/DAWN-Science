/**
 * 上下文用量（①-B″ · U3）。**跑真实构建产物。**
 *
 * 这条守的是「已用 token」那一半真的接通了。
 * 假后端报 `prompt_tokens: 12`——**面板上必须出现这个数**，
 * 而不是停在「尚未采集」。
 */
import { test, expect, 开一段临时会话, 进坞 } from "./fixtures.js"

test("说过一句话之后，上下文面板给出真实的 token 数", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

  await 进坞(page, "概览")  // 概览 2026-08-20 搬进坞
  /**
   * **按标题定位，不按「面板里含这三个字」。**
   *
   * `hasText: "上下文"` 是整块文本的子串匹配——2026-08-09 成本栏接线之后，
   * native 的成本原因里写着「token 用量见上下文栏」，
   * 于是这个定位器一下子匹配到两个面板，strict 模式直接报错。
   * **定位器松，就迟早会被别处的一句话撞上。**
   */
  const panel = page.locator(".panel", { has: page.getByText("上下文", { exact: true }) })
  /**
   * **2026-08-10：这两行此前是一条假绿。**
   *
   * 原来写的是 `toContainText("12")` + `toContainText("tokens")`——
   * 而面板上本来就有「模型上限 **128,000** tokens」，那个 `12` 和 `tokens`
   * 都被它满足了。真实情况是「已用**尚未采集**」，
   * 也就是这条用例标题里那件事**一天都没成立过**。
   *
   * 现在断言的是完整的那一段，并且**显式地要求它不再说「尚未采集」**。
   */
  await expect(panel).toContainText("12 / 128k tokens")
  await expect(panel).not.toContainText("尚未采集")
})

test("**下表明写「按字节」** —— 不写清楚，人会把它当成 token 分解", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)
  await 进坞(page, "概览")  // 概览 2026-08-20 搬进坞
  await expect(page.locator(".panel", { hasText: "上下文" })).toContainText("按字节，不是 token")
})
