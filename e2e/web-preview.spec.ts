/**
 * 网页预览那一格（批 1，2026-08-18）。
 *
 * ## 这一条为什么长得跟别的 e2e 都不一样
 *
 * 真正的网页是主进程里一个 `WebContentsView`，它**浮在整个 DOM 之上**。
 * spike 实测：**窗口自己的 `capturePage()` 截不到它**（那一栏是空白）。
 * 于是 Playwright 的 `page.locator(...)` **一个都命不中**，
 * 十张视觉基线也看不见它。
 *
 * **所以判据一律走 `app.evaluate` 进主进程去问那个 view。**
 * 拿 DOM 断言凑数的话，这一整块会「绿得毫无意义」——
 * 而那正是这个项目栽过三次的形状。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { createServer, type Server } from "node:http"

/** 进坞里的「网页」那一格 */
async function 进网页(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /^(打开面板|面板：)/ }).click()
  await page.getByRole("menuitemradio", { name: /网页/ }).click()
}

/** 主进程里那个 view 现在什么样。**没有就返回 undefined**——「还没建」是一个答案 */
async function 视图(app: import("@playwright/test").ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/dist/ui/"))
    const kid = w?.contentView.children.find(
      (c) => (c as unknown as { webContents?: unknown }).webContents !== undefined,
    ) as unknown as
      | { webContents: { getURL(): string; getTitle(): string }; getBounds(): { x: number; y: number; width: number; height: number }; getVisible(): boolean }
      | undefined
    if (!kid) return undefined
    return { url: kid.webContents.getURL(), title: kid.webContents.getTitle(), bounds: kid.getBounds(), visible: kid.getVisible() }
  })
}

let 服务: Server
let 地址: string

test.beforeAll(async () => {
  服务 = createServer((_q, s) => {
    s.setHeader("content-type", "text/html; charset=utf-8")
    s.end("<!doctype html><meta charset=utf-8><title>本机页</title><h1>DAWN_网页预览_物证</h1>")
  })
  await new Promise<void>((ok) => 服务.listen(0, "127.0.0.1", () => ok()))
  地址 = `127.0.0.1:${(服务.address() as { port: number }).port}`
})
test.afterAll(() => 服务.close())

test("**地址栏输一个本机地址，那个页面真的加载了**", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)

  // 还没开任何东西时**不该已经起了一个 web contents**（懒建）
  expect(await 视图(app), "没人开过网页，却已经起了一个视图").toBeUndefined()

  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")
  const v = await 视图(app)
  expect(v!.url).toContain(地址)
  expect(v!.visible, "加载完了却是藏着的").toBe(true)
})

test("**它的位置跟着坞走** —— 拖宽之后那块网页也得跟着宽", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  const 窄 = (await 视图(app))!.bounds.width
  // 坞的宽度是持久化的状态，直接改它比拖那条缝稳
  await page.evaluate(() => localStorage.setItem("dawn.global.right-dock-width", "620"))
  await page.reload()
  await 进网页(page)
  await expect.poll(async () => (await 视图(app))?.bounds.width ?? 0, { timeout: 30_000 }).toBeGreaterThan(窄 + 100)
})

test("**有浮层挡着就藏起来** —— 它的 z-index 对命令面板无效", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 30_000 }).toBe(true)

  /**
   * 命令面板是 HTML，而那个 view 浮在所有 HTML 之上——**不藏的话，
   * 人按下 ⌘K 会看到面板被一块网页盖掉一半**。
   */
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(false)

  await page.keyboard.press("Escape")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(true)
})

test("**外网被拦下，而且屏幕上说得出为什么**", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await page.getByRole("textbox", { name: "网址" }).fill("https://example.com/")
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  // **点名说是哪个主机**，不是笼统一句「不允许」
  await expect(page.getByText(/example\.com 不是本机/)).toBeVisible({ timeout: 15_000 })
  // 而且**真的没去**——只看屏幕上那句话的话，导航过去了也一样绿
  expect((await 视图(app))!.url, "嘴上拦了，实际还是导航过去了").toContain(地址)
})

test("**切到别的房客要藏起来，切回来还是那一页**（没被销毁）", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await page.getByRole("button", { name: /^面板：/ }).click()
  await page.getByRole("menuitemradio", { name: /审阅/ }).click()
  // **不藏的话它会继续盖在「审阅」上面**，那看起来就像审阅那一格坏了
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(false)

  await page.getByRole("button", { name: /^面板：/ }).click()
  await page.getByRole("menuitemradio", { name: /网页/ }).click()
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(true)
  // 还是那一页——**切走不该把它销毁**，不然回来是一片空白
  expect((await 视图(app))!.title).toBe("本机页")
})
