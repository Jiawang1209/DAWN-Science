import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import { test, expect, 在项目里开会话, 进坞, 进设置 } from "./fixtures.js"

// 自制图表 PNG，验证真实图片解码；不依赖远程素材。
const png = (() => {
  const width = 320, height = 200
  const raw = Buffer.alloc((width * 3 + 1) * height, 255)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const axis = (x === 30 && y > 20 && y < 175) || (y === 175 && x >= 30 && x < 300)
      const line = x >= 35 && x < 290 && Math.abs(y - (170 - (x - 30) * .45)) < 2
      if (axis || line) Buffer.from(line ? [33, 140, 122] : [85, 90, 94]).copy(raw, y * (width * 3 + 1) + 1 + x * 3)
    }
  }
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data])
    let crc = 0xffffffff
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1 }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4)
    length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64")
})()
const script = "# retained source\nvalue = 1\nprint(value)\n"

test("文件里的图片和脚本可收起，目录与分栏保留，同文件可重开", async ({ dawn }, testInfo) => {
  const { page, app, workspace } = dawn
  mkdirSync(join(workspace, "analysis"), { recursive: true })
  writeFileSync(join(workspace, "analysis/analysis.py"), script)
  writeFileSync(join(workspace, "analysis/figure.png"), Buffer.from(png, "base64"))
  for (let i = 0; i < 80; i++) writeFileSync(join(workspace, `analysis/note-${String(i).padStart(2, "0")}.txt`), "note")
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const dock = page.locator(".right-dock")
  await dock.getByRole("button", { name: /^analysis$/ }).click()
  const scriptRow = dock.getByRole("button", { name: /^analysis\.py/ })
  await scriptRow.click()
  const pre = dock.locator(".preview-code")
  await expect(pre).toHaveAttribute("data-highlighted", "true")
  const close = dock.getByRole("button", { name: "收起预览", exact: true })
  await expect(close).toBeVisible({ timeout: 3000 })
  expect(await close.evaluate(el => el.textContent?.trim())).toBe("")
  await expect(dock.locator(".preview-head .sub")).toHaveCount(0)
  const originalDockWidth = await page.locator(".body").evaluate(el => el.style.getPropertyValue("--dawn-dock-w"))
  const originalDockSize = await dock.evaluate(el => el.getBoundingClientRect().width)
  // 收起属于标题行，不能随下面的操作按钮折到左侧另起一行。
  for (const width of [480, 280]) {
    await page.locator(".body").evaluate((el, w) => el.style.setProperty("--dawn-dock-w", `${w}px`), width)
    await expect.poll(() => dock.evaluate(el => el.getBoundingClientRect().width)).toBe(width)
    const nameBounds = (await dock.locator(".preview-head .name").boundingBox())!
    const closeBounds = (await close.boundingBox())!
    const headBounds = (await dock.locator(".preview-head").boundingBox())!
    expect(Math.abs(closeBounds.y + closeBounds.height / 2 - nameBounds.y - nameBounds.height / 2)).toBeLessThanOrEqual(1)

    expect(closeBounds.x).toBeGreaterThanOrEqual(nameBounds.x + nameBounds.width)
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(headBounds.x + headBounds.width + 1)
    for (const action of await dock.locator(".preview-head button").all()) {
      const bounds = (await action.boundingBox())!
      expect(Math.abs(bounds.y + bounds.height / 2 - closeBounds.y - closeBounds.height / 2)).toBeLessThanOrEqual(1)
      expect(bounds.x).toBeGreaterThanOrEqual(headBounds.x)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(headBounds.x + headBounds.width + 1)
    }
    await dock.screenshot({ path: testInfo.outputPath(`script-header-${width}-light.png`) })
  }
  await page.locator(".body").evaluate((el, original) => el.style.setProperty("--dawn-dock-w", original), originalDockWidth)
  await expect.poll(() => dock.evaluate(el => el.getBoundingClientRect().width)).toBe(originalDockSize)
  await close.hover()
  await expect(page.getByRole("tooltip")).toContainText("收起预览")
  const tree = dock.locator(".file-tree")
  const handle = await tree.elementHandle()
  const treeHeight = (await tree.boundingBox())!.height
  await tree.evaluate(el => { el.scrollTop = 90 })
  const treeScroll = await tree.evaluate(el => el.scrollTop)
  await close.click()
  await expect(pre).toBeHidden()
  await expect(dock).toBeVisible()
  expect(await tree.evaluate((el, previous) => el === previous, handle)).toBe(true)
  expect(await tree.evaluate(el => el.scrollTop)).toBe(treeScroll)
  expect((await tree.boundingBox())!.height).toBeGreaterThan(treeHeight + 100)
  await expect(scriptRow).toHaveClass(/active/)
  // 收起后继续浏览目录，再打开文件应保留此刻位置，不能跳回关闭前旧值。
  await tree.evaluate(el => { el.scrollTop = 200 })
  await dock.getByRole("button", { name: /^note-05\.txt/ }).click()
  await expect(pre).toContainText("note")
  expect(await tree.evaluate(el => el.scrollTop)).toBe(200)
  await scriptRow.click()
  await expect(pre).toBeVisible()
  expect(await pre.textContent()).toBe(script)
  expect((await tree.boundingBox())!.height).toBeCloseTo(treeHeight, 0)
  expect(await pre.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("0px")
  expect(await dock.locator(".preview-script").evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("1px")
  await tree.evaluate(el => { el.scrollTop = 90 })
  await dock.getByRole("button", { name: "展开阅读", exact: true }).click()
  await expect(tree).toBeHidden()
  await close.focus()
  await page.keyboard.press("Enter")
  await expect(pre).toBeHidden()
  await expect(tree).toBeVisible()
  expect(await tree.evaluate(el => el.scrollTop)).toBe(90)
  expect(await tree.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await scriptRow.click()
  await expect(dock.getByRole("button", { name: "展开阅读", exact: true })).toBeVisible()
  await expect(dock.getByRole("button", { name: "还原", exact: true })).toHaveCount(0)
  await page.mouse.move(0, 0)
  await dock.screenshot({ path: testInfo.outputPath("script-preview-close-light.png") })
  await dock.getByRole("button", { name: /^figure\.png/ }).click()
  const image = dock.locator(".visual-preview .preview-img")
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(320)
  const expand = dock.getByRole("button", { name: "放大预览", exact: true })
  await expand.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(expand).toBeFocused()
  await close.click()
  await expect(image).toBeHidden()
  await expect(dock).toBeVisible()
  await dock.getByRole("button", { name: /^figure\.png/ }).click()
  await expect(image).toBeVisible()
  await dock.getByRole("button", { name: "加宽", exact: true }).click()
  const wideTreeWidth = (await tree.boundingBox())!.width
  await close.click()
  expect((await tree.boundingBox())!.width).toBeGreaterThan(wideTreeWidth + 100)
  await dock.getByRole("button", { name: /^figure\.png/ }).click()
  await expect(image).toBeVisible()
  expect((await tree.boundingBox())!.width).toBeCloseTo(wideTreeWidth, 0)
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("radio", { name: "English", exact: true }).click()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(dock.getByRole("button", { name: "Dismiss preview", exact: true })).toBeVisible()
  await page.mouse.move(0, 0)
  await dock.screenshot({ path: testInfo.outputPath("image-preview-close-dark-english.png") })
  await dock.getByRole("button", { name: "Dismiss preview", exact: true }).click()
  await expect(image).toBeHidden()
  await handle?.dispose()
})

test("目录靠底收起后立即重开，普通和展开阅读都恢复原位置", async ({ dawn }) => {
  const { page, app, workspace } = dawn
  for (let i = 0; i < 30; i++) writeFileSync(join(workspace, `note-${String(i).padStart(2, "0")}.txt`), "note")
  writeFileSync(join(workspace, "z-script.py"), script)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const dock = page.locator(".right-dock")
  const row = dock.getByRole("button", { name: /^z-script\.py/ })
  await row.click()
  const tree = dock.locator(".file-tree")
  for (const expanded of [false, true]) {
    await expect(dock.locator(".preview-code")).toHaveAttribute("data-highlighted", "true")
    await tree.evaluate(el => { el.scrollTop = el.scrollHeight })
    const before = await tree.evaluate(el => el.scrollTop)
    expect(before).toBeGreaterThan(100)
    if (expanded) await dock.getByRole("button", { name: "展开阅读", exact: true }).click()
    await dock.getByRole("button", { name: "收起预览", exact: true }).click()
    await expect(tree).toBeVisible()
    expect(await tree.evaluate(el => el.scrollTop)).toBeLessThan(before)
    await row.click()
    await expect(dock.locator(".preview-code")).toBeVisible()
    expect(await tree.evaluate(el => el.scrollTop)).toBe(before)
  }
})

test.describe("产物收起", () => {
  test.use({ dawnOptions: { toolCall: { toolName: "bash", args: { command: `mkdir -p outputs; printf '%s' '${png}' | base64 --decode > outputs/figure.png; printf 'value = 1\n' > outputs/analysis.py` } } } })
  test("图片与展开脚本的 × 回清单，保留原返回与定位入口", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    const input = page.getByPlaceholder(/输入问题/)
    await input.fill("生成图片与脚本")
    await input.press("Enter")
    const group = page.getByRole("group", { name: "本轮生成的文件" }).last()
    await expect(group).toContainText("已生成 2 个文件")
    await group.getByRole("button", { name: "查看产物", exact: true }).click()
    const dock = page.locator(".right-dock")
    const close = dock.getByRole("button", { name: "收起预览", exact: true })
    await expect(close).toBeVisible()
    await close.click()
    await expect(dock.locator(".artifact-thumb-grid")).toBeVisible()
    await dock.getByRole("button", { name: "outputs/figure.png", exact: true }).click()
    await expect(dock.getByRole("button", { name: "回到清单", exact: true })).toBeVisible()
    await close.click()
    await dock.getByRole("button", { name: "outputs/analysis.py", exact: true }).click()
    await expect(dock.locator(".preview-code")).toContainText("value = 1")
    await dock.getByRole("button", { name: "展开阅读", exact: true }).click()
    await close.click()
    await expect(dock.locator(".preview-code")).toHaveCount(0)
    await expect(dock.getByRole("button", { name: "outputs/analysis.py", exact: true })).toBeVisible()
    await dock.getByRole("button", { name: "outputs/analysis.py", exact: true }).click()
    await expect(dock.getByRole("button", { name: "展开阅读", exact: true })).toBeVisible()
    await dock.getByRole("button", { name: "在文件里定位", exact: true }).click()
    await expect(page.getByRole("tab", { name: "文件", exact: true })).toHaveAttribute("aria-selected", "true")
    await expect(dock.locator(".preview-code")).toContainText("value = 1")
    await close.click()
    await group.getByRole("button", { name: "展开文件列表", exact: true }).click()
    await group.getByRole("button", { name: "打开产物 outputs/analysis.py", exact: true }).click()
    await dock.getByRole("button", { name: "在文件里定位", exact: true }).click()
    await expect(dock.locator(".preview-code")).toBeVisible()
  })
})
