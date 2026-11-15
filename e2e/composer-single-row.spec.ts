import { test, expect, 在项目里开会话 } from './fixtures.js'

test.use({ dawnOptions: { reply: '```python\nprint(42)\n```' } })
test('composer tools stay beside model/send with the side editor open at normal desktop widths', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.locator('.conversation .composer textarea').fill('侧边编辑输入栏检查')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  const footer = page.locator('.conversation .composer-footer')
  for (const width of [1600, 1280, 1080]) {
    await page.setViewportSize({ width, height: 900 })
    const geometry = await footer.evaluate(el => {
      const bounds = el.getBoundingClientRect()
      const controls = ['.attach-trigger', '.dock-toggle', '.perm-pill-trigger', '.ctx-meter-trigger', '.model-trigger', '.send-btn'].flatMap(selector => {
        const node = el.querySelector(selector)
        if (!node) return []
        const r = node.getBoundingClientRect()
        return [{ x: r.x, y: r.y, width: r.width, height: r.height }]
      })
      return { controls, left: bounds.left, right: bounds.right, overflows: el.scrollWidth > el.clientWidth }
    })
    const centers = geometry.controls.map(r => r.y + r.height / 2)
    expect(Math.max(...centers) - Math.min(...centers), `footer wraps at ${width}px`).toBeLessThanOrEqual(2)
    expect(geometry.overflows).toBe(false)
    for (const box of geometry.controls) {
      expect(box.width).toBeGreaterThanOrEqual(15)
      expect(box.x).toBeGreaterThanOrEqual(geometry.left - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(geometry.right + 1)
    }
  }
  await footer.locator('.perm-pill-trigger').click()
  await expect(page.getByRole('menu', { name: '工具权限', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await footer.locator('.model-trigger').click()
  await expect(page.getByRole('menu', { name: '切换模型', exact: true })).toBeVisible()
  await footer.locator('.model-trigger').click()
  await expect(page.getByRole('menu', { name: '切换模型', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'output/playwright/code-editor/composer-single-row.png' })
})
