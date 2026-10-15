import { test, expect, 开一段临时会话, 在项目里开会话, 进坞 } from './fixtures.js'

for (const screen of ['welcome', 'conversation']) {
  test(`文本粘贴遵守光标与选区 · ${screen}`, async ({ dawn }) => {
    const { page, app } = dawn
    if (screen === 'conversation') await 开一段临时会话(page)
    const input = page.locator('.composer-box textarea').first()
    const oldText = await app.evaluate(({ clipboard }) => clipboard.readText())
    try {
      for (const end of [2, 4]) {
        await input.fill('前段后段尾部')
        await input.evaluate((el: HTMLTextAreaElement, end) => { el.focus(); el.setSelectionRange(2, end) }, end)
        await app.evaluate(({ clipboard }) => clipboard.writeText('data.csv'))
        await input.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
        await expect(input).toHaveValue(end === 2 ? '前段data.csv后段尾部' : '前段data.csv尾部')
        expect(await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([10, 10])
        await input.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
        await expect(input).toHaveValue('前段后段尾部')
        await input.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z')
        await expect(input).toHaveValue(end === 2 ? '前段data.csv后段尾部' : '前段data.csv尾部')
        await input.press('x')
        await expect(input).toHaveValue(end === 2 ? '前段data.csvx后段尾部' : '前段data.csvx尾部')
      }
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), oldText)
    }
  })
}

test('延迟识别期间在重复字符前键入，粘贴锚点跟随真实编辑选区', async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page)
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('dawn:shell:clipboard-files')
    ipcMain.handle('dawn:shell:clipboard-files', () => new Promise<string[]>(resolve => { setTimeout(() => resolve([]), 500) }))
  })
  const input = page.locator('.composer-box textarea').first()
  await input.fill('aaaaX')
  await input.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(2, 2) })
  // 合成粘贴只替代操作系统剪贴板，后续键入与 beforeinput 来自真实 Chromium。
  await input.evaluate((el: HTMLTextAreaElement) => {
    const data = new DataTransfer(); data.setData('text/plain', 'a.csv')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await input.press('Home'); await input.press('a')
  await expect(input).toHaveValue('aaaa.csvaaX')
})

test('侧边会话的选区替换独立于主会话草稿', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const main = page.locator('main.main .composer-box textarea')
  await main.fill('主会话草稿')
  await 进坞(page, '对话')
  await page.locator('aside.right-dock').getByRole('button', { name: '另开一段', exact: true }).click()
  const side = page.locator('aside.right-dock .composer-box textarea')
  await expect(side).toBeVisible()
  await side.fill('前段后段尾部')
  await side.evaluate((el: HTMLTextAreaElement) => {
    el.focus(); el.setSelectionRange(2, 4)
    const data = new DataTransfer(); data.setData('text/plain', 'data.csv')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(side).toHaveValue('前段data.csv尾部')
  await expect(main).toHaveValue('主会话草稿')
})
