import { readFileSync } from "node:fs"
import { test, expect } from "./fixtures.js"

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

test("品牌名后显示实际应用版本，同一行且入口仍可点击", async ({ dawn }, testInfo) => {
  const { page } = dawn
  const name = page.locator(".topbar .brand")
  const label = page.locator(".topbar .brand-version")
  await expect(label).toHaveText(`v${version}`, { timeout: 5000 })
  await expect(name).toHaveText("DAWN Science")
  const nameBox = (await name.boundingBox())!
  const labelBox = (await label.boundingBox())!
  const barBox = (await page.locator(".topbar").boundingBox())!
  expect(labelBox.x).toBeGreaterThan(nameBox.x + nameBox.width)
  expect(Math.abs(labelBox.y + labelBox.height / 2 - nameBox.y - nameBox.height / 2)).toBeLessThanOrEqual(1)
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(barBox.y + barBox.height)
  await page.locator(".topbar").screenshot({ path: testInfo.outputPath("header.png") })
  await name.click()
  await expect(page.getByRole("heading", { name: "开始一段对话" })).toBeVisible()
})
