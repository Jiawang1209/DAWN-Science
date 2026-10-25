import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 进设置 } from "./fixtures.js"
import type { Locator } from "@playwright/test"

async function fits(row: Locator) {
  await expect(row.locator(".set-desc")).toBeVisible()
  // 网格切页带过渡；同一帧量所有边界，避免跨帧读取制造假溢出。
  await expect.poll(() => row.evaluate(el => {
    const label = el.querySelector(".set-label")!.getBoundingClientRect()
    const bounds = el.getBoundingClientRect()
    const control = el.querySelector(".ws-setting")!.getBoundingClientRect()
    return { labelFits: label.width > 120, controlFits: control.right <= bounds.right + 1 }
  })).toEqual({ labelFits: true, controlFits: true })
  for (const button of await row.getByRole("button").all()) {
    await expect(button).toBeVisible()
    expect((await button.boundingBox())!.height).toBeLessThan(42)
  }
}

for (const [width, theme] of [[1280, "亮色"], [1280, "暗色"], [880, "暗色"]] as const) {
  test(`长下载目录保持标题说明和按钮可见 ${width} ${theme}`, async ({ dawn }, testInfo) => {
    const { page, workspace } = dawn
    await page.setViewportSize({ width, height: 900 })
    await 进设置(page, "外观")
    await page.getByRole("radio", { name: theme, exact: true }).click()
    await 进设置(page, "工作目录")
    const row = page.locator(".settings-page .set-row").filter({ has: page.getByText("下载目录", { exact: true }) })
    await fits(row)
    await expect(row.getByText(/未设置，使用系统下载文件夹/)).toBeVisible()
    const path = join(workspace, ...Array.from({ length: 5 }, (_, i) => `long-directory-${i}-012345678901234567890123456789`))
    mkdirSync(path, { recursive: true })
    await page.evaluate(async path => {
      const r = await window.dawn!.invoke("setDownloadDir", { path })
      if (!r.ok) throw new Error(JSON.stringify(r.error))
    }, path)
    await page.reload()
    await 进设置(page, "工作目录")
    await fits(row)
    const geometry = await row.locator(".ws-setting-path").evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, overflow: getComputedStyle(el).textOverflow }))
    expect(geometry.width).toBeGreaterThan(12)
    expect(geometry.content).toBeGreaterThan(geometry.width)
    expect(geometry.overflow).toBe("ellipsis")
    await expect(row.getByRole("button", { name: "恢复系统默认", exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("long-directory.png") })
    await row.getByRole("button", { name: "恢复系统默认", exact: true }).click()
    await expect(row.getByText(/未设置，使用系统下载文件夹/)).toBeVisible()
    await fits(row)
    const overflow = await page.locator(".settings-body").evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
}
