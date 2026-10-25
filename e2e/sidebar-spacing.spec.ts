import { test, expect, 开一段临时会话, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: { fakeSsh: true } })

test("260px紧凑导航、分组字体与计数列、服务器多选顺序", async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page, "归档排版样本")
  await page.locator(".loose-list .sess-item .row-more").first().click()
  await page.getByRole("menuitem", { name: "收进归档", exact: true }).click()
  await 开一段临时会话(page)
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "添加服务器", exact: true }).click()
  await page.locator("#conn-label").fill("排版验收服务器")
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.locator(".remote-row")).toHaveAttribute("data-state", "ready")
  await page.locator(".remote-row").getByRole("button", { name: "新建远端任务", exact: true }).click()
  // 新建远端任务先回到页面，再异步刷新任务列表；等完整目录后量计数与操作列。
  await expect(page.locator(".server-bulk")).toBeVisible()
  await expect(page.locator(".side-action-archive")).toBeVisible()
  await expect(page.locator(".side-section-count, .side-action-archive .side-count")).toHaveCount(5)

  const check = async (width: number) => {
    await expect.poll(async () => (await page.locator(".sidebar").boundingBox())!.width).toBe(width)
    const geometry = await page.evaluate(() => {
      const el = (s: string) => document.querySelector<HTMLElement>(s)!
      const rect = (s: string) => el(s).getBoundingClientRect()
      const counts = [...document.querySelectorAll(".side-section-count, .side-action-archive .side-count")].map(e => e.getBoundingClientRect().x)
      const bulk = [...document.querySelectorAll(".side-section .side-bulk, .side-section .server-bulk")].map(e => e.getBoundingClientRect().right)
      const font = (s: string) => getComputedStyle(el(s)).fontSize
      return {
        counts, bulk,
        titleGaps: [...document.querySelectorAll(".side-section-toggle, .side-action-archive")].map(e => {
          const title = e.querySelector(".side-section-title, .name")!, count = e.querySelector(".side-count")!
          const range = document.createRange(); range.selectNodeContents(title)
          return count.getBoundingClientRect().x - range.getBoundingClientRect().right
        }),
        fonts: [...document.querySelectorAll(".side-section-title, .side-bottom .name")].map(e => getComputedStyle(e).fontSize),
        buttonGaps: [rect(".shortcut-toggle").x - rect(".side-toggle").right],
        brandGap: rect(".side-toggle").x - rect(".brand-stack").right,
        nameHeight: rect(".brand-name").height,
        fits: rect(".shortcut-toggle").right <= rect(".sidebar").right,
        countMargin: getComputedStyle(el(".side-section-count")).marginLeft,
        serverOrder: rect(".server-add").right <= rect(".server-bulk").x,
        overflow: document.documentElement.scrollWidth > innerWidth,
        footerFont: font(".side-action-archive .name"),
      }
    })
    await info.attach(`geometry-${width}`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" })
    expect(geometry.buttonGaps).toEqual([4])
    expect(geometry.brandGap).toBe(8)
    expect(geometry.fits).toBe(true)
    expect(geometry.nameHeight).toBeLessThan(32)
    expect(geometry.fonts.every(f => f === "14px" && f === geometry.footerFont)).toBe(true)
    expect(geometry.countMargin).toBe("4px")
    expect(Math.min(...geometry.titleGaps)).toBeGreaterThanOrEqual(8)
    expect(geometry.counts).toHaveLength(5)
    expect(Math.max(...geometry.counts) - Math.min(...geometry.counts)).toBeLessThanOrEqual(1)
    expect(geometry.bulk).toHaveLength(3)
    expect(Math.max(...geometry.bulk) - Math.min(...geometry.bulk)).toBeLessThanOrEqual(1)
    expect(geometry.serverOrder).toBe(true)
    expect(geometry.overflow).toBe(false)
  }
  await check(260)
  await page.screenshot({ path: info.outputPath("sidebar-260-light.png"), animations: "disabled" })
  await expect(page.locator(".side-actions .side-action").first().locator("svg path")).toHaveCount(2)
  // 多选入口仍然可以切换选择模式，添加仍独立。
  await page.locator(".server-bulk").click()
  await expect(page.locator(".server-bulk")).toHaveText("完成")
  await page.locator(".server-bulk").click()
  const sash = page.getByRole("separator", { name: "调整侧栏宽度", exact: true })
  await sash.focus()
  for (let i = 0; i < 10; i++) await sash.press("ArrowRight")
  await check(420)
  await page.reload()
  await check(420)
  await sash.focus()
  for (let i = 0; i < 10; i++) await sash.press("ArrowLeft")
  await page.setViewportSize({ width: 900, height: 800 })
  await check(260)
  await page.evaluate(() => localStorage.setItem("dawn.global.theme", "dark"))
  await page.reload()
  await check(260)
  await page.screenshot({ path: info.outputPath("sidebar-260-dark-900.png"), animations: "disabled" })
  await page.addInitScript(() => localStorage.setItem("dawn.global.lang", "en"))
  await page.reload()
  await expect(page.locator('.side-section[data-section="projects"] .side-section-title')).toHaveText("Projects")
  await check(260)
  const buttons = page.locator(".side-section .side-bulk, .side-section .server-bulk")
  await expect(buttons).toHaveCount(3)
  for (const button of await buttons.all()) expect(await button.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath("sidebar-260-english.png"), animations: "disabled" })
})


test("顶栏18px品牌保留28px按钮和32px标志", async ({ dawn }) => {
  const { page } = dawn
  const geometry = await page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    return {
      buttons: [...document.querySelectorAll('.topbar-navigation > button')].map(e => ({width:e.getBoundingClientRect().width, height:e.getBoundingClientRect().height})),
      brand: document.querySelector('.brand-name')!.textContent,
      font: getComputedStyle(document.querySelector('.brand-name')!).fontSize,
      logo: rect('.brand-mark').width,
      sidebar: rect('.sidebar').width,
      endPadding: rect('.sidebar').right - rect('.shortcut-toggle').right,
    }
  })
  expect(geometry.buttons).toEqual(Array.from({ length: 2 }, () => ({ width: 28, height: 32 })))
  expect(geometry.brand).toBe('DAWN Science')
  expect(geometry.font).toBe('18px')
  expect(geometry.logo).toBe(32)
  expect(geometry.sidebar).toBe(260)
  expect(geometry.endPadding).toBeGreaterThanOrEqual(4)
  expect(geometry.endPadding).toBeLessThanOrEqual(6)
})
