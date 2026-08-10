/**
 * 文件浏览与预览（②-B · F3/F4）。**跑真实构建产物。**
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

  await page.getByRole("button", { name: "文件" }).click()

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

  await page.getByRole("button", { name: "文件" }).click()
  await page.getByRole("button", { name: /说明\.md/ }).click()
  // 渲染过的 markdown 里有真的 <h1>，不是一行 `# 分析结论`
  await expect(page.locator(".file-preview h1")).toHaveText("分析结论")

  await page.getByRole("button", { name: /跑\.py/ }).click()
  // **代码不该被当成 markdown 改写**
  await expect(page.locator(".preview-text")).toContainText("print('hi')")
})

test("**认不出的类型说清是什么、多大**，而不是给一片空白", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "报告.pdf"), Buffer.alloc(2048, 1))

  await page.getByRole("button", { name: "文件" }).click()
  await page.getByRole("button", { name: /报告\.pdf/ }).click()

  await expect(page.locator(".preview-other")).toBeVisible()
  await expect(page.locator(".preview-head .sub")).toContainText("application/pdf")
  await expect(page.locator(".preview-head .sub")).toContainText("KB")
  await expect(page.getByRole("button", { name: "用系统程序打开" })).toBeVisible()
})

test("**忽略掉的目录要出声**——不然人会以为它们不存在", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "node_modules"), { recursive: true })

  await page.getByRole("button", { name: "文件" }).click()
  await expect(page.locator(".tree-note").first()).toContainText("已忽略")
})
