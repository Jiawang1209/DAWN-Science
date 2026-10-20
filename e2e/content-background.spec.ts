import { mkdirSync } from "node:fs"
import { test, expect, 进设置, 在项目里开会话, 进坞, CANNED_REPLY } from "./fixtures.js"
import type { Page } from "@playwright/test"

const shots = "tmp/content-background"
const color = (page: Page, selector: string) => page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor)
async function setColor(page: Page, name: string, value: string) {
  const input = page.getByRole("textbox", { name, exact: true })
  await input.fill(value)
  await input.press("Enter")
  return input
}

test("欢迎与消息内容底色独立保存，输入卡不变，设置页可单独改色与恢复", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  const original = { main: await color(page, "main.main"), input: await color(page, ".composer-box"), footer: await color(page, ".composer-footer") }
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "背景色：蓝", exact: true }).click()
  const shell = await color(page, ".sidebar")
  await setColor(page, "对话内容颜色值，可输入 HEX 或 RGB", "#e7dcf5")
  const settingsOriginal = await color(page, "main.main")
  expect(settingsOriginal).toBe(original.main)
  await setColor(page, "设置页颜色值，可输入 HEX 或 RGB", "#f1ebe0")
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(241, 235, 224)")
  expect(await color(page, ".set-rows")).not.toBe(settingsOriginal)
  expect(await color(page, ".sidebar")).toBe(shell)
  await page.screenshot({ path: `${shots}/appearance.png`, animations: "disabled", scale: "css" })
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  expect(await color(page, ".composer-box")).toBe(original.input)
  expect(await color(page, ".composer-footer")).toBe(original.footer)
  await page.screenshot({ path: `${shots}/welcome.png`, animations: "disabled", scale: "css" })
  await 在项目里开会话(page)
  await expect(page.locator(".session-tabs-topbar")).toHaveCSS("background-color", shell)
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  expect(await color(page, ".composer-box")).toBe(original.input)
  await page.reload()
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await 进设置(page, "外观")
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(241, 235, 224)")
  await expect(page.getByRole("textbox", { name: "对话内容颜色值，可输入 HEX 或 RGB", exact: true })).toHaveValue("#e7dcf5")
  await page.getByRole("button", { name: "重置设置页", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", settingsOriginal)
  await expect(page.getByRole("textbox", { name: "对话内容颜色值，可输入 HEX 或 RGB", exact: true })).toHaveValue("#e7dcf5")
  await page.getByRole("button", { name: "重置对话内容", exact: true }).click()
  expect(await color(page, ".sidebar")).toBe(shell)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", original.main)
})

test("内容背景跟随明暗及系统主题，输入工作面仍沿用原主题", async ({ dawn }) => {
  const { page } = dawn
  const lightInput = await color(page, ".composer-box")
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  const darkInput = await color(page, ".composer-box")
  await 进设置(page, "外观")
  await setColor(page, "对话内容颜色值，可输入 HEX 或 RGB", "#e7dcf5")
  await setColor(page, "设置页颜色值，可输入 HEX 或 RGB", "#f1ebe0")
  const darkSettings = await color(page, "main.main")
  await page.getByRole("button", { name: "返回", exact: true }).click()
  const darkChat = await color(page, "main.main")
  expect(await color(page, ".composer-box")).toBe(darkInput)
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "亮色", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(241, 235, 224)")
  await page.emulateMedia({ colorScheme: "dark" })
  await page.getByRole("radio", { name: "跟随系统", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", darkSettings)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page.locator("main.main")).toHaveCSS("background-color", darkChat)
  expect(await color(page, ".composer-box")).toBe(darkInput)
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("main.main")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  expect(await color(page, ".composer-box")).toBe(lightInput)
})

test("新增两项保持RGB、错误纠正、复制与色盘交互，收回时色值仍紧凑", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "外观")
  for (const name of ["对话内容", "设置页"]) {
    const input = await setColor(page, `${name}颜色值，可输入 HEX 或 RGB`, "231, 220, 245")
    await expect(input).toHaveValue("#e7dcf5")
    await input.fill("invalid")
    await input.press("Enter")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await input.press("Escape")
    await expect(input).toHaveValue("#e7dcf5")
    await page.getByRole("button", { name: `复制${name}颜色值`, exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("#e7dcf5")
    await page.getByRole("button", { name: `${name}色盘`, exact: true }).click()
    const panel = page.getByRole("dialog", { name: "色盘", exact: true })
    const sv = (await panel.locator(".cpanel-sv").boundingBox())!
    await page.mouse.click(sv.x + sv.width / 2, sv.y + sv.height / 2)
    await expect(input).not.toHaveValue("#e7dcf5")
    await page.keyboard.press("Escape")
    expect((await input.boundingBox())!.width).toBeCloseTo(108, 0)
  }
  await page.getByRole("button", { name: "收回", exact: true }).click()
  for (const name of ["对话内容", "设置页"]) {
    const input = page.getByRole("textbox", { name: `${name}颜色值，可输入 HEX 或 RGB`, exact: true })
    // 收回包含宽度过渡；等实际布局稳定后再量测，不读取中间帧。
    await expect.poll(async () => (await input.boundingBox())!.width).toBeCloseTo(108, 0)
  }
})


test("已有消息和侧边对话沿用内容底色，发送和输入卡不受影响", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "外观")
  await setColor(page, "对话内容颜色值，可输入 HEX 或 RGB", "#e7dcf5")
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await 在项目里开会话(page)
  const main = page.locator("main.main")
  await main.getByPlaceholder(/输入问题/).fill("你好")
  await main.getByRole("button", { name: "发送", exact: true }).click()
  await expect(main.locator(".turns")).toContainText(CANNED_REPLY)
  await expect(main).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await expect(main.locator(".composer-box")).toHaveCSS("background-color", "rgb(255, 255, 255)")
  await 进坞(page, "对话")
  const side = page.locator("aside.right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  await expect(side.locator(".side-chat")).toHaveCSS("background-color", "rgb(231, 220, 245)")
  await expect(side.locator(".composer-box")).toHaveCSS("background-color", "rgb(255, 255, 255)")
})
