import { test, expect, 在项目里开会话 } from './fixtures.js'

test('a late attachment save failure preserves the next draft through real IPC', async ({ dawn }) => {
  const { app, page } = dawn
  await 在项目里开会话(page)
  // Only replace the isolated fixture's attachment channel; keep the built renderer and IPC bridge.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('dawn:shell:attach-save')
    ipcMain.handle('dawn:shell:attach-save', () => new Promise((_resolve, reject) => {
      ipcMain.once('dawn:audit:reject-attachment', () => reject(new Error('audit attachment failure')))
    }))
  })
  const input = page.locator('.conversation .composer textarea')
  await input.fill('first request')
  await input.evaluate(element => {
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['x,y\n1,2'], 'input.csv', { type: 'text/csv' }))
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboard }))
  })
  await expect(input).toHaveValue('first request @input.csv ')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect.poll(() => app.evaluate(({ ipcMain }) => ipcMain.listenerCount('dawn:audit:reject-attachment'))).toBe(1)
  await input.fill('new unsent request')
  await app.evaluate(({ ipcMain }) => { ipcMain.emit('dawn:audit:reject-attachment') })
  await expect(page.getByText(/audit attachment failure/)).toBeVisible()
  await expect(input).toHaveValue('first request @input.csv\n\nnew unsent request')
  await expect(page.locator('.conversation .composer')).toContainText('input.csv')
})
