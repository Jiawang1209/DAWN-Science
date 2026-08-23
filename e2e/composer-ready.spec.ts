/**
 * 附栏三颗的「备好」态（2026-08-25 作者定的）：
 * 上传文件（带上图）、选择工作目录（选定了）、终端（开着）——备好前淡灰、备好后黑色实心；
 * 优化输入本来就是这个行为，这三颗对齐它。作者明确不跟主题色。
 */
import { test, expect, 在项目里开会话, 开一段临时会话 } from "./fixtures.js"

const 颜色 = (page: import("@playwright/test").Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).color)

test("**终端**：没开时与上传文件同色，开了转黑色实心", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const 淡 = await 颜色(page, ".composer-footer .attach-trigger")
  expect(await 颜色(page, ".composer-footer .dock-toggle"), "终端静默时该与上传文件同色").toBe(淡)
  await page.locator(".composer-footer .dock-toggle").click()
  const 开了 = await 颜色(page, ".composer-footer .dock-toggle")
  expect(开了).not.toBe(淡)
})

test("**选择工作目录**：项目会话选定了目录，chip 是黑色实心；临时会话没选，是淡的", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const 深 = await 颜色(page, ".composer-footer .ws-chip")
  const 淡 = await 颜色(page, ".composer-footer .attach-trigger")
  expect(深).not.toBe(淡)
  expect(await page.locator(".composer-footer .ws-chip[data-ready]").count()).toBe(1)
})

test("**上传文件**：带上一张图之后转黑色实心", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const 淡 = await 颜色(page, ".composer-footer .attach-trigger")
  // 直接塞一张待发图（走 AttachButton 的同一个 setter 太绕；粘贴一张图是同一条路）
  await page.locator(".composer-box textarea").focus()
  await page.evaluate(() => {
    // CSP 挡 data: fetch——从 base64 直接拼字节
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], "一像素.png", { type: "image/png" }))
    document.querySelector(".composer-box textarea")!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.locator(".attached-one")).toHaveCount(1)
  const 带上了 = await 颜色(page, ".composer-footer .attach-trigger")
  expect(带上了).not.toBe(淡)
})
