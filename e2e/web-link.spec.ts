/**
 * **消息里的链接 → 右侧坞里渲染**（批 2，2026-08-18）。
 *
 * 作者要的那条动线的完整形状：模型回答里出现一个本机地址，点一下，
 * 页面在右边渲染出来；旁边那张卡还给一个「打开方式 ▾」。
 *
 * 判据同样走 `app.evaluate`——那个 `WebContentsView` 在 DOM 里不存在。
 */
import { test as 基, expect, 开一段临时会话 } from "./fixtures.js"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

/**
 * **端口让内核挑，不写死**（2026-09-20）。
 *
 * 原先钉在 58232。macOS 的临时端口范围从 49152 起，这个号随时可能已经归别人——
 * 09-18 那次全套 e2e 里它就是红的那条，`lsof` 查出来是一条长期存活的 `xray` 连接占着同一个
 * socket（四十分钟没变）。**判据随机红，等于把人训练成条件反射去 update**，所以它得走。
 *
 * `listen(0)` 之后号才知道，而 mock 要说的那句话里带着它，因此 `dawnOptions` 从
 * `test.use` 的静态值改成一个依赖本机服务的 fixture——顺序上先起服务、再拿号拼话、最后才起应用。
 */
const test = 基.extend<{ 本机服务: string }>({
  本机服务: async ({}, use) => {
    const 服务: Server = createServer((_q, s) => {
      s.setHeader("content-type", "text/html; charset=utf-8")
      s.end("<!doctype html><meta charset=utf-8><title>本机页</title><h1>DAWN_网页预览_物证</h1>")
    })
    await new Promise<void>((ok) => 服务.listen(0, "127.0.0.1", () => ok()))
    const { port } = 服务.address() as AddressInfo
    await use(`127.0.0.1:${port}`)
    await new Promise<void>((ok) => 服务.close(() => ok()))
  },
  dawnOptions: async ({ 本机服务 }, use) => {
    await use({
      toolCall: {
        toolName: "bash",
        args: { command: "echo hi" },
        say: `服务起好了，去看 [本机页面](http://${本机服务}/) 吧。`,
      },
    })
  },
})

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

  test("**那张卡在，「打开方式」两个去处都在**", async ({ dawn, 本机服务 }) => {
    const { app, page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("起个服务")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const 卡 = page.locator(".weblink-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    // **卡上要摆出要开的是哪儿**——只写「网站」的话人不知道它要去哪
    await expect(卡).toContainText(本机服务)

    await 卡.getByRole("button", { name: "打开方式", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: "在这儿打开", exact: true })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "用系统浏览器打开", exact: true })).toBeVisible()

    await page.getByRole("menuitem", { name: "在这儿打开", exact: true }).click()
    await expect.poll(() => 视图标题(app), { timeout: 30_000 }).toBe("本机页")
  })
})
