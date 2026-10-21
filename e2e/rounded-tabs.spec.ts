import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

test("会话和坞页签的背景统一小圆角，亮暗与悬停保留同一外框", async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const session = page.locator(".session-tab-wrap.current")
  const dock = page.locator(".dock-tab-btn.current")
  const corners = (locator: import("@playwright/test").Locator) => locator.evaluate(el => {
    const s = getComputedStyle(el)
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat)
  })
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.classList.remove("dawn-light", "dawn-dark"); document.documentElement.classList.add(`dawn-${theme}`) }, theme)
    const sessionCorners = await corners(session)
    expect(sessionCorners.every(value => value > 0)).toBe(true)
    expect(await corners(dock)).toEqual(sessionCorners)
    for (const tab of await page.locator(".dock-tab-btn:visible").all()) expect(await corners(tab)).toEqual(sessionCorners)
    await session.locator(".session-tab").hover()
    expect(await session.locator(".session-tab").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
    await session.locator(".session-tab-close").hover()
    expect(await session.locator(".session-tab-close").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
    await dock.hover()
    expect(await corners(dock)).toEqual(sessionCorners)
    expect(await dock.evaluate(el => getComputedStyle(el).boxShadow)).toContain("inset")
    expect(await session.evaluate(el => parseFloat(getComputedStyle(el).borderBottomWidth))).toBeGreaterThan(0)
    await page.locator(".session-tabs-topbar").screenshot({ path: info.outputPath(`session-rounded-${theme}.png`), animations: "disabled" })
    await page.locator(".dock-head").screenshot({ path: info.outputPath(`dock-rounded-${theme}.png`), animations: "disabled" })
  }
})
