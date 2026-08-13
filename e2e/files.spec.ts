/**
 * 文件浏览与预览（②-A′ · F3/F4）。**跑真实构建产物。**
 *
 * 单元测试能证明 `readFileForPreview` 会回一个 base64。它证明不了
 * **那张图真的画在屏幕上**——中间还隔着协议、IPC、`data:` URI 与 CSP。
 * **CSP 尤其**：`img-src` 少写一个 `data:`，图就是一个空框，
 * 而所有单元测试照样全绿。
 */
import { test, expect } from "./fixtures.js"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** 1×1 的红点 png。**真图，不是占位串**——要验的就是它能被解码渲染 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

test("目录树能翻，图片直接显示在应用里", async ({ dawn }) => {
  const { page, workspace } = dawn

  mkdirSync(join(workspace, "out"), { recursive: true })
  writeFileSync(join(workspace, "out", "图.png"), PNG)
  writeFileSync(join(workspace, "out", "说明.md"), "# 分析结论\n\n这是正文。\n")

  await page.getByRole("button", { name: "文件", exact: true }).click()

  // 根目录默认展开；点进 out
  await page.getByRole("button", { name: /out/ }).click()
  await page.getByRole("button", { name: /图\.png/ }).click()

  const img = page.locator(".preview-img")
  await expect(img).toBeVisible()
  // **真的解码了**：加载失败的 <img> 也「可见」，但自然宽度是 0
  expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test("markdown 走渲染，其它文本按原文", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "说明.md"), "# 分析结论\n")
  writeFileSync(join(workspace, "跑.py"), "print('hi')\n")

  await page.getByRole("button", { name: "文件", exact: true }).click()
  await page.getByRole("button", { name: /说明\.md/ }).click()
  // 渲染过的 markdown 里有真的 <h1>，不是一行 `# 分析结论`
  await expect(page.locator(".file-preview h1")).toHaveText("分析结论")

  await page.getByRole("button", { name: /跑\.py/ }).click()
  // **代码不该被当成 markdown 改写**
  await expect(page.locator(".preview-text")).toContainText("print('hi')")
})

test("**PDF 在应用里就能看**（②-A′ · F5），而且没有被 CSP 拦下", async ({ dawn }) => {
  const { page, workspace } = dawn
  /**
   * 一个最小的合法 PDF。**真文件，不是占位字节**——
   * Chromium 的阅读器拿到坏文件会给一片白，而那正是我们要区分的失败样子。
   */
  const PDF = [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
    "trailer<</Root 1 0 R>>",
  ].join("\n")
  writeFileSync(join(workspace, "报告.pdf"), PDF)

  const 违规: string[] = []
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) 违规.push(m.text())
  })

  await page.getByRole("button", { name: "文件", exact: true }).click()
  await page.getByRole("button", { name: /报告\.pdf/ }).click()

  const embed = page.locator(".preview-pdf")
  await expect(embed).toBeVisible()
  // **走的是 blob**：既不给渲染进程 file://，也不用会被 frame 拦掉的 data:
  expect(await embed.getAttribute("src")).toMatch(/^blob:/)
  await expect(page.locator(".preview-head .sub")).toContainText("application/pdf")

  /**
   * **这一条是这批改动的要害。** `object-src` 少写一个 `blob:`，
   * 上面的断言全部照样通过——`<embed>` 元素在、src 是 blob:、只是里面一片白。
   */
  expect(违规, `PDF 被 CSP 拦下了：\n${违规.join("\n")}`).toEqual([])
})

test("**超上界的 PDF 说清多大**，而不是硬塞进内存", async ({ dawn }) => {
  const { page, workspace } = dawn
  // **先造文件再打开文件视图**：目录树是打开那一刻读的一层，
  // 反过来写的话它根本不在树里（上一版就是这么超时的）
  writeFileSync(join(workspace, "小.bin"), Buffer.alloc(16))
  await page.getByRole("button", { name: "文件", exact: true }).click()
  await page.getByRole("button", { name: /小\.bin/ }).click()
  await expect(page.locator(".preview-other .caveat")).toContainText("不能在应用里预览")
})

test("**忽略掉的目录要出声**——不然人会以为它们不存在", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "node_modules"), { recursive: true })

  await page.getByRole("button", { name: "文件", exact: true }).click()
  await expect(page.locator(".tree-note").first()).toContainText("已忽略")
})
