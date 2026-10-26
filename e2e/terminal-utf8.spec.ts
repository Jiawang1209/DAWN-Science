import { test, expect } from './fixtures.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Reproduce Finder's missing locale, independently of the test runner's shell.
test.use({ dawnOptions: { env: { LANG: '', LC_ALL: '', LC_CTYPE: '', SHELL: '/bin/zsh' } } })
test.skip(process.platform !== 'darwin', 'The reported regression uses macOS zsh')

test('Chinese paths and editing remain readable, and a Unicode right prompt allows DAWN mode', async ({ dawn }) => {
  const { page, workspace } = dawn
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  const screen = page.locator('.dock .xterm-screen')
  const input = page.locator('.dock .xterm-helper-textarea')
  await expect(screen).toContainText(/[$#%]/)
  const submit = async (text: string) => {
    await input.focus(); await page.keyboard.type(text); await page.keyboard.press('Enter')
  }
  await submit("PROMPT='%1~$ '; RPROMPT='130 ↵'; mkdir -p '中文目录'; cd '中文目录'")
  await expect(screen).toContainText('中文目录$')
  await input.focus(); await page.keyboard.type("printf '%s' '中文输入错'")
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Backspace')
  await expect(screen).toContainText("printf '%s' '中文输入'")
  await page.keyboard.press('End')
  await page.keyboard.type(' > proof.txt')
  await page.keyboard.press('Enter')
  await expect.poll(() => {
    try { return readFileSync(join(workspace, '中文目录', 'proof.txt'), 'utf8') } catch { return '' }
  }).toBe('中文输入')
  await submit('cat proof.txt; echo')
  await expect(screen).toContainText('中文输入')
  await expect(screen).not.toContainText(/�|\\M-|<00[0-9a-f]{2}>/i)
  await input.focus(); await page.keyboard.press('Control+c')
  await expect(screen).toContainText('130 ↵')
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(screen).toContainText('Enter 发送')
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(screen).toContainText('已退出 Agent，返回 Shell')
})
