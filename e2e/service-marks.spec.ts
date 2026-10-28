import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

test('本地品牌矢量均能绘制，主题色及亮暗背景下可辨认', async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1180, 900))
  const manifest = JSON.parse(readFileSync(resolve('docs/licenses/provider-marks-sources.json'), 'utf8'))
  const assets = manifest.assets.map((asset: { brand: string }) => ({
    brand: asset.brand,
    url: `data:image/svg+xml,${encodeURIComponent(readFileSync(resolve(`src/ui/brand-assets/${asset.brand}.svg`), 'utf8'))}`,
  }))
  const blank = await page.evaluate(async assets => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
    const context = canvas.getContext('2d')!
    const blank: string[] = []
    for (const asset of assets) {
      const image = new Image(); image.src = asset.url; await image.decode()
      context.clearRect(0, 0, 32, 32); context.drawImage(image, 0, 0, 32, 32)
      if (!context.getImageData(0, 0, 32, 32).data.some((value, i) => i % 4 === 3 && value > 0)) blank.push(asset.brand)
    }
    const gallery = document.createElement('section')
    gallery.id = 'service-mark-gallery'
    Object.assign(gallery.style, { position: 'fixed', inset: '24px', zIndex: '3000', padding: '24px', background: 'var(--dawn-surface-elevated)', color: 'var(--dawn-text-1)', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '16px', borderRadius: '12px' })
    for (const asset of assets) {
      const cell = document.createElement('div')
      Object.assign(cell.style, { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', fontSize: '12px' })
      const mark = document.createElement('span'); mark.className = 'svc-mark service-mark'; mark.dataset.serviceMark = asset.brand
      const mask = document.createElement('span'); mask.className = 'service-mark-icon'; mask.style.maskImage = `url("${asset.url}")`
      mark.append(mask); cell.append(mark, document.createTextNode(asset.brand)); gallery.append(cell)
    }
    document.body.append(gallery)
    return blank
  }, assets)
  expect(blank).toEqual([])
  await expect(page.locator('#service-mark-gallery .service-mark-icon')).toHaveCount(42)
  await page.locator('#service-mark-gallery').screenshot({ path: info.outputPath('service-marks-light.png') })
  await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
  await page.locator('#service-mark-gallery').screenshot({ path: info.outputPath('service-marks-dark.png') })
})
