/**
 * 点通知时界面没在听（2026-09-28）。**跑真实构建产物。**
 *
 * 真实场景是 macOS 关掉窗口后点通知：主进程开一个新窗口，页面载完时界面还没挂事件监听（它等 `ready`），
 * 挂上了名单也还是空的——只推不记的那一版，推过去的 `openSession` 就丢了。
 *
 * **e2e 模拟不了「没有窗口」**：夹具开着 `DAWN_HIDE_WINDOW`，那时 `点了通知` 按规矩不开窗（不许抢作者焦点），
 * 而 Playwright 手里的 `page` 就是那扇窗，关了它用例也就没了。所以演的是同一个坑的另一种进法——
 * **页面正在换的那一刻点**：主进程把窗口导到 `about:blank`（那里没有界面、没人听），点通知（推送必丢），再导回来。
 * 界面起来之后必须自己去拉（`takePendingOpenSession`）并回到那段，而且名单取回之前不许说「那段对话已经不在了」。
 * 丢推送这一步是确定的，不靠快慢——修之前这条稳定红。
 */
import type { Locator, Page } from "@playwright/test"
import { test, expect, 开一段临时会话, 等进了对话, 读桌面通知, 点桌面通知 } from "./fixtures.js"

const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)
async function 另开一段(page: Page, 首句: string) {
  await page.getByRole("button", { name: "新建任务" }).click()
  await expect(page.locator(".conv-title")).toHaveCount(0)
  await 框(page.locator("body")).fill(首句)
  await 框(page.locator("body")).press("Enter")
  await 等进了对话(page)
  await expect(page.locator(".conv-title")).toContainText(首句, { timeout: 30_000 })
}

test("**推送丢了也回得去**：页面在换的那一刻点通知 → 页面起来后拉到那段、切过去，不误报「不在了」", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "冷点那段")
  await 等进了对话(page)
  await expect.poll(async () => (await 读桌面通知(app)).filter((n) => n.kind === "done").length, { timeout: 30_000 }).toBe(1)
  const 那段 = (await 读桌面通知(app)).findIndex((n) => n.kind === "done")
  expect((await 读桌面通知(app))[那段]!.sessionId).toBeTruthy()

  // 主区换到另一段：回到那段要真的切过去才算
  await 另开一段(page, "眼下这段")

  // 页面导走：此刻点，推送没人收
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    ;(globalThis as unknown as { __冷点原址: string }).__冷点原址 = w.webContents.getURL()
    await w.webContents.loadURL("about:blank")
  })
  await 点桌面通知(app, 那段)
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    await w.webContents.loadURL((globalThis as unknown as { __冷点原址: string }).__冷点原址)
  })

  await expect(page.locator(".conv-title")).toContainText("冷点那段", { timeout: 30_000 })
  await expect(page.getByText("那段对话已经不在了")).toHaveCount(0)
  // 读了就清：再重载一次不会又被拽回那段
  await 另开一段(page, "再换一段")
  await page.reload()
  await page.locator(".session-list, .proj-list").first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await expect(page.locator(".conv-title", { hasText: "冷点那段" })).toHaveCount(0)
})
