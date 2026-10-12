import { test, expect, 在项目里开会话, 等进了对话 } from "./fixtures.js"

test("RP 资产可用；提问选中文字在浅色强调色和亮暗主题下仍清晰", async ({ dawn }, testInfo) => {
  const { page } = dawn
  const logo = page.locator(".topbar img.brand-mark")
  await expect(logo).toBeVisible()
  await expect.poll(() => logo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  expect(await logo.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))).toEqual({ width: 32, height: 32 })
  const welcomeLogo = page.locator("img.welcome-mark")
  await expect(welcomeLogo).toBeVisible({ timeout: 5000 })
  await expect.poll(() => welcomeLogo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  expect(await welcomeLogo.getAttribute("src")).toBe(await logo.getAttribute("src"))
  expect(await welcomeLogo.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))).toEqual({ width: 56, height: 56 })
  await testInfo.attach("welcome-rp", { body: await page.screenshot(), contentType: "image/png" })
  await 在项目里开会话(page); await 等进了对话(page)
  const input = page.getByPlaceholder(/今天帮你做些什么/)
  await input.fill("请做结构化澄清"); await input.press("Enter")
  const card = page.locator("main.main .question-card")
  await expect(card).toContainText("这次需要分析哪些样本？")
  await expect(card.getByRole("radio").first()).not.toBeChecked()
  await card.getByRole("radio", { name: /全部样本/ }).check()
  const contrast = await card.evaluate(el => {
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1
    const ctx = canvas.getContext("2d")!
    const luminance = (rgb: number[]) => rgb.map(v => {
      v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0)
    const pixel = (colors: string[]) => {
      ctx.clearRect(0, 0, 1, 1)
      for (const color of colors) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1) }
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const root = document.documentElement
    const originalClass = root.className, originalStyle = root.getAttribute("style")
    const results = []
    try {
      for (const theme of ["light", "dark"]) {
        root.classList.toggle("dawn-dark", theme === "dark"); root.classList.toggle("dawn-light", theme !== "dark")
        for (const accent of ["#ffffff", "#ffff00", "#000000", "#7855ae"]) {
          root.style.setProperty("--theme-accent", accent)
          const row = el.querySelector(".question-option.selected")!, label = row.querySelector("strong")!
          const a = luminance(pixel([getComputedStyle(label).color]))
          const b = luminance(pixel([getComputedStyle(el).backgroundColor, getComputedStyle(row).backgroundColor]))
          results.push({ theme, accent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) })
        }
      }
    } finally {
      root.className = originalClass
      if (originalStyle === null) root.removeAttribute("style"); else root.setAttribute("style", originalStyle)
    }
    return results
  })
  await testInfo.attach("selected-text-contrast", { body: JSON.stringify(contrast), contentType: "application/json" })
  for (const sample of contrast) expect(sample.ratio, `${sample.theme} ${sample.accent}`).toBeGreaterThanOrEqual(4.5)
})
