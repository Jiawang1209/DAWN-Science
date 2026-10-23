import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

test('DAWN and Normal use the desktop model, preserve Shell state, and refuse pending input', async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page); await 等进了对话(page)
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  const dock = page.locator('.main .dock')
  await expect(dock.locator('.term-host')).toBeVisible()
  const terminalId = await page.evaluate(async () => {
    const p = await window.dawn!.invoke('listProjects', {}) as any
    const s = await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any
    return s.data.find((s: any) => s.kind === 'pty').sessionId as string
  })
  const type = async (command: string) => { await dock.locator('.xterm-helper-textarea').focus(); await page.keyboard.type(command); await page.keyboard.press('Enter') }
  const text = async () => stripVTControlCharacters(await page.evaluate(async id => {
    const result = await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any
    return result.data.terminal ?? ''
  }, terminalId))
  const agent = dock.getByRole('button', { name: 'DAWN 模式', exact: true })
  const normal = dock.getByRole('button', { name: 'Normal 模式', exact: true })
  await type('export DAWN_MODE_SAMPLE=preserved; printf "%s|%s|%s" "$$" "$PWD" "$DAWN_MODE_SAMPLE" > before.txt')
  await expect.poll(() => existsSync(join(workspace, 'before.txt'))).toBe(true)
  await dock.locator('.xterm-helper-textarea').focus(); await page.keyboard.type('echo $')
  await agent.click()
  await expect(dock.getByRole('alert')).toContainText('空闲 Shell')
  await expect(normal).toHaveAttribute('aria-pressed', 'true')
  await dock.locator('.xterm-helper-textarea').focus(); await page.keyboard.press('Control+u')
  await agent.click()
  await expect(agent).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  await expect.poll(text).toContain('Agent · deepseek/')
  await type('这是桌面 CLI 连接验收，请简短回答。')
  await expect.poll(async () => (await text()).split('DAWN ›').length, { timeout: 30000 }).toBeGreaterThan(2)
  await normal.click()
  await expect(normal).toHaveAttribute('aria-pressed', 'true')
  await type('printf "%s|%s|%s" "$$" "$PWD" "$DAWN_MODE_SAMPLE" > after.txt')
  await expect.poll(() => existsSync(join(workspace, 'after.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'after.txt'), 'utf8')).toBe(readFileSync(join(workspace, 'before.txt'), 'utf8'))
  await type('dawn')
  await expect(agent).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  await type('/exit')
  await expect(normal).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.main .composer-card:visible')).toHaveCount(0)
})
