import { test, expect, 开一段临时会话 } from './fixtures.js'

test('narrow and regular conversation columns keep the agent, user and composer edges aligned', async ({ dawn }, info) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.locator('main.main .composer-field').fill('窄窗列对齐检查')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  const readGeometry = () => page.locator('main.main .conversation').evaluate(root => {
      const measure = (selector: string) => {
        const el = root.querySelector(selector) as HTMLElement, rect = el.getBoundingClientRect(), css = getComputedStyle(el)
        return { left: rect.left, right: rect.right, width: rect.width, offsetWidth: el.offsetWidth, clientWidth: el.clientWidth, paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, scrollbarGutter: css.scrollbarGutter, overflowY: css.overflowY, transform: css.transform }
      }
      return { viewport: innerWidth, agent: measure('.turn.agent'), user: measure('.turn.user'), composer: measure('.composer-box'), card: measure('.composer-card'), turns: measure('.turns'), scroll: measure('.turns > div'), inner: measure('.turns-inner') }
    })
  const results: Awaited<ReturnType<typeof readGeometry>>[] = []
  for (const { width, scrollbar } of [{ width: 1080, scrollbar: "thin" }, { width: 1280, scrollbar: "thin" }, { width: 1080, scrollbar: "none" }, { width: 1080, scrollbar: "thin" }]) {
    await page.setViewportSize({ width, height: 808 })
    // Exercise an actual gutter-width change without changing system settings.
    await page.locator("main.main .turns > div").evaluate((el, value) => { (el as HTMLElement).style.scrollbarWidth = value }, scrollbar)
    await page.locator('.body').evaluate(async el => {
      await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    })
    results.push(await readGeometry())
    await page.screenshot({ path: info.outputPath(`thread-${results.length}-${width}-${scrollbar}.png`), animations: 'disabled' })
  }
  const gutter = (index: number) => results[index]!.scroll.offsetWidth - results[index]!.scroll.clientWidth
  expect(gutter(2), 'hidden scrollbar must release its reserved gutter').toBe(0)
  expect(gutter(3), 'restoring the scrollbar must restore its original gutter').toBe(gutter(0))
  await info.attach('column-geometry', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  console.log('THREAD_COLUMN_GEOMETRY', JSON.stringify(results))
  for (const m of results) {
    expect(Math.abs(m.agent.left - m.composer.left), `viewport ${m.viewport}: left`).toBeLessThanOrEqual(2)
    expect(Math.abs(m.agent.right - m.composer.right), `viewport ${m.viewport}: right`).toBeLessThanOrEqual(2)
    expect(Math.abs(m.user.right - m.composer.right), `viewport ${m.viewport}: user right`).toBeLessThanOrEqual(2)
  }
})
