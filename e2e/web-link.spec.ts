/**
 * **消息里的链接 → 右侧坞里渲染**（批 2，2026-08-18）。
 *
 * 作者要的那条动线的完整形状：模型回答里出现一个本机地址，点一下，
 * 页面在右边渲染出来；旁边那张卡还给一个「打开方式 ▾」。
 *
 * 判据同样走 `app.evaluate`——那个 `WebContentsView` 在 DOM 里不存在。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { createServer, type Server } from "node:http"

let 服务: Server
let 地址: string

test.beforeAll(async () => {
  服务 = createServer((_q, s) => {
    s.setHeader("content-type", "text/html; charset=utf-8")
    s.end("<!doctype html><meta charset=utf-8><title>本机页</title><h1>DAWN_网页预览_物证</h1>")
  })
  await new Promise<void>((ok) => 服务.listen(58232, "127.0.0.1", () => ok()))
  地址 = "http://127.0.0.1:58232/"
})
test.afterAll(() => 服务.close())

async function 视图标题(app: import("@playwright/test").ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/dist/ui/"))
    const k = w?.contentView.children.find(
      (c) => (c as unknown as { webContents?: unknown }).webContents !== undefined,
    ) as unknown as { webContents: { getTitle(): string } } | undefined
    return k?.webContents.getTitle()
  })
}

test.describe("本机链接", () => {
  test.use({
    dawnOptions: {
      toolCall: {
        toolName: "bash",
        args: { command: "echo hi" },
        say: "服务起好了，去看 [本机页面](http://127.0.0.1:58232/) 吧。",
      },
    },
  })

  test("**点消息里的本机链接，右边就渲染出来**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("起个服务")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 链 = page.locator("a[href^='http://127.0.0.1']").first()
    await expect(链).toBeVisible({ timeout: 30_000 })
    await 链.click()

    // 坞自己开了，并且停在「网页」那一格
    await expect(page.getByRole("button", { name: /^面板：网页/ })).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => 视图标题(app), { timeout: 30_000 }).toBe("本机页")
  })

  test("**那张卡在，「打开方式」两个去处都在**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("起个服务")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 卡 = page.locator(".weblink-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    // **卡上要摆出要开的是哪儿**——只写「网站」的话人不知道它要去哪
    await expect(卡).toContainText("127.0.0.1:58232")

    await 卡.getByRole("button", { name: "打开方式", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: "在这儿打开", exact: true })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "用系统浏览器打开", exact: true })).toBeVisible()

    await page.getByRole("menuitem", { name: "在这儿打开", exact: true }).click()
    await expect.poll(() => 视图标题(app), { timeout: 30_000 }).toBe("本机页")
  })
})

test.describe("外网链接", () => {
  test.use({
    dawnOptions: {
      toolCall: {
        toolName: "bash",
        args: { command: "echo hi" },
        say: "详见 [文档](https://example.com/doc)。",
      },
    },
  })

  /**
   * **批 3 起外网也给那张卡**（那一格开得了任意网站了）。
   *
   * 这一条**替换了批 2 那条「外网不给那张卡」**——不是删掉判据，
   * 是行为按作者定的分期变了。只给本机的话，外网就只剩地址栏一条路进得去。
   */
  test("**外网也给那张卡**，卡上摆着要开的那个地址", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("给我文档")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 卡 = page.locator(".weblink-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    await expect(卡).toContainText("example.com/doc")
  })

  /**
   * **而直接点链接的去处没变**：外网仍然交给系统浏览器。
   *
   * 那是长年的默认，改它是另一个决定。要在坞里开外网，走卡上的「在这儿打开」。
   * 判据：点完之后**没有起一个 web contents**，也**没有多出 Electron 窗口**
   * （后者是批 0 那条守卫）。
   */
  test("**直接点外网链接，仍然去系统浏览器**，不在坞里开", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("给我文档")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    const 链 = page.locator("a[href^='https://example.com']").first()
    await expect(链).toBeVisible({ timeout: 30_000 })

    const 窗口数 = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    const 前 = await 窗口数()
    await 链.click()
    await page.waitForTimeout(2000)

    expect(await 视图标题(app), "外网链接把网页那一格起起来了").toBeUndefined()
    expect(await 窗口数(), "点一个外链之后多出了 Electron 窗口").toBe(前)
  })
})
