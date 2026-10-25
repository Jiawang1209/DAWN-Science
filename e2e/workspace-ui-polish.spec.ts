import { mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("工作区加入已有或新目录，取消/重复不改变列表，重启保留，移除不删除磁盘", async ({ dawn }) => {
  let { page } = dawn
  await 开一段临时会话(page)
  const title = await page.locator(".topbar .conv-title").innerText()
  const created = join(dawn.dir, "新建项目文件夹")
  mkdirSync(created)
  const mockDialog = async (path: string | null) => dawn.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async (...args: unknown[]) => {
      const opts = args.at(-1) as { properties?: string[] }
      ;(globalThis as unknown as { directoryOptions: unknown }).directoryOptions = opts
      return { canceled: path === null, filePaths: path ? [path] : [] }
    }
  }, path)
  const add = () => page.getByRole("button", { name: "添加工作区文件夹", exact: true }).click()
  await page.getByPlaceholder(/输入问题/).fill("这是还没有发送的草稿")
  await mockDialog(null)
  await add()
  await expect.poll(() => dawn.app.evaluate(() => (globalThis as unknown as { directoryOptions: { properties: string[] } }).directoryOptions?.properties)).toEqual(["openDirectory", "createDirectory"])
  await expect(page.locator(".proj-item")).toHaveCount(0)
  for (const [i, path] of [created, dawn.workspace, created].entries()) {
    await mockDialog(path)
    await add()
    await expect(page.locator(".proj-item")).toHaveCount(i === 0 ? 1 : 2)
  }
  await expect(page.getByPlaceholder(/输入问题/)).toHaveValue("这是还没有发送的草稿")
  await expect(page.locator(".session-list .sess-item")).toHaveCount(1)
  await expect(page.locator(".topbar .conv-title")).toHaveText(title)
  page = await dawn.重开()
  await expect(page.locator(".proj-item")).toHaveCount(2)
  await page.getByRole("button", { name: "项目操作：新建项目文件夹", exact: true }).click()
  await page.getByRole("menuitem", { name: "删除项目：新建项目文件夹", exact: true }).click()
  await page.getByRole("button", { name: "移除项目", exact: true }).click()
  await expect(page.locator(".proj-item")).toHaveCount(1)
  expect(existsSync(created)).toBe(true)
  await page.reload()
  await expect(page.locator(".proj-item")).toHaveCount(1)
})

test("固定工作区搜索保留原弹层、Escape焦点和草稿，侧栏收窄后品牌完整", async ({ dawn }, info) => {
  const { page } = dawn
  await expect(page.locator(".workspace-header")).toContainText("工作区")
  await expect(page.locator(".topbar-navigation .side-search-toggle")).toHaveCount(0)
  const search = page.locator(".workspace-header .side-search-toggle")
  await page.getByPlaceholder(/输入问题/).fill("保留输入内容")
  await search.click()
  await expect(page.getByRole("dialog", { name: "搜索", exact: true })).toBeVisible()
  await expect(page.locator(".side-search-field")).toBeFocused()
  await page.locator(".side-search-field").press("Escape")
  await expect(search).toBeFocused()
  await expect(page.getByPlaceholder(/输入问题/)).toHaveValue("保留输入内容")
  expect(await page.locator(".sidebar").evaluate(e => e.getBoundingClientRect().width)).toBe(260)
  await page.screenshot({ path: info.outputPath("workspace-light.png") })
  await page.getByRole("button", { name: "收起侧边栏", exact: true }).click()
  await expect(page.getByRole("button", { name: "展开侧边栏", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "展开侧边栏", exact: true }).click()
  await expect(search).toBeVisible()
})

for (const lang of ["zh", "en"] as const) {
test(`长待发正文省略，宽窄面板四个操作文字单行且不溢出（${lang}）`, async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page)
  if (lang === "en") {
    await page.addInitScript(() => localStorage.setItem("dawn.global.lang", "en"))
    await page.reload()
    await page.locator(".session-list .sess-item .row").first().click()
  }
  const box = page.getByPlaceholder(/输入问题|Enter a question/)
  await box.fill("慢慢跑一下")
  await box.press("Enter")
  await expect(page.locator(".tool").first()).toHaveAttribute("data-status", "running")
  await box.fill("可以，我们规范一下，先把中国的真菌和细菌的扩增子都先下载，我后续可以先进行核验。".repeat(3))
  await box.press("Enter")
  const strip = page.locator("main .queued-strip")
  const row = strip.locator(".queued-one")
  await expect(row.locator("button")).toHaveCount(4)
  for (const width of [900, 560, 280]) {
    await strip.evaluate((el, width) => { (el as HTMLElement).style.width = `${width}px`; (el as HTMLElement).style.boxSizing = "border-box" }, width)
    const layout = await row.evaluate(el => {
      const outer = el.closest(".queued-strip")!.getBoundingClientRect()
      return [...el.querySelectorAll("button")].map(button => {
        const r = document.createRange(); r.selectNodeContents(button)
        const rects = [...r.getClientRects()]
        const b = button.getBoundingClientRect()
        return { lines: new Set(rects.map(r => r.y)).size, inside: b.left >= outer.left - 1 && b.right <= outer.right + 1 }
      })
    })
    expect(layout).toEqual(Array.from({ length: 4 }, () => ({ lines: 1, inside: true })))
    await strip.screenshot({ path: info.outputPath(`queued-${lang}-${width}.png`) })
  }
  await row.getByRole("button", { name: /^(取回|Take back)$/, exact: true }).click()
  await expect(page.locator(".queued-one")).toHaveCount(0)
  await expect(box).toHaveValue(/中国的真菌/)
  // 忙着且草稿有字时发送键为“排到后面”；先清空取回的草稿，再停止工具。
  await box.fill("")
  await page.getByRole("button", { name: /^(停止|Stop)$/, exact: true }).click()
})
}
