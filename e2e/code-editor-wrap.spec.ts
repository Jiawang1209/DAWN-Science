import { test, expect, 在项目里开会话 } from './fixtures.js'

test.use({ dawnOptions: { reply: '```python\nprint(42)\n```' } })

test('word wrap fits long script lines and can be toggled without editing the script', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.locator('.conversation .composer textarea').fill('长脚本自动换行体验')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  await page.setViewportSize({ width: 1080, height: 900 })
  const pane = page.getByRole('region', { name: '代码编辑区', exact: true })
  const editor = pane.getByRole('textbox', { name: '脚本代码编辑器', exact: true })
  const text = 'label = "' + 'a long scientific plot label '.repeat(15) + '"\nprint(label)'
  await editor.fill(text)
  const toggle = pane.getByRole('button', { name: '自动换行', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const lineHeight = () => pane.locator('.cm-line').first().evaluate(el => el.getBoundingClientRect().height)
  const horizontalOverflow = () => pane.locator('.cm-scroller').evaluate(el => el.scrollWidth > el.clientWidth + 1)
  const source = () => pane.locator('.cm-content').evaluate(el => {
    const node = el as HTMLElement & { cmTile: { root: { view: { state: { sliceDoc(): string } } } } }
    return node.cmTile.root.view.state.sliceDoc()
  })
  await expect.poll(lineHeight).toBeGreaterThan(60)
  await expect.poll(horizontalOverflow).toBe(false)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(lineHeight).toBeLessThan(40)
  await expect.poll(horizontalOverflow).toBe(true)
  expect(await source()).toBe(text)

  await pane.getByRole('button', { name: '收起代码编辑区', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(await source()).toBe(text)
  await toggle.click()
  await expect.poll(horizontalOverflow).toBe(false)
  expect(await source()).toBe(text)
  const controlsFit = await pane.locator('.code-editor-actions').evaluate(el => {
    const bounds = el.getBoundingClientRect()
    return [...el.querySelectorAll('button')].every(button => {
      const r = button.getBoundingClientRect()
      return r.width >= 20 && r.left >= bounds.left - 1 && r.right <= bounds.right + 1
    })
  })
  expect(controlsFit).toBe(true)
  await page.screenshot({ path: 'output/playwright/code-editor/word-wrap.png' })
})
