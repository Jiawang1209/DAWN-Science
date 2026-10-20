import { mkdirSync } from "node:fs"
import { test, expect, 进设置 } from "./fixtures.js"

const shots = "tmp/background-color/e2e"
const color = (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor)

test("外层背景与主题色独立，内容工作面不变，重载记住且可恢复默认", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  const original = {
    sidebar: await color(page, ".sidebar"),
    input: await color(page, ".composer-card"),
    footer: await color(page, ".composer-footer"),
  }
  await 进设置(page, "外观")
  const content = await color(page, "main.main")
  const accent = page.getByRole("textbox", { name: "颜色值，可输入 HEX 或 RGB", exact: true })
  const accentValue = await accent.inputValue()
  await page.getByRole("radio", { name: "背景色：蓝", exact: true }).click()
  expect(await color(page, ".sidebar")).not.toBe(original.sidebar)
  await expect(accent).toHaveValue(accentValue)
  expect(await color(page, "main.main")).toBe(content)
  await page.getByRole("radio", { name: "紫", exact: true }).click()
  const input = page.getByRole("textbox", { name: "背景颜色值，可输入 HEX 或 RGB", exact: true })
  await input.fill("#e7dcf5")
  await input.press("Enter")
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await expect(page.locator(".topbar")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await expect(accent).toHaveValue("#7c5cff")
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${shots}/appearance-light.png`, animations: "disabled", scale: "css" })
  await page.getByRole("button", { name: "返回", exact: true }).click()
  expect(await color(page, ".composer-card")).toBe(original.input)
  expect(await color(page, ".composer-footer")).toBe(original.footer)
  await page.screenshot({ path: `${shots}/composer-preserved.png`, animations: "disabled", scale: "css" })
  await page.reload()
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await 进设置(page, "外观")
  await expect(input).toHaveValue("#e7dcf5")
  await page.getByRole("button", { name: "重置背景", exact: true }).click()
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", original.sidebar)
  expect(await page.evaluate(() => localStorage.getItem("dawn.global.background"))).toBeNull()
  await expect(accent).toHaveValue("#7c5cff")
  await page.reload()
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", original.sidebar)
})

test("同一背景色适配明暗与系统主题，原内容颜色跟随主题而非自选背景", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  const content = await color(page, "main.main")
  const originalDark = await color(page, ".sidebar")
  await page.getByRole("radio", { name: "背景色：蓝", exact: true }).click()
  const dark = await color(page, ".sidebar")
  expect(dark).not.toBe(originalDark)
  expect(await color(page, "main.main")).toBe(content)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${shots}/appearance-dark.png`, animations: "disabled", scale: "css" })
  await page.getByRole("radio", { name: "亮色", exact: true }).click()
  const light = await color(page, ".sidebar")
  expect(light).not.toBe(dark)
  await page.emulateMedia({ colorScheme: "dark" })
  await page.getByRole("radio", { name: "跟随系统", exact: true }).click()
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", dark)
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", light)
})

test("背景颜色值支持RGB、错误纠正、复制及独立色盘与吸管", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "外观")
  const input = page.getByRole("textbox", { name: "背景颜色值，可输入 HEX 或 RGB", exact: true })
  const accent = page.getByRole("textbox", { name: "颜色值，可输入 HEX 或 RGB", exact: true })
  const originalAccent = await accent.inputValue()
  await input.fill("231, 220, 245")
  await input.press("Enter")
  await expect(input).toHaveValue("#e7dcf5")
  await input.fill("bad-color")
  await input.press("Enter")
  await expect(input).toHaveAttribute("aria-invalid", "true")
  await input.press("Escape")
  await expect(input).toHaveValue("#e7dcf5")
  await page.getByRole("button", { name: "复制背景颜色值", exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("#e7dcf5")
  await page.getByRole("button", { name: "背景色色盘", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "色盘", exact: true })
  const sv = (await panel.locator(".cpanel-sv").boundingBox())!
  await page.mouse.click(sv.x + sv.width / 2, sv.y + sv.height / 2)
  await expect(input).not.toHaveValue("#e7dcf5")
  await expect(accent).toHaveValue(originalAccent)
  await panel.getByRole("button", { name: "屏幕取色", exact: true }).click()
  const dropper = page.getByRole("dialog", { name: "取色器", exact: true })
  await expect(dropper.locator(".dropper-start")).toContainText("移动鼠标取色")
  const swatch = (await page.getByRole("radio", { name: "背景色：粉", exact: true }).boundingBox())!
  const x = Math.round(swatch.x + swatch.width / 2), y = Math.round(swatch.y + swatch.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
  await expect(dropper).toHaveCount(0)
  await expect(input).toHaveValue("#d6336c")
  await expect(accent).toHaveValue(originalAccent)
})
