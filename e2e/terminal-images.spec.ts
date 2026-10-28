import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { Page } from '@playwright/test'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
async function open(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page)
  await page.locator('.composer-card textarea.composer-field').fill('原会话的草稿 IMAGE_ORIGINAL_DRAFT')
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.dock .term-host')).toBeVisible()
  await expect.poll(async () => {
    const tail = await page.locator('.dock .xterm-screen').innerText()
    return stripVTControlCharacters(tail).trimEnd().endsWith('$')
  }).toBe(true)
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  return page.evaluate(async () => {
    const p = (await window.dawn!.invoke('listProjects', {}) as any).data
    const s = (await window.dawn!.invoke('listSessions', { projectId: p[0].projectId }) as any).data
    const terminalId = s.find((x: any) => x.kind === 'pty').sessionId
    const state = (await window.dawn!.invoke('getTerminalAgentMode', { terminalId }) as any).data
    return { terminalId, sessionId: state.sessionId }
  })
}
async function text(page: Page, value: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(value); await page.keyboard.press('Enter')
}
async function drop(page: Page) {
  await page.locator('.dock .term-host').evaluate((el, data) => {
    const file = new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], '拖入图.png', { type: 'image/png' })
    const dt = new DataTransfer(); dt.items.add(file)
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, png)
}

test('pastes a real clipboard image, previews inline, and continues the same image conversation in the GUI', async ({ dawn }) => {
  const { page, app } = dawn, target = await open(page)
  await app.evaluate(({ clipboard, nativeImage }, data) => clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(data, 'base64'))), png)
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
  await expect(page.locator('.terminal-attachment')).toHaveCount(1)
  expect((await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, target.sessionId)).items.filter((x: any) => x.type === 'turn' && x.who === 'user')).toHaveLength(0)
  await text(page, '请分析这张图片 IMAGE_PASTE_ROUND')
  await expect(page.locator('.terminal-attachment')).toHaveCount(0)
  const inline = page.locator('.terminal-inline-image').first()
  await expect(inline.locator('img')).toBeVisible()
  await inline.click()
  await expect(page.getByRole('dialog', { name: '图片预览', exact: true })).toBeVisible()
  await expect(page.locator('.terminal-image-preview > img')).toHaveJSProperty('naturalWidth', 2)
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .turn-image')).toHaveCount(1)
  await expect(page.locator('.main')).toContainText('收到了 1 张图')
  const box = page.locator('.main textarea.composer-field')
  await box.fill('继续分析刚才那张原图 IMAGE_GUI_FOLLOWUP'); await box.press('Enter')
  await expect.poll(async () => {
    const snapshot = (await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, target.sessionId))
    return snapshot.items.filter((x: any) => x.type === 'turn' && x.who === 'agent' && x.final).length
  }).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect(page.locator('.terminal-inline-image img').first()).toBeVisible()
})

test('dragged images can be removed, are not added to the hidden composer, and Normal does not attach', async ({ dawn }) => {
  const { page } = dawn, target = await open(page)
  await drop(page)
  await expect(page.locator('.terminal-attachment')).toHaveCount(1)
  await page.getByRole('button', { name: '移除 拖入图.png', exact: true }).click()
  await expect(page.locator('.terminal-attachment')).toHaveCount(0)
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await drop(page)
  const draft = await page.locator('.main textarea.composer-field').inputValue()
  expect(draft).toBe('原会话的草稿 IMAGE_ORIGINAL_DRAFT')
  const staged = await page.evaluate(async terminalId => (await window.dawn!.invoke('getTerminalAgentAttachments', { terminalId }) as any).data, target.terminalId)
  expect(staged.pending).toHaveLength(0)
})

test.describe('output pictures', () => {
  test.use({ dawnOptions: { reply: '图已生成。\n\n![终端图表](plot.png)' } })
  test('renders verified image files returned by the Agent and opens their full preview', async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, 'plot.png'), Buffer.from(png, 'base64'))
    await open(page)
    await text(page, '请返回图表 IMAGE_OUTPUT_ROUND')
    const image = page.getByRole('button', { name: '放大 plot.png', exact: true })
    await expect(image.locator('img')).toBeVisible()
    await image.click()
    await expect(page.getByRole('dialog', { name: '图片预览', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '图片预览', exact: true })).toHaveCount(0)
  })
})


test.describe('picture capability', () => {
  test.use({ dawnOptions: { modelsWithoutImages: true } })
  test('rejects attachment explicitly when neither the selected model nor a visual service can read it', async ({ dawn }) => {
    const { page } = dawn
    await open(page); await drop(page)
    await expect(page.locator('.terminal-image-error')).toContainText('当前模型不支持图片')
    await expect(page.locator('.terminal-attachment')).toHaveCount(0)
  })
})
