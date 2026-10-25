import { readFileSync } from "node:fs"
import { test, expect, 进设置 } from "./fixtures.js"

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

test("状态栏最右显示实际应用版本，窄窗不隐藏且品牌入口仍可点击", async ({ dawn }, testInfo) => {
  const { page } = dawn
  const name = page.locator(".topbar .brand")
  const label = page.locator(".statusbar .brand-version")
  await expect(page.locator(".brand-version")).toHaveCount(1)
  await expect(label).toHaveText(`v${version}`, { timeout: 5000 })
  await expect(name).toHaveText("DAWN Science")
  for (const width of [1280, 880]) {
    await page.setViewportSize({ width, height: 760 })
    await expect(label).toBeVisible()
    const geometry = await label.evaluate(el => {
      const box = el.getBoundingClientRect(), bar = el.closest(".statusbar")!
      const bounds = bar.getBoundingClientRect()
      return { rightGap: bounds.right - box.right - parseFloat(getComputedStyle(bar).paddingRight),
        inside: box.left >= bounds.left && box.top >= bounds.top && box.bottom <= bounds.bottom,
        last: bar.lastElementChild === el }
    })
    expect(geometry.inside).toBe(true)
    expect(geometry.last).toBe(true)
    expect(Math.abs(geometry.rightGap)).toBeLessThanOrEqual(1)
    const textLines = await name.locator(".brand-name").evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el)
      return range.getClientRects().length
    })
    expect(textLines).toBe(1)
    await page.locator(".statusbar").screenshot({ path: testInfo.outputPath(`status-${width}.png`) })
  }
  await 进设置(page, "外观")
  await expect(page.locator(".settings-nav")).toBeVisible()
  await name.click()
  await expect(page.getByRole("heading", { name: "今天想分析什么？", exact: true })).toBeVisible()
  await expect(page.locator(".settings-nav")).toHaveCount(0)
})
