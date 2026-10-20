import { test, expect, 在项目里开会话, 进坞, 进设置, CANNED_REPLY } from "./fixtures.js"

test("面板与坞标签同尺寸，激活使用当前主题色，关闭恢复", async ({ dawn }) => {
  const { page } = dawn
  const trigger = page.locator(".dock-switch-trigger")
  const originalColor = await trigger.evaluate(el => getComputedStyle(el).color)
  await 进坞(page, "文件")
  const tab = page.getByRole("tab", { name: "文件", exact: true })
  expect(await trigger.evaluate(el => getComputedStyle(el).fontSize)).toBe(await tab.evaluate(el => getComputedStyle(el).fontSize))
  expect((await trigger.boundingBox())!.height).toBe((await tab.boundingBox())!.height)
  expect(await trigger.evaluate(el => getComputedStyle(el).color)).toBe(await tab.evaluate(el => getComputedStyle(el).color))
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(trigger).toHaveCSS("color", originalColor)
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "蓝", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await 进坞(page, "文件")
  expect(await trigger.evaluate(el => getComputedStyle(el).color)).toBe(await tab.evaluate(el => getComputedStyle(el).color))
})

test("查找导出直接属于主对话内容区，与面板分行，键盘返回正常且窄窗口不越界", async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const main = page.locator("main.main")
  await main.getByPlaceholder(/输入问题/).fill("你好")
  await main.getByPlaceholder(/输入问题/).press("Enter")
  await expect(main.locator(".turns")).toContainText(CANNED_REPLY)
  await 进坞(page, "文件")
  const find = main.getByRole("button", { name: "查找当前对话", exact: true })
  const download = main.getByRole("button", { name: "导出对话", exact: true })
  await expect(find).toBeVisible()
  await expect(download).toBeVisible()
  await expect(page.locator(".conv-actions-trigger")).toHaveCount(0)
  await expect(page.locator(".topbar .conv-actions")).toHaveCount(0)
  const panel = (await page.locator(".dock-switch-trigger").boundingBox())!
  expect((await find.boundingBox())!.y).toBeGreaterThanOrEqual(panel.y + panel.height)
  await expect(main.getByRole("tooltip")).toHaveCount(0)
  await find.hover()
  await expect(main.getByRole("tooltip")).toHaveText("查找当前对话")
  await page.mouse.move(0, 0)
  await expect(main.getByRole("tooltip")).toHaveCount(0)
  await download.hover()
  await expect(main.getByRole("tooltip")).toHaveText("导出对话")
  await page.mouse.move(0, 0)
  await find.focus()
  await expect(main.getByRole("tooltip")).toHaveText("查找当前对话")
  await find.press("Tab")
  await expect(download).toBeFocused()
  await expect(main.getByRole("tooltip")).toHaveText("导出对话")
  await download.press("Shift+Tab")
  await expect(find).toBeFocused()
  await find.press("Enter")
  await expect(main.getByRole("searchbox")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(find).toBeFocused()
  await page.setViewportSize({ width: 900, height: 700 })
  const content = (await main.boundingBox())!
  for (const button of [find, download]) {
    const bounds = (await button.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(content.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(content.x + content.width)
  }
  // 实际滚动层带 both-edges gutter，不能只和 main 的外边界比较。
  await find.evaluate(el => el.blur())
  for (const width of [900, 1512]) {
    await page.setViewportSize({ width, height: 480 })
    const scroll = main.locator(".turns > div").first()
    await expect.poll(() => scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    const railLeft = await scroll.evaluate(el => el.getBoundingClientRect().right - ((el as HTMLElement).offsetWidth - el.clientWidth) / 2)
    for (const button of [find, download]) {
      const bounds = (await button.boundingBox())!
      expect.soft(bounds.x + bounds.width).toBeLessThanOrEqual(railLeft - 8)
      const expectedBackground = await button.evaluate(el => {
        const probe = document.createElement("span")
        probe.style.backgroundColor = "var(--dawn-accent-soft)"
        el.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      })
      await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(expectedBackground)
      await button.hover()
      const tip = (await main.getByRole("tooltip").boundingBox())!
      expect.soft(tip.x + tip.width).toBeLessThanOrEqual(railLeft - 8)
      await page.mouse.move(0, 0)
    }
    const scroller = (await scroll.boundingBox())!
    // 滚轮落在滚动条一侧时仍能向上滚动。
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
    const before = await scroll.evaluate(el => el.scrollTop)
    await page.mouse.move(railLeft + 2, scroller.y + scroller.height / 2)
    await page.mouse.wheel(0, -120)
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeLessThan(before)
  }
  await page.screenshot({ path: info.outputPath("session-actions-scrollbar.png"), animations: "disabled" })
})
