import { test, expect } from "./fixtures.js"

/** 只读采样真实Web Animations，不替代产品动画或用户点击。 */
async function sample(page: import("@playwright/test").Page, selector: string) {
  await page.evaluate((selector) => {
    const w = window as any
    w.settingsMotionSamples = []
    const until = performance.now() + 700
    const read = () => {
      const el = document.querySelector(selector)
      if (el) for (const animation of el.getAnimations()) {
        const frames = (animation.effect as KeyframeEffect).getKeyframes()
        w.settingsMotionSamples.push({ frames, transform: getComputedStyle(el).transform, count: el.getAnimations().length })
      }
      if (performance.now() < until) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  }, selector)
}

test("设置侧滑进退、焦点返回、同分类草稿与整页切换，减少动态效果可立即操作", async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 900))
  await page.getByRole("button", { name: "设置", exact: true }).click()
  const column = page.locator(".settings-column")
  const body = column.locator(".dock-body")
  await sample(page, ".settings-column .dock-body")
  await column.getByRole("button", { name: "外观", exact: true }).click()
  await expect(column.locator(".dock-title")).toHaveText("外观")
  await expect(column.getByRole("button", { name: "回到清单", exact: true })).toBeFocused()
  await expect.poll(() => page.evaluate(() => (window as any).settingsMotionSamples.length)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).settingsMotionSamples.some((s: any) => s.frames[0].transform === "translateX(24px)" && s.count === 1))).toBe(true)
  await expect(body.getByRole("radiogroup", { name: "主题", exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath("appearance-column.png") })
  await sample(page, ".settings-column .dock-body")
  await column.getByRole("button", { name: "回到清单", exact: true }).click()
  await expect(column.getByRole("button", { name: "外观", exact: true })).toBeFocused()
  await expect.poll(() => page.evaluate(() => (window as any).settingsMotionSamples.some((s: any) => s.frames[0].transform === "translateX(-24px)"))).toBe(true)
  await column.getByRole("button", { name: "内核", exact: true }).click()
  const path = column.getByRole("textbox", { name: "Python 解释器", exact: true })
  await path.fill("/unsaved-preview-only/python")
  const sash = page.getByRole("separator", { name: "调整面板宽度", exact: true })
  await sash.focus()
  await sash.press("ArrowLeft")
  await expect(path).toHaveValue("/unsaved-preview-only/python")
  await column.getByRole("button", { name: "回到清单", exact: true }).click()
  const about = column.getByRole("button", { name: "关于", exact: true })
  await about.scrollIntoViewIfNeeded()
  const listScroll = await body.evaluate(el => el.scrollTop)
  await about.click()
  await column.getByRole("button", { name: "回到清单", exact: true }).click()
  await expect(about).toBeFocused()
  expect(Math.abs(await body.evaluate(el => el.scrollTop) - listScroll)).toBeLessThanOrEqual(1)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await column.getByRole("button", { name: "外观", exact: true }).click()
  expect(await body.evaluate(el => el.getAnimations().length)).toBe(0)
  await expect(body.getByRole("radio", { name: "蓝", exact: true })).toBeVisible()
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.getByRole("button", { name: "展开", exact: true }).click()
  const nav = page.locator(".settings-nav")
  await nav.getByRole("button", { name: "内核", exact: true }).click()
  await sample(page, ".settings-body")
  await nav.getByRole("button", { name: "外观", exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).settingsMotionSamples.length)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).settingsMotionSamples.every((s: any) => !s.frames[0].transform))).toBe(true)
  await expect(nav.getByRole("button", { name: "外观", exact: true })).toHaveAttribute("aria-current", "page")
  expect(await page.locator(".settings-body").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test("最窄设置栏的侧滑中间帧与暗色内容完整，动态偏好可中途取消", async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 900))
  await page.getByRole("button", { name: "设置", exact: true }).click()
  const column = page.locator(".settings-column")
  const sash = page.getByRole("separator", { name: "调整面板宽度", exact: true })
  await sash.focus()
  const min = Number(await sash.getAttribute("aria-valuemin"))
  for (let width = Number(await sash.getAttribute("aria-valuenow")); width > min; width -= 16) {
    await sash.press("ArrowRight")
    await expect(sash).toHaveAttribute("aria-valuenow", String(Math.max(min, width - 16)))
  }
  // 暂停真实动画，仅为固定检查其进入中间帧；业务状态仍由真实点击更新。
  await page.evaluate(() => {
    const until = performance.now() + 1000
    const read = () => {
      const a = document.querySelector(".settings-column .dock-body")?.getAnimations()[0]
      if (a) { a.pause(); a.currentTime = 30; (window as any).settingsMotionFrozen = true }
      else if (performance.now() < until) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  await column.getByRole("button", { name: "外观", exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).settingsMotionFrozen)).toBe(true)
  await expect(column.locator(".dock-title")).toHaveText("外观")
  const body = column.locator(".dock-body")
  expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await column.screenshot({ path: info.outputPath("narrow-mid-slide.png") })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect.poll(() => body.evaluate(el => el.getAnimations().length)).toBe(0)
  await column.getByRole("radio", { name: "暗色", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dawn-dark/)
  await column.screenshot({ path: info.outputPath("narrow-dark.png") })
  expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(column.getByRole("radio", { name: "亮色", exact: true })).toBeVisible()
  await column.getByRole("radio", { name: "亮色", exact: true }).click()
  await column.screenshot({ path: info.outputPath("narrow-light.png") })
})
