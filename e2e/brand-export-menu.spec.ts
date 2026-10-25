import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("DAWN Science与折叠、快捷键按钮始终单行，展开侧栏加宽并对齐", async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page, "校正500米8月数据偏差")
  const check = async () => {
    const name = page.locator(".topbar .brand > span")
    await expect(name).toBeVisible()
    await expect(name).toHaveText("DAWN Science")
    expect(await name.evaluate(el => getComputedStyle(el).whiteSpace)).toBe("nowrap")
    const nameBox = (await name.boundingBox())!
    expect(nameBox.height).toBeLessThan(32)
    await expect.poll(async () => {
      const collapsed = await page.locator(".app-shell").getAttribute("data-sidebar-collapsed")
      if (collapsed === "true") return 0
      const nav = (await page.locator(".topbar-navigation").boundingBox())!
      const side = (await page.locator(".sidebar").boundingBox())!
      return Math.abs(nav.x + nav.width - side.x - side.width)
    }).toBeLessThanOrEqual(1)
    expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const nav = (await page.locator(".topbar-navigation").boundingBox())!
    for (const selector of [".brand", ".side-toggle", ".shortcut-toggle"]) {
      const box = (await page.locator(`.topbar ${selector}`).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(nav.x)
      expect(box.x + box.width).toBeLessThanOrEqual(nav.x + nav.width + 1)
      expect(Math.abs(box.y + box.height / 2 - nameBox.y - nameBox.height / 2)).toBeLessThanOrEqual(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await check()
  await page.screenshot({ animations: "disabled", path: info.outputPath("brand-default.png") })
  const sash = page.getByRole("separator", { name: "调整侧栏宽度", exact: true })
  await sash.focus()
  for (let i = 0; i < 4; i++) await sash.press("ArrowLeft")
  await check()
  await page.screenshot({ animations: "disabled", path: info.outputPath("brand-minimum.png") })
  await sash.focus()
  for (let i = 0; i < 14; i++) await sash.press("ArrowRight")
  await check()
  await page.locator(".side-toggle").click()
  await page.setViewportSize({ width: 900, height: 800 })
  await check()
})

test("查找与导出直接显示，键盘可选且真实保存完整对话", async ({ dawn }, info) => {
  const { page, dir } = dawn
  await 开一段临时会话(page, "校正500米8月数据偏差")
  await expect(page.locator(".topbar .conv-export")).toHaveCount(0)
  await expect(page.locator("main.main .conv-actions-trigger")).toHaveCount(0)
  const find = page.locator("main.main").getByRole("button", { name: "查找当前对话", exact: true })
  const download = page.locator("main.main").getByRole("button", { name: "导出对话", exact: true })
  await expect(find).toBeVisible()
  await expect(download).toBeVisible()
  await find.focus()
  await page.keyboard.press("Tab")
  await expect(download).toBeFocused()
  await page.screenshot({ animations: "disabled", path: info.outputPath("export-actions.png") })
  await download.press("Enter")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(download).toBeVisible()
  const note = page.locator(".export-toast")
  await expect(note).toContainText("已导出", { timeout: 10000 })
  const text = await note.innerText()
  const file = text.match(/到 (.+\.md)/)?.[1]
  expect(file).toBeTruthy()
  expect(existsSync(file!)).toBe(true)
  expect(file!.startsWith(join(dir, "downloads"))).toBe(true)
  expect(readFileSync(file!, "utf8")).toContain("校正500米8月数据偏差")
})
