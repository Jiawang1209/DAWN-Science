import { mkdirSync } from "node:fs"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

const output = "tmp/ui-refresh-verification/composer-highlight"
const sample = '`R`语言\n```r\nlibrary("tidyverse")\nx <- 2\n```'

test("首页Markdown高亮保留原文，光标选区与撤销正常", async ({ dawn }) => {
  const { page } = dawn
  const input = page.locator(".composer-box textarea")
  const mirror = page.locator(".composer-hl")
  await input.fill(sample)
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  expect(await mirror.textContent()).toBe(sample)
  const colors = await mirror.locator("[data-draft-token]").evaluateAll(nodes => [...new Set(nodes.map(el => getComputedStyle(el).color))])
  expect(colors.length).toBeGreaterThanOrEqual(3)
  expect(await input.evaluate(el => getComputedStyle(el).caretColor)).not.toBe("rgba(0, 0, 0, 0)")
  const aligned = await page.evaluate(() => {
    const input = document.querySelector(".composer-box textarea")!.getBoundingClientRect()
    const mirror = document.querySelector(".composer-hl")!.getBoundingClientRect()
    return [Math.abs(input.x - mirror.x), Math.abs(input.y - mirror.y), Math.abs(input.width - mirror.width), Math.abs(input.height - mirror.height)]
  })
  expect(Math.max(...aligned)).toBeLessThanOrEqual(1)
  // 选中字符串替换，然后由原生编辑器撤销，不重建DOM或移动光标。
  await input.evaluate((el: HTMLTextAreaElement) => {
    const start = el.value.indexOf("tidyverse")
    el.focus(); el.setSelectionRange(start, start + "tidyverse".length)
  })
  await page.keyboard.insertText("ggplot2")
  await expect(input).toHaveValue(sample.replace("tidyverse", "ggplot2"))
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect(input).toHaveValue(sample)
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  await input.evaluate((el: HTMLTextAreaElement) => { el.setSelectionRange(0, 0); el.scrollTop = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })) })
  mkdirSync(output, { recursive: true })
  await page.locator(".composer-card").screenshot({ path: `${output}/home-r-light.png` })
})

test("会话Markdown滚动对齐、组词原生绘制，发送内容不含额外标记", async ({ dawn }) => {
  const { page, app } = dawn
  const errors: string[] = []
  page.on("console", message => { if (/\[composer-highlight\]|violates.*Content Security Policy/i.test(message.text())) errors.push(message.text()) })
  await 在项目里开会话(page)
  const input = page.locator("main.main .composer-box textarea")
  const mirror = page.locator("main.main .composer-hl")
  const text = '# 分析\n```python\n' + Array.from({ length: 25 }, (_, index) => `print("样本", ${index})`).join("\n") + '\n```\n@AGENTS.md\n'
  await input.fill(text)
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  await input.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll", { bubbles: true })) })
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector("main.main .composer-hl")!.scrollTop - document.querySelector("main.main textarea")!.scrollTop))).toBeLessThanOrEqual(1)
  expect(await mirror.textContent()).toBe(text)
  await expect(mirror.locator(".hl-ref")).toHaveText("@AGENTS.md")
  await input.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length) })
  const cdp = await app.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", { text: "zh", selectionStart: 2, selectionEnd: 2 })
  await expect(input).toHaveValue(text + "zh")
  await expect(input).toHaveAttribute("data-composing", "true")
  expect(await input.evaluate(el => getComputedStyle(el).color)).not.toBe("rgba(0, 0, 0, 0)")
  await expect(mirror).toHaveCSS("visibility", "hidden")
  await cdp.send("Input.insertText", { text: "中文输入" })
  await expect(input).not.toHaveAttribute("data-composing", "true")
  await expect(input).toHaveValue(text + "中文输入")
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  expect(await mirror.textContent()).toBe(text + "中文输入")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  expect(JSON.stringify(dawn.requests)).toContain(JSON.stringify(text + "中文输入").slice(1, -1))
  await expect(input).toHaveValue("")
  await expect(mirror).toHaveCount(0)
  expect(errors).toEqual([])
})

test("主对话与窄坞输入共用高亮，亮暗主题切换保留草稿", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const input = page.locator("main.main .composer-box textarea")
  const mirror = page.locator("main.main .composer-hl")
  await input.fill(sample)
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  const light = await mirror.locator("[data-draft-token]").evaluateAll(nodes => nodes.map(el => getComputedStyle(el).color))
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "展开", exact: true }).click()
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(mirror).toHaveAttribute("data-highlighted", "true")
  await expect(input).toHaveValue(sample)
  const dark = await mirror.locator("[data-draft-token]").evaluateAll(nodes => nodes.map(el => getComputedStyle(el).color))
  expect(dark).not.toEqual(light)
  const accent = await mirror.evaluate(el => getComputedStyle(el).getPropertyValue("--dawn-accent").trim())
  const markerColor = await mirror.locator('[data-marker="true"]').first().evaluate(el => getComputedStyle(el).color)
  expect(markerColor).toBe(await page.evaluate(color => {
    const element = document.createElement("span"); element.style.color = color; document.body.append(element)
    const resolved = getComputedStyle(element).color; element.remove(); return resolved
  }, accent))
  await 进坞(page, "对话")
  const side = page.locator(".right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  await expect(side.locator(".side-chat-head")).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await side.locator("textarea").fill('```python\nprint("样本", 2)\n```')
  await expect(side.locator(".composer-hl")).toHaveAttribute("data-highlighted", "true")
  expect(await side.locator(".composer-hl").textContent()).toBe('```python\nprint("样本", 2)\n```')
  const colors = await side.locator("[data-draft-token]").evaluateAll(nodes => [...new Set(nodes.map(el => getComputedStyle(el).color))])
  expect(colors.length).toBeGreaterThanOrEqual(3)
  mkdirSync(output, { recursive: true })
  await page.screenshot({ path: `${output}/side-python-dark.png` })
})
