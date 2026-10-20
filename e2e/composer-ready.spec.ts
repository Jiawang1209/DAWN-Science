/** 输入卡的备好态：附件与目录保留标记；终端与方案在添加菜单内显示当前状态。 */
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 开一段临时会话 } from "./fixtures.js"

const 颜色 = (page: import("@playwright/test").Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).color)

async function 添加菜单(page: import("@playwright/test").Page) {
  await page.locator(".composer-footer .attach-trigger").click()
  const menu = page.getByRole("menu", { name: "添加内容" })
  await expect(menu).toBeVisible()
  return menu
}

test("**终端**：菜单标记反映开闭，点同一入口能打开和收起", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const menu = await 添加菜单(page)
  const terminal = menu.getByRole("menuitem", { name: "终端面板", exact: true })
  // 关闭时只有终端图标；打开后加上勾选图标。
  await expect(terminal.locator("svg")).toHaveCount(1)
  await terminal.click()
  await expect(page.locator(".dock")).toBeVisible()
  await 添加菜单(page)
  await expect(terminal.locator("svg")).toHaveCount(2)
  await terminal.click()
  await expect(page.locator(".dock")).toHaveCount(0)
  await 添加菜单(page)
  await expect(terminal.locator("svg")).toHaveCount(1)
})

test("**生成方案**：菜单选中态与方案说明一起开关，选中背景遵循主题", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const menu = await 添加菜单(page)
  const toggle = menu.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await page.mouse.move(0, 0)
  const idleBackground = await toggle.evaluate(el => getComputedStyle(el).backgroundColor)
  await toggle.click()
  await expect(page.locator(".plan-band")).toBeVisible()
  await 添加菜单(page)
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await page.mouse.move(0, 0)
  const selectedBackground = await toggle.evaluate(el => {
    const probe = document.createElement("span")
    probe.style.backgroundColor = "var(--dawn-accent-soft)"
    el.append(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    return expected
  })
  await expect(toggle).toHaveCSS("background-color", selectedBackground)
  expect(selectedBackground).not.toBe(idleBackground)
  await toggle.click()
  await expect(page.locator(".plan-band")).toHaveCount(0)
  await 添加菜单(page)
  await expect(toggle).toHaveAttribute("aria-checked", "false")
})

test("**选择工作目录**：项目会话在顶部环境行标明已选目录", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await expect(page.locator(".composer-environment .ws-chip")).toBeVisible()
  await expect(page.locator(".composer-environment .composer-location")).toHaveText("本机")
  expect(await page.locator(".composer-environment .ws-chip[data-ready]").count()).toBe(1)
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
  await page.mouse.move(0, 0)
  await expect(page.locator(".composer-footer .attach[data-ready]")).toHaveCount(1)
  const 带上了 = await 颜色(page, ".composer-footer .attach-trigger")
  expect(带上了).not.toBe(淡)
})

test.describe("走「上传文件」插路径也算带上了", () => {
  const 目录 = mkdtempSync(join(tmpdir(), "dawn-ready-"))
  const 甲 = join(目录, "数据.csv")
  writeFileSync(甲, "a,b\n1,2\n")
  test.use({ dawnOptions: { pickFiles: [甲] } })
  test("**上传文件（非图片）之后按钮转黑**，发送后回到淡的", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    const 色 = () => page.locator(".composer-footer .attach-trigger").evaluate((el) => getComputedStyle(el).color)
    const 淡 = await 色()
    await page.locator(".composer-footer .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传文件", exact: true }).click()
    await expect(page.locator(".composer-box textarea")).toHaveValue(/数据\.csv/)
    await page.mouse.move(0, 0)
    await expect(page.locator(".composer-footer .attach[data-ready]")).toHaveCount(1)
    expect(await 色(), "插了文件路径按钮没有显示备好态").not.toBe(淡)
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    await page.mouse.move(0, 0)
    await expect(page.locator(".composer-footer .attach[data-ready]")).toHaveCount(0)
    expect(await 色(), "发送后没有恢复未附加状态").toBe(淡)
  })
})
