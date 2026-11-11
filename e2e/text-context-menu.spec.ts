import type { ElectronApplication } from "@playwright/test"
import type { Menu } from "electron"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

type MenuState = { textMenu?: Menu; popupCount: number; clipboardBuffers: [string, Buffer][] }

async function captureMenus(app: ElectronApplication) {
  await app.evaluate(({ Menu, clipboard }) => {
    const state: MenuState = {
      popupCount: 0,
      clipboardBuffers: clipboard.availableFormats().map(format => [format, clipboard.readBuffer(format)]),
    }
    Object.assign(globalThis, { textMenuState: state })
    clipboard.writeText("右键粘贴测试")
    // Inspect real native menus without showing an OS popup over the user's desktop.
    Menu.prototype.popup = function () { state.textMenu = this; state.popupCount++ }
  })
}

async function items(app: ElectronApplication) {
  return app.evaluate(() => {
    const { textMenu } = (globalThis as unknown as { textMenuState: MenuState }).textMenuState
    return textMenu?.items.filter(item => item.type !== "separator").map(item => ({ role: item.role, enabled: item.enabled })) ?? []
  })
}

async function clickRole(app: ElectronApplication, role: string) {
  await app.evaluate(({ BrowserWindow }, wanted) => {
    const { textMenu } = (globalThis as unknown as { textMenuState: MenuState }).textMenuState
    const item = textMenu?.items.find(item => item.role?.toLowerCase() === wanted.toLowerCase())
    if (!item?.enabled) throw new Error(`Native menu action unavailable: ${wanted}`)
    const win = BrowserWindow.getAllWindows()[0]!
    // macOS dispatches edit roles in its native menu, bypassing MenuItem.click.
    // Hidden tests verify the role and its Chromium edit command separately.
    if (process.platform === "darwin") {
      const wc = win.webContents
      switch (item.role?.toLowerCase()) {
        case "copy": wc.copy(); break
        case "cut": wc.cut(); break
        case "paste": wc.paste(); break
        case "undo": wc.undo(); break
        case "redo": wc.redo(); break
        case "delete": wc.delete(); break
        case "selectall": wc.selectAll(); break
        default: throw new Error(`Unverified native role: ${item.role}`)
      }
    } else item.click({}, win, win.webContents)
  }, role)
}

test("选中文字右键出现原生编辑菜单，复制剪切粘贴与撤销同步草稿", async ({ dawn: { page, app } }) => {
  await 在项目里开会话(page)
  await captureMenus(app)
  try {
    await 进坞(page, "对话")
    const side = page.locator("aside.right-dock")
    await side.getByRole("button", { name: "另开一段", exact: true }).click()
    for (const area of [page.locator("main.main"), side]) {
      const input = area.locator("textarea.composer-field")
      await input.fill("复制这一段文本")
      await input.selectText()
      await input.click({ button: "right" })
      await expect.poll(() => items(app), { timeout: 3000 }).toEqual([
        { role: "undo", enabled: true }, { role: "redo", enabled: false },
        { role: "cut", enabled: true }, { role: "copy", enabled: true },
        { role: "paste", enabled: true }, { role: "delete", enabled: true },
        { role: "selectall", enabled: true },
      ])
      await clickRole(app, "copy")
      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("复制这一段文本")
      await clickRole(app, "cut")
      await expect(input).toHaveValue("")
      await input.click({ button: "right" })
      expect((await items(app)).find(item => item.role === "copy")?.enabled).toBe(false)
      await clickRole(app, "paste")
      await expect(input).toHaveValue("复制这一段文本")
      await input.click({ button: "right" })
      await clickRole(app, "undo")
      await expect(input).toHaveValue("")
      await input.click({ button: "right" })
      await clickRole(app, "redo")
      await expect(input).toHaveValue("复制这一段文本")
      await input.click({ button: "right" })
      await clickRole(app, "selectAll")
      expect(await input.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe("复制这一段文本")
      await input.click({ button: "right" })
      await clickRole(app, "delete")
      await expect(input).toHaveValue("")
      await input.fill("保留在草稿里的文字")
      await input.click({ button: "right" })
      await page.keyboard.press("Escape")
      await expect(input).toHaveValue("保留在草稿里的文字")
      await expect(area.locator(".turn.user")).toHaveCount(0)
      await expect(area.locator(".send-btn")).toBeEnabled()
    }
  } finally {
    await app.evaluate(({ clipboard }) => {
      const state = (globalThis as unknown as { textMenuState: MenuState }).textMenuState
      clipboard.clear()
      for (const [format, data] of state.clipboardBuffers) clipboard.writeBuffer(format, data)
    })
  }
})

test("正文选区右键只能复制，原有会话右键菜单继续可用", async ({ dawn: { page, app } }) => {
  await 在项目里开会话(page)
  const input = page.locator("main.main textarea.composer-field")
  await input.fill("正文右键复制测试")
  await input.press("Enter")
  const text = page.locator(".turn.user .text").last()
  await expect(text).toBeVisible()
  await captureMenus(app)
  try {
    await text.selectText()
    await text.click({ button: "right" })
    await expect.poll(() => items(app), { timeout: 3000 }).toEqual([{ role: "copy", enabled: true }])
    await clickRole(app, "copy")
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("正文右键复制测试")
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.locator(".composer-environment").click({ button: "right" })
    expect(await app.evaluate(() => (globalThis as unknown as { textMenuState: MenuState }).textMenuState.popupCount)).toBe(1)
    await page.locator(".session-tabs .session-tab").first().click({ button: "right" })
    await expect(page.getByRole("menu", { name: /分栏操作/ })).toBeVisible()
    expect(await app.evaluate(() => (globalThis as unknown as { textMenuState: MenuState }).textMenuState.popupCount)).toBe(1)
  } finally {
    await app.evaluate(({ clipboard }) => {
      const state = (globalThis as unknown as { textMenuState: MenuState }).textMenuState
      clipboard.clear()
      for (const [format, data] of state.clipboardBuffers) clipboard.writeBuffer(format, data)
    })
  }
})
