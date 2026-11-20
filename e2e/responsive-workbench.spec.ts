import { test, expect, 在项目里开会话, 进坞 } from './fixtures.js'

async function geometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector)!
      const b = el.getBoundingClientRect()
      return { x: b.x, width: b.width, right: b.right, font: getComputedStyle(el).fontSize }
    }
    return { sidebar: rect('.sidebar'), main: rect('main.main'), dock: rect('.right-dock'),
      button: rect('main.main .send-btn'), viewport: innerWidth }
  })
}

test('窗口尺寸往返时三栏协调变化，控件不缩放且面板不越界', async ({ dawn }, info) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  let button: { width: number; font: string } | undefined
  for (const width of [1440, 1920, 2560, 3840, 1280, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const sidebar = Math.min(420, Math.max(300, Math.round(width * 300 / 1440)))
    const mainMin = Math.min(420, width - sidebar - 280 - 24)
    const dock = Math.min(Math.round(width / 3), width - sidebar - mainMin - 24)
    await expect.poll(async () => Math.round((await geometry(page)).sidebar.width)).toBe(sidebar)
    await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(dock)
    const actual = await geometry(page)
    expect(actual.main.width).toBeGreaterThanOrEqual(mainMin)
    expect(actual.dock.width).toBeGreaterThanOrEqual(280)
    expect(actual.dock.right).toBeLessThanOrEqual(width)
    expect(actual.main.x).toBeGreaterThanOrEqual(actual.sidebar.right)
    expect(actual.main.right).toBeLessThanOrEqual(actual.dock.x)
    if (button) {
      expect(actual.button.width).toBeCloseTo(button.width, 0)
      expect(actual.button.font).toBe(button.font)
    } else button = actual.button
    await page.screenshot({ path: info.outputPath(`workbench-${width}.png`) })
  }
})

test('手动调宽保留比例，窗口夹限不写回，重载及重启后可恢复', async ({ dawn }) => {
  let { page } = dawn
  await page.setViewportSize({ width: 1440, height: 900 })
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  const sidebarSash = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  const box = (await sidebarSash.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 48, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await geometry(page)).sidebar.width)).toBe(348)
  await page.getByRole('separator', { name: '调整面板宽度', exact: true }).press('ArrowLeft')
  await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(496)
  const saved = await page.evaluate(() => localStorage.getItem('dawn.global.workbench-proportions'))
  for (const width of [1920, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(async () => Math.round((await geometry(page)).sidebar.width)).toBe(Math.min(420, Math.max(300, Math.round(width * 348 / 1440))))
    await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(width === 900 ? 280 : Math.round(width * 496 / 1440))
    expect(await page.evaluate(() => localStorage.getItem('dawn.global.workbench-proportions'))).toBe(saved)
  }
  await page.reload()
  await 进坞(page, '文件')
  await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(496)
  page = await dawn.重开()
  await page.setViewportSize({ width: 1440, height: 900 })
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  await expect.poll(async () => Math.round((await geometry(page)).sidebar.width)).toBe(348)
  await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(496)
})

test('折叠侧栏释放给正文，设置面板沿用相同响应式宽度', async ({ dawn }) => {
  const { page } = dawn
  await page.setViewportSize({ width: 1920, height: 900 })
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(640)
  const expanded = await geometry(page)
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect.poll(async () => Math.round((await geometry(page)).sidebar.width)).toBe(0)
  await expect.poll(async () => Math.round((await geometry(page)).main.width - expanded.main.width)).toBe(400)
  expect(Math.round((await geometry(page)).dock.width)).toBe(640)
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  for (const width of [1920, 1280, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.locator('.settings-column').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(Math.round(width / 3))
    const sash = page.locator('.settings-column [role="separator"]')
    await expect(sash).toHaveAttribute('aria-valuenow', String(Math.round(width / 3)))
  }
})

test('文件加宽与收窄在单栏和自动双栏下都有实际效果', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  const files = page.locator('.files-view')
  for (const [width, normal, expanded] of [[1280, 427, 536], [1920, 640, 960]] as const) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(normal)
    await files.getByRole('button', { name: '加宽', exact: true }).click()
    await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(expanded)
    if (width === 1280) await expect(files).not.toHaveClass(/files-wide/)
    await files.getByRole('button', { name: '收窄', exact: true }).click()
    await expect.poll(async () => Math.round((await geometry(page)).dock.width)).toBe(normal)
  }
})
