import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { test, expect, 在项目里开会话, 进坞 } from './fixtures.js'

const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (const [i, color] of [rgb(0, .55, .4), rgb(.1, .35, .8)].entries()) {
  const p = pdf.addPage([600, 460])
  p.drawText(`Scientific figure - page ${i + 1}`, { x: 48, y: 410, font, size: 23 })
  p.drawLine({ start: { x: 50, y: 60 }, end: { x: 560, y: 60 }, thickness: 2 })
  p.drawLine({ start: { x: 50, y: 60 }, end: { x: 50, y: 370 }, thickness: 2 })
  for (let n = 0; n < 18; n++) p.drawCircle({ x: 75 + n * 25, y: 90 + n * 12, size: 5, color })
  p.drawLine({ start: { x: 60, y: 80 }, end: { x: 550, y: 320 }, thickness: 3, color })
}
const data = Buffer.from(await pdf.save()).toString('base64')
test.describe('参考图：图表预览', () => {
  test.use({ dawnOptions: { toolCall: { toolName: 'bash', args: { command: `mkdir -p figures; printf '%s' '${data}' | base64 --decode > figures/fitting.pdf` } } } })
  test('PDF 真正绘制为简洁图表卡，支持翻页、放大及恢复焦点', async ({ dawn }) => {
    const { page } = dawn
    const violations: string[] = []
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await 在项目里开会话(page)
    await page.locator('main.main textarea').fill('生成科研图表')
    await page.locator('main.main textarea').press('Enter')
    const group = page.getByRole('group', { name: '本轮生成的文件' }).last()
    await expect(group).toContainText('已生成 1 个文件', { timeout: 60_000 })
    await group.getByRole('button', { name: '查看产物', exact: true }).click()
    const preview = page.locator('.visual-preview')
    await expect(preview.locator('.preview-head .name')).toHaveText('fitting.pdf')
    await expect(page.locator('embed, iframe')).toHaveCount(0)
    const canvas = preview.locator('canvas')
    await expect(canvas).toHaveAttribute('data-rendered', 'true')
    expect(await canvas.evaluate(el => {
      const c = el as HTMLCanvasElement
      const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let colored = 0
      for (let n = 0; n < pixels.length; n += 4) if (pixels[n+1]! > pixels[n]! + 30 && pixels[n+1]! > pixels[n+2]! + 15) colored++
      return colored
    })).toBeGreaterThan(500)
    await preview.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(canvas).toHaveAttribute('data-page', '2')
    await expect(canvas).toHaveAttribute('data-rendered', 'true')
    expect(await canvas.evaluate(el => {
      const c = el as HTMLCanvasElement, a = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let blue = 0
      for (let n = 0; n < a.length; n += 4) if (a[n+2]! > a[n]! + 50 && a[n+2]! > a[n+1]! + 30) blue++
      return blue
    })).toBeGreaterThan(500)
    const expand = preview.getByRole('button', { name: '放大预览', exact: true })
    await expand.click()
    const dialog = page.getByRole('dialog', { name: 'fitting.pdf', exact: true })
    await expect(dialog.locator('canvas')).toHaveAttribute('data-rendered', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(expand).toBeFocused()
    await page.screenshot({ path: 'tmp/ui-refresh-verification/after/pdf-card-1440.png', animations: 'disabled', caret: 'hide' })
    await page.setViewportSize({ width: 1080, height: 808 })
    await expect(canvas).toHaveAttribute('data-rendered', 'true')
    expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: 'tmp/ui-refresh-verification/after/pdf-card-1080.png', animations: 'disabled', caret: 'hide' })
    expect(violations).toEqual([])
    await preview.getByRole('button', { name: '回到清单', exact: true }).click()
    await expect(page.locator('.artifacts-list')).toBeVisible()
  })
})

test('损坏 PDF 明确报错，仍可切换到另一个文件', async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, 'broken.pdf'), '%PDF-1.7\ninvalid')
  writeFileSync(join(workspace, 'next.txt'), 'Preview remains usable')
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  await page.getByRole('button', { name: /^broken\.pdf/ }).click()
  await expect(page.locator('.visual-preview').getByRole('alert')).toContainText('无法预览 PDF')
  await expect(page.getByRole('button', { name: '用系统程序打开', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^next\.txt/ }).click()
  await expect(page.locator('.preview')).toContainText('Preview remains usable')
})
