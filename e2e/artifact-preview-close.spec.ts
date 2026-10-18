import { test, expect, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: {
  gitInit: true,
  toolCall: {
    toolName: "write",
    args: { path: "outputs/review.md", content: "# 科研审查记录\n\n" + "这里是合成验收文本，用于检查长文滚动与预览收起。\n\n".repeat(120) },
    say: "写入一份预览验收文本。",
  },
} })

test("长Markdown产物只滚动正文，收起入口固定且返回原清单", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.setViewportSize({ width: 1000, height: 760 })
  const box = page.locator("main.main").getByRole("textbox")
  await box.fill("生成预览验收文本")
  await box.press("Enter")
  const strip = page.getByRole("group", { name: "本轮生成的文件" })
  await strip.getByRole("button", { name: "查看产物", exact: true }).click()
  const pane = page.locator(".artifacts-preview")
  await expect(pane.getByRole("heading", { name: "科研审查记录", exact: true })).toBeVisible()
  const close = pane.getByRole("button", { name: "收起预览", exact: true })
  await expect(close).toHaveCount(1)
  const before = (await close.boundingBox())!
  await pane.locator(".preview-body").hover()
  await page.mouse.wheel(0, 900)
  await expect.poll(() => pane.locator(".preview-body").evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  await expect(close).toBeVisible()
  expect(Math.abs((await close.boundingBox())!.y - before.y)).toBeLessThan(1)
  await close.click()
  await expect(pane).toHaveCount(0)
  const row = page.locator(".right-dock").getByRole("button", { name: "outputs/review.md", exact: true })
  await expect(row).toBeFocused()
  await row.click()
  await expect(page.locator(".artifacts-preview .preview-body")).toBeVisible()
})
