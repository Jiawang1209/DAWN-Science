import { test, expect, 在项目里开会话, 进坞, 进设置 } from "./fixtures.js"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

test("文件菜单在右边缘完整显示，窄坞与暗色英文都不裁切", async ({ dawn }, testInfo) => {
  const { page, app, workspace } = dawn
  writeFileSync(join(workspace, "menu.py"), "print(1)\n")
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 700))
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const dock = page.locator(".right-dock")
  for (const width of [480, 280]) {
    await page.locator(".body").evaluate((el, w) => el.style.setProperty("--dawn-dock-w", `${w}px`), width)
    await expect.poll(() => dock.evaluate(el => el.getBoundingClientRect().width)).toBe(width)
    await dock.getByRole("button", { name: "文件操作：menu.py", exact: true }).click()
    const menu = page.getByRole("menu", { name: "文件操作：menu.py", exact: true })
    await expect(menu).toBeVisible()
    await expect.poll(async () => {
      const b = (await menu.boundingBox())!
      return b.x >= 8 && b.x + b.width <= (await page.evaluate(() => innerWidth)) - 7
    }).toBe(true)
    for (const item of await menu.getByRole("menuitem").all()) await expect(item).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`) })
    await page.locator(".menu-scrim").click({ position: { x: 20, y: 80 } })
  }
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("radio", { name: "English", exact: true }).click()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await dock.locator(".row-more").last().click()
  const menu = page.locator(".tree-row-menu")
  for (const item of await menu.getByRole("menuitem").all()) await expect(item).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath("menu-dark-english.png") })
})
