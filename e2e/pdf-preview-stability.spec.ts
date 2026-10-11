import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { test, expect, 在项目里开会话, 进坞 } from './fixtures.js'

test('合法 PDF 预览后主窗口仍存活，且可以切换文件', async ({ dawn }) => {
  const { page, workspace } = dawn
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([480, 440]).drawText('PDF preview stability', { x: 40, y: 360, size: 20, font })
  writeFileSync(join(workspace, 'preview-stability.pdf'), await doc.save())
  writeFileSync(join(workspace, 'preview-next.txt'), 'After PDF preview')
  await 在项目里开会话(page)
  await 进坞(page, '文件')
  await page.getByRole('button', { name: '刷新当前文件夹', exact: true }).click()
  await page.getByText('preview-stability.pdf', { exact: true }).click()
  await expect(page.locator('.preview canvas')).toHaveAttribute('data-rendered', 'true')
  // 阅读器异步初始化后再交互，不能只检查瞬间挂载便退出测试。
  await page.waitForTimeout(1800)
  await expect(page.getByRole('button', { name: '用系统程序打开', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', caret: 'hide', path: 'tmp/ui-refresh-verification/after/pdf-preview.png' })
  await page.getByText('preview-next.txt', { exact: true }).click()
  await expect(page.locator('.preview')).toContainText('After PDF preview')
})
