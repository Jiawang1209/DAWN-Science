import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

for (const [file, language, code] of [
  ["analysis.R", "r", '# 中文注释\nx <- "sample"\nvalues <- c(1, 2, 3)\nprint(mean(values))\n'],
  ["analysis.py", "python", '# 中文注释\nimport math\nvalue = "sample"\nprint(math.sqrt(4))\n'],
]) {
  test.describe(`${language}脚本预览`, () => {
    test.use({ dawnOptions: { toolCall: { toolName: "write", args: { path: `outputs/${file}`, content: code } } } })
    test("文件与产物均高亮，亮暗切换保留原文与颜色", async ({ dawn }) => {
      const { page } = dawn
      const errors: string[] = []
      page.on("console", message => { if (/\[script-preview\]|violates.*Content Security Policy/i.test(message.text())) errors.push(message.text()) })
      await 在项目里开会话(page)
      await page.getByPlaceholder(/输入问题/).fill("生成分析脚本")
      await page.getByPlaceholder(/输入问题/).press("Enter")
      const group = page.getByRole("group", { name: "本轮生成的文件" }).last()
      await expect(group).toContainText("已生成 1 个文件")
      await group.getByRole("button", { name: "查看产物", exact: true }).click()
      const pre = page.locator(".right-dock .preview-code")
      const colors = () => pre.locator("[data-code-token]").evaluateAll(nodes => [...new Set(nodes.map(el => getComputedStyle(el).color))])
      await expect(pre).toHaveAttribute("data-highlighted", "true")
      await expect(pre).toHaveAttribute("data-language", language!)
      expect(await pre.textContent()).toBe(code)
      expect((await colors()).length).toBeGreaterThanOrEqual(3)
      await page.screenshot({ path: `tmp/ui-refresh-verification/script-preview/${language}-artifacts-light.png` })
      await page.getByRole("button", { name: "在文件里定位", exact: true }).click()
      await expect(page.getByRole("tab", { name: "文件", exact: true })).toHaveAttribute("aria-selected", "true")
      await expect(pre).toHaveAttribute("data-highlighted", "true")
      expect(await pre.textContent()).toBe(code)
      const light = await colors()
      expect(light.length).toBeGreaterThanOrEqual(3)
      await page.getByRole("button", { name: "设置", exact: true }).click()
      await page.getByRole("button", { name: "展开", exact: true }).click()
      await page.getByRole("radio", { name: "暗色", exact: true }).click()
      await page.getByRole("button", { name: "返回", exact: true }).click()
      await expect(page.locator("html")).toHaveClass(/dawn-dark/)
      await expect(pre).toHaveAttribute("data-highlighted", "true")
      expect(await pre.textContent()).toBe(code)
      const dark = await colors()
      expect(dark.length).toBeGreaterThanOrEqual(3)
      expect(dark).not.toEqual(light)
      await page.screenshot({ path: `tmp/ui-refresh-verification/script-preview/${language}-files-dark.png` })
      await 进坞(page, "产物")
      await expect(pre).toHaveAttribute("data-highlighted", "true")
      expect(await pre.textContent()).toBe(code)
      expect(await colors()).toEqual(dark)
      expect(errors).toEqual([])
    })
  })
}
