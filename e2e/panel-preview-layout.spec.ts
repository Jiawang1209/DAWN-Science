import { test, expect, 进坞, 进设置, 开一段临时会话 } from './fixtures.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

test('新建任务的产物是空态，切离已有会话不保留加载状态', async ({ dawn }) => {
  const { page } = dawn
  await 进坞(page, '产物')
  const panel = page.locator('.right-dock')
  await expect(panel.getByText('开始任务后查看产物', { exact: true })).toBeVisible()
  await expect(panel.getByText('正在取产物清单', { exact: true })).toHaveCount(0)
  await 开一段临时会话(page)
  await 进坞(page, '产物')
  await expect(panel.getByText('这段会话还没有生成文件', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await expect(panel.getByText('开始任务后查看产物', { exact: true })).toBeVisible()
  await expect(panel.locator('.artifact-row')).toHaveCount(0)
})

test('保存过高文件树后，PDF和图片仍优先完整预览，拖动及缩窗可用', async ({ dawn }) => {
  const { page, app, workspace } = dawn
  writeFileSync(join(workspace, '图.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="900"><rect width="500" height="900" fill="#208a7b"/></svg>')
  writeFileSync(join(workspace, '图2.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="900"><rect width="500" height="900" fill="#2876a0"/></svg>')
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842]); pdf.addPage([595, 842])
  writeFileSync(join(workspace, '报告.pdf'), await pdf.save())
  await page.evaluate(() => localStorage.setItem('dawn.global.file-tree-height', '600'))
  await page.reload()
  await 进坞(page, '文件')
  await page.getByRole('button', { name: /^报告\.pdf/ }).click()
  const tree = page.locator('.file-tree-box')
  const preview = page.locator('.file-preview')
  const canvas = preview.locator('canvas')
  await expect(canvas).toHaveAttribute('data-rendered', 'true')
  await expect.poll(async () => (await preview.boundingBox())!.height / (await tree.boundingBox())!.height).toBeGreaterThan(1.8)
  const inside = async (selector: string) => preview.evaluate((el, sel) => {
    const outer = el.getBoundingClientRect(), inner = el.querySelector(sel)!.getBoundingClientRect()
    return inner.top >= outer.top && inner.bottom <= outer.bottom + 1
  }, selector)
  expect(await inside('canvas')).toBe(true)
  expect(await inside('.pdf-page-controls')).toBe(true)
  await page.screenshot({ path: 'tmp/ui-refresh-verification/panel-layout-pdf.png', animations: 'disabled' })
  await preview.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-page', '2')
  await expect(canvas).toHaveAttribute('data-rendered', 'true')
  await page.getByRole('button', { name: /^图\.svg/ }).click()
  const image = preview.locator('img')
  await expect(image).toBeVisible()
  expect(await inside('img')).toBe(true)
  const sash = page.getByRole('separator', { name: '调整文件树高度', exact: true })
  const before = (await tree.boundingBox())!.height
  await sash.press('ArrowDown')
  await expect.poll(async () => (await tree.boundingBox())!.height).toBeGreaterThan(before + 5)
  const manual = (await tree.boundingBox())!.height
  await page.getByRole('button', { name: /^图2\.svg/ }).click()
  await expect.poll(async () => (await tree.boundingBox())!.height).toBeCloseTo(manual, 0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 650))
  await expect.poll(async () => (await preview.boundingBox())!.height).toBeGreaterThan(120)
  expect(await inside('img')).toBe(true)
  await page.screenshot({ path: 'tmp/ui-refresh-verification/panel-layout-small.png', animations: 'disabled' })
  await 进设置(page, '外观')
  await page.getByRole('radio', { name: '暗色', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await 进坞(page, '文件')
  await page.getByRole('button', { name: /^报告\.pdf/ }).click()
  await expect(canvas).toHaveAttribute('data-rendered', 'true')
  expect(await inside('canvas')).toBe(true)
  expect(await inside('.pdf-page-controls')).toBe(true)
  await page.screenshot({ path: 'tmp/ui-refresh-verification/panel-layout-dark.png', animations: 'disabled' })
})
