import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { Page, Locator } from '@playwright/test'

test.use({ dawnOptions: { toolCall: { when: 'CLI界面验收', toolName: 'bash', args: { command: 'printf "%s|%s" "$PWD" "$DAWN_CLI_SAMPLE" > cli-electron.txt; printf CLI_ELECTRON_OK' }, perTurn: true } } })
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'"
async function open(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page)
  await page.locator('.composer-card .composer-field').fill('这份桌面对话草稿要保留')
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  const dock = page.locator('.main .dock')
  await expect(dock.locator('.term-host')).toBeVisible()
  return dock
}
async function type(page: Page, dock: Locator, command: string) {
  await dock.locator('.xterm-helper-textarea').focus(); await page.keyboard.type(command); await page.keyboard.press('Enter')
}
async function terminal(page: Page) {
  return page.evaluate(async () => {
    const projects = await window.dawn!.invoke('listProjects', {}) as any
    const sessions = await window.dawn!.invoke('listSessions', { projectId: projects.data[0].projectId }) as any
    const terminal = sessions.data.find((s: any) => s.kind === 'pty')
    return (await window.dawn!.invoke('getTerminalControl', { terminalId: terminal.sessionId }) as any).data
  })
}
async function text(page: Page, id: string) {
  return stripVTControlCharacters(await page.evaluate(async id => {
    const result = await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any
    return result.data.terminal ?? ''
  }, id))
}
test('整页原生终端调用真正 dawn，只有一个输入，退出回原 Shell 并保留桌面草稿', async ({ dawn }) => {
  const { page, workspace } = dawn, dock = await open(page)
  await expect(page.locator('.main .composer-card:visible')).toHaveCount(0)
  await expect(page.locator('.terminal-ai-input')).toHaveCount(0)
  const state = await terminal(page)
  await type(page, dock, `unset DAWN_CLI_DESCRIPTOR DAWN_TERMINAL_ID; export PATH=${quote(resolve('bin'))}:"$PATH" DAWN_API_KEY=isolated-preview-key DAWN_CLI_SAMPLE=41; printf "%s|%s" "$$" "$PWD" > shell-before.txt; dawn`)
  await expect.poll(() => text(page, state.id)).toContain('> DAWN')
  await type(page, dock, 'CLI界面验收：在当前目录执行并核对环境。')
  await expect.poll(() => existsSync(join(workspace, 'cli-electron.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'cli-electron.txt'), 'utf8')).toBe(`${workspace}|41`)
  await expect.poll(() => text(page, state.id)).toContain('CLI_ELECTRON_OK')
  await type(page, dock, '/exit')
  await expect.poll(() => text(page, state.id)).toContain('已退出 Agent，返回 Shell。')
  await type(page, dock, 'printf "%s|%s" "$$" "$PWD" > shell-after.txt')
  await expect.poll(() => existsSync(join(workspace, 'shell-after.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'shell-after.txt'), 'utf8')).toBe(readFileSync(join(workspace, 'shell-before.txt'), 'utf8'))
  expect((await terminal(page)).pid).toBe(state.pid)
  const returnButton = dock.getByRole('button', { name: '返回会话', exact: true })
  await returnButton.hover()
  await expect(dock.getByRole('tooltip')).toHaveText('返回会话')
  await returnButton.click()
  await expect(page.locator('.main .composer-card:visible')).toHaveCount(1)
  await expect(page.locator('.composer-field')).toHaveValue('这份桌面对话草稿要保留')
})
test('900×700 原生终端占满主区，真实行列尺寸同步，退出工作区不杀进程', async ({ dawn }) => {
  const { page, app, workspace } = dawn, dock = await open(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 700))
  await expect.poll(async () => (await dock.boundingBox())!.height / (await page.locator('.main').boundingBox())!.height).toBeGreaterThan(.95)
  await type(page, dock, 'stty size > terminal-size.txt')
  await expect.poll(() => existsSync(join(workspace, 'terminal-size.txt'))).toBe(true)
  const state = await terminal(page)
  expect(readFileSync(join(workspace, 'terminal-size.txt'), 'utf8').trim()).toBe(`${state.rows} ${state.cols}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await dock.getByRole('button', { name: '返回会话', exact: true }).click()
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  expect((await terminal(page)).pid).toBe(state.pid)
})
