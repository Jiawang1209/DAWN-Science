import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { discoverKernelSpecs } from '../src/kernel/specs.js'
import { test, expect, 在项目里开会话, type DawnFixture } from './fixtures.js'

const r = process.env.DAWN_E2E_R ?? discoverKernelSpecs().specs.find(s => s.language?.toLowerCase() === 'r')?.executable
let ready = false
if (r) try {
  execFileSync(r, ['--vanilla', '--slave', '-e', 'quit(status=if(requireNamespace("IRkernel",quietly=TRUE)&&requireNamespace("ggplot2",quietly=TRUE))0 else 1)'], { stdio: 'ignore', timeout: 20000 })
  ready = true
} catch { /* The real R scenario reports its missing prerequisites explicitly. */ }

const script = `library(ggplot2)
options(repr.plot.width = 6, repr.plot.height = 4, repr.plot.res = 100)
p <- ggplot(iris, aes(Sepal.Length, Petal.Length, color = Species)) +
  geom_point(size = 2.4) + theme_minimal(base_size = 12) +
  labs(title = "First figure")
print(p)`
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
test.use({ dawnOptions: { realKernels: true, reply: '在侧边修改样式，再选区运行绘图语句。\n\n```r\n' + script + '\n```' } })

function originalBytes(src: string) {
  return src.includes(';base64,') ? Buffer.from(src.slice(src.indexOf(',') + 1), 'base64') : Buffer.from(decodeURIComponent(src.slice(src.indexOf(',') + 1)), 'utf8')
}

async function saveNextImage(dawn: DawnFixture, path: string) {
  await dawn.app.evaluate(({ BrowserWindow }, target) => {
    BrowserWindow.getAllWindows()[0]!.webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(target)
    })
  }, path)
}

test('real R plots keep session history, enlarge with keyboard access, and export original PNG/SVG bytes', async ({ dawn }) => {
  test.skip(!ready || !r, '本机缺少可用 R、IRkernel 或 ggplot2；未执行真实绘图验证')
  test.setTimeout(120000)
  const { page } = dawn
  expect((await page.evaluate(path => window.dawn!.invoke('setInterpreter', { language: 'R', path }), r!)).ok).toBe(true)
  await 在项目里开会话(page)
  await page.locator('.conversation .composer textarea').fill('R 绘图完整流程')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  const pane = page.getByRole('region', { name: '代码编辑区', exact: true })
  const editor = pane.getByRole('textbox', { name: '脚本代码编辑器', exact: true })
  await pane.getByRole('button', { name: '运行脚本', exact: true }).click()
  const gallery = pane.getByRole('region', { name: '会话图形历史', exact: true })
  await expect(gallery).toBeVisible({ timeout: 45000 })
  const image = gallery.locator('img.kout-img')
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const first = (await image.getAttribute('src'))!
  const outputBounds = await pane.locator('.code-editor-output').boundingBox()
  for (const name of ['上一张图', '下一张图', '导出图片']) {
    const bounds = await gallery.getByRole('button', { name, exact: true }).boundingBox()
    expect(bounds!.y).toBeGreaterThanOrEqual(outputBounds!.y)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(outputBounds!.y + outputBounds!.height)
  }
  await gallery.getByRole('button', { name: '放大图形', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '图形预览', exact: true })
  await expect(modal).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await modal.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await modal.getByRole('button', { name: '实际尺寸', exact: true }).click()
  await expect(modal.getByRole('button', { name: '适应窗口', exact: true })).toBeVisible()
  const pngPath = join(dawn.dir, 'original-plot.png')
  await saveNextImage(dawn, pngPath)
  await modal.getByRole('button', { name: '导出图片', exact: true }).click()
  await expect.poll(() => existsSync(pngPath) && readFileSync(pngPath).equals(originalBytes(first))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(gallery.getByRole('button', { name: '放大图形', exact: true })).toBeFocused()

  const execute = async (code: string) => {
    await editor.fill(script + '\n' + code)
    await editor.press(`${modifier}+a`)
    await editor.press('ArrowRight')
    // Home stops at a visual wrap boundary. Select the whole logical line instead.
    await editor.press(process.platform === 'darwin' ? 'Control+l' : 'Alt+l')
    const selected = await editor.evaluate(el => {
      const view = (el as HTMLElement & { cmTile: { root: { view: { state: { selection: { main: { from: number; to: number } }; sliceDoc(from: number, to: number): string } } } } }).cmTile.root.view
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    })
    expect(selected).toBe(code)
    await pane.getByRole('button', { name: '运行选区', exact: true }).click()
  }
  const history = async () => {
    const select = gallery.getByRole('combobox', { name: '选择历史图形', exact: true })
    if (!await select.isVisible()) await gallery.getByRole('button', { name: '图形列表', exact: true }).click()
    return select
  }
  await execute('print(p + labs(title = "Second figure")); print(p + labs(title = "Third figure"))')
  await expect((await history()).locator('option')).toHaveCount(3)
  const third = (await image.getAttribute('src'))!
  expect(third).not.toBe(first)
  await gallery.getByRole('button', { name: '放大图形', exact: true }).click()
  await modal.getByRole('button', { name: '上一张图', exact: true }).click()
  await expect(modal).toBeVisible()
  await expect(modal.locator('img')).not.toHaveAttribute('src', third)
  await modal.getByRole('button', { name: '上一张图', exact: true }).click()
  await expect(modal.locator('img')).toHaveAttribute('src', first)
  await modal.getByRole('button', { name: '关闭图形预览', exact: true }).click()

  await execute('print(p + labs(title = "Fourth figure"))')
  await expect((await history()).locator('option')).toHaveCount(4)
  await expect(image).toHaveAttribute('src', first)
  await (await history()).selectOption({ index: 3 })
  const fourth = (await image.getAttribute('src'))!
  expect(fourth).not.toBe(third)
  await execute('cat("PLOT_CONSOLE_OK\\n"); stop("PLOT_EXPECTED_ERROR")')
  await expect(pane).toContainText('PLOT_EXPECTED_ERROR', { timeout: 15000 })
  await expect(image).toHaveAttribute('src', fourth)
  await expect((await history()).locator('option')).toHaveCount(4)

  await execute(`IRdisplay::display_svg('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="white"/><text x="12" y="50">SVG Ω</text></svg>')`)
  await expect((await history()).locator('option')).toHaveCount(5)
  await (await history()).selectOption({ index: 4 })
  await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/)
  const svg = (await image.getAttribute('src'))!
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const svgPath = join(dawn.dir, 'original-plot.svg')
  await saveNextImage(dawn, svgPath)
  await gallery.getByRole('button', { name: '导出图片', exact: true }).click()
  await expect.poll(() => existsSync(svgPath) && readFileSync(svgPath).equals(originalBytes(svg))).toBe(true)
  await dawn.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.session.once('will-download', event => event.preventDefault())
  })
  await gallery.getByRole('button', { name: '导出图片', exact: true }).click()
  await expect(image).toHaveAttribute('src', svg)
  await expect(gallery).not.toContainText('已保存图片')

  await (await history()).selectOption({ index: 3 })
  await page.screenshot({ path: 'output/playwright/code-editor/plot-history-light.png' })
  await gallery.getByRole('button', { name: '放大图形', exact: true }).click()
  await page.screenshot({ path: 'output/playwright/code-editor/plot-enlarged.png' })
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
  await page.screenshot({ path: 'output/playwright/code-editor/plot-history-dark.png' })
  await page.evaluate(() => document.documentElement.classList.remove('dawn-dark'))
  await page.setViewportSize({ width: 1000, height: 740 })
  await expect(gallery.getByRole('button', { name: '导出图片', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await pane.getByRole('button', { name: '收起代码编辑区', exact: true }).click()
  await page.locator('.conversation').getByRole('button', { name: '放大图形', exact: true }).first().click()
  await expect(modal).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  await pane.getByRole('button', { name: '运行结果', exact: true }).click()
  // This toggle may have closed existing retained results; reopen if needed.
  if (!await gallery.isVisible()) await pane.getByRole('button', { name: '运行结果', exact: true }).click()
  await expect((await history()).locator('option')).toHaveCount(5)
  await page.getByRole('button', { name: '在这里再开一段', exact: true }).click()
  await expect(pane).toHaveCount(0)
  await expect(page.locator('.conversation').getByText('还没有对话', { exact: true })).toBeVisible()
  await page.locator('.conversation .composer textarea').fill('新会话没有旧图')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('tab', { name: '新会话没有旧图', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.locator('.conversation').getByRole('button', { name: '在旁边编辑', exact: true }).last().click()
  await pane.getByRole('button', { name: '运行结果', exact: true }).click()
  await expect(gallery).toHaveCount(0)
  await page.getByRole('tab', { name: 'R 绘图完整流程', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  await expect((await history()).locator('option')).toHaveCount(5)
  await page.reload()
  await page.getByText('R 绘图完整流程', { exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  await pane.getByRole('button', { name: '运行结果', exact: true }).click()
  await expect((await history()).locator('option')).toHaveCount(5)
})
