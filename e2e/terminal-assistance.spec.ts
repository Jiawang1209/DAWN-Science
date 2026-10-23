import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

async function openTerminal(page: import('@playwright/test').Page) {
  await 在项目里开会话(page)
  await 等进了对话(page)
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menu', { name: '添加内容' }).getByRole('menuitem', { name: '终端面板', exact: true }).click()
  const dock = page.locator('.main .dock')
  await expect(dock.locator('.xterm-helper-textarea')).toBeAttached()
  await expect(dock.getByRole('button', { name: '交给当前对话' })).toBeEnabled()
  return dock
}
async function type(page: import('@playwright/test').Page, dock: import('@playwright/test').Locator, command: string) {
  await dock.locator('.xterm-helper-textarea').focus()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}
async function send(page: import('@playwright/test').Page, request: string) {
  const composer = page.getByPlaceholder(/输入问题/)
  await composer.fill(request)
  await composer.press('Enter')
}

test('终端协助：矮窗不遮挡发送栏，尺寸随可见终端同步', async ({ dawn }) => {
  const { page, app, workspace } = dawn
  const dock = await openTerminal(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 700))
  await expect.poll(async () => {
    const composer = await page.locator('.composer-card').boundingBox()
    const terminal = await dock.boundingBox()
    return composer!.y + composer!.height <= terminal!.y
  }).toBe(true)
  await type(page, dock, 'stty size > terminal-size.txt')
  await expect.poll(() => existsSync(join(workspace, 'terminal-size.txt'))).toBe(true)
  const dimensions = await page.evaluate(async () => {
    const projects = await window.dawn!.invoke('listProjects', {}) as any
    const sessions = await window.dawn!.invoke('listSessions', { projectId: projects.data[0].projectId }) as any
    const terminal = sessions.data.find((s: any) => s.agentId === 'shell')
    return (await window.dawn!.invoke('getTerminalControl', { terminalId: terminal.sessionId }) as any).data
  })
  expect(readFileSync(join(workspace, 'terminal-size.txt'), 'utf8').trim()).toBe(`${dimensions.rows} ${dimensions.cols}`)
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await expect(dock.getByRole('button', { name: '接回控制' })).toBeVisible()
  await expect(dock.getByRole('button', { name: 'Ctrl-C', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('终端协助：真实 shell 保留环境、模型接续、人工接回', async ({ dawn }) => {
  const { page, workspace } = dawn
  const dock = await openTerminal(page)
  await type(page, dock, 'export DAWN_TERMINAL_SAMPLE=41; printf "%s|%s" "$PWD" "$$" > terminal-human.txt')
  await expect.poll(() => existsSync(join(workspace, 'terminal-human.txt'))).toBe(true)
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await expect(dock.getByText('AI 协助中', { exact: true })).toBeVisible()
  await send(page, '终端协助验收：保留环境，继续执行。')
  await expect.poll(() => existsSync(join(workspace, 'terminal-ai-result.txt'))).toBe(true)
  const human = readFileSync(join(workspace, 'terminal-human.txt'), 'utf8')
  expect(readFileSync(join(workspace, 'terminal-ai-result.txt'), 'utf8')).toBe(`41|${human}`)
  await expect(page.getByText('终端执行已返回，状态码 0。', { exact: false })).toBeVisible()
  await dock.getByRole('button', { name: '接回控制' }).click()
  await expect(dock.getByText('手动控制', { exact: true })).toBeVisible()
  await type(page, dock, 'printf "%s" "$DAWN_TERMINAL_SAMPLE" > terminal-manual-result.txt')
  await expect.poll(() => existsSync(join(workspace, 'terminal-manual-result.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'terminal-manual-result.txt'), 'utf8')).toBe('41')
})

test('终端协助：已经打开的 Python 原变量继续计算，键盘输入立即接回', async ({ dawn }) => {
  const { page, workspace } = dawn
  const dock = await openTerminal(page)
  await type(page, dock, 'python3 -q')
  await type(page, dock, 'dawn_number = 40; open("python-human.txt", "w").write("ready")')
  await expect.poll(() => existsSync(join(workspace, 'python-human.txt'))).toBe(true)
  await dock.getByRole('combobox', { name: '当前终端程序' }).selectOption('python')
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await send(page, '终端协助验收：Python 原变量，继续执行。')
  const permission = page.getByRole('button', { name: '允许这一次', exact: true })
  // The fixture keeps the real permission policy: approve only when its card is shown.
  await expect.poll(async () => existsSync(join(workspace, 'python-ai-result.txt')) || await permission.count() > 0).toBe(true)
  if (await permission.count()) await permission.click()
  await expect.poll(() => existsSync(join(workspace, 'python-ai-result.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'python-ai-result.txt'), 'utf8')).toBe('42')
  await type(page, dock, 'open("python-manual.txt", "w").write(str(dawn_number))')
  await expect(dock.getByText('手动控制', { exact: true })).toBeVisible()
  await expect.poll(() => existsSync(join(workspace, 'python-manual.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'python-manual.txt'), 'utf8')).toBe('42')
})

test('终端协助：长任务超时不重发，显式中断后终端仍可用', async ({ dawn }) => {
  const { page, workspace } = dawn
  const dock = await openTerminal(page)
  await type(page, dock, 'printf ready > long-ready.txt')
  await expect.poll(() => existsSync(join(workspace, 'long-ready.txt'))).toBe(true)
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await send(page, '终端协助验收：长任务，继续执行。')
  await expect(page.getByText('终端任务仍在运行，本轮只结束等待，没有重复发送命令。', { exact: false })).toBeVisible()
  await dock.getByRole('button', { name: 'Ctrl-C' }).click()
  await dock.getByRole('button', { name: '接回控制' }).click()
  await type(page, dock, 'printf alive > interrupted-alive.txt')
  await expect.poll(() => existsSync(join(workspace, 'interrupted-alive.txt'))).toBe(true)
  expect(existsSync(join(workspace, 'terminal-long-result.txt'))).toBe(false)
})

test('终端协助：收起面板后仍能只读同一个终端', async ({ dawn }) => {
  const { page, workspace } = dawn
  const dock = await openTerminal(page)
  await type(page, dock, 'printf hidden-screen-ready; printf ready > hidden-ready.txt')
  await expect.poll(() => existsSync(join(workspace, 'hidden-ready.txt'))).toBe(true)
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await dock.getByRole('button', { name: '收起面板', exact: true }).click()
  await send(page, '终端协助验收：只读画面。')
  await expect(page.getByText('已读取终端当前画面，本轮没有输入。', { exact: false })).toBeVisible()
  await expect(page.locator('.turns')).toContainText('hidden-screen-ready')
  expect(existsSync(join(workspace, 'terminal-ai-result.txt'))).toBe(false)
})

test('终端协助：真实 R 变量在模型和人工之间连续使用', async ({ dawn }) => {
  test.skip(!existsSync('/Library/Frameworks/R.framework/Resources/bin/R'), '需要本机 R 解释器')
  const { page, workspace } = dawn
  const dock = await openTerminal(page)
  await type(page, dock, '/Library/Frameworks/R.framework/Resources/bin/R --vanilla --quiet')
  await type(page, dock, 'dawn_number <- 40; writeLines("ready", "r-human.txt")')
  await expect.poll(() => existsSync(join(workspace, 'r-human.txt'))).toBe(true)
  await dock.getByRole('combobox', { name: '当前终端程序' }).selectOption('R')
  await dock.getByRole('button', { name: '交给当前对话' }).click()
  await send(page, '终端协助验收：R变量，继续执行。')
  const permission = page.getByRole('button', { name: '允许这一次', exact: true })
  await expect.poll(async () => existsSync(join(workspace, 'r-ai-result.txt')) || await permission.count() > 0).toBe(true)
  if (await permission.count()) await permission.click()
  await expect.poll(() => existsSync(join(workspace, 'r-ai-result.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'r-ai-result.txt'), 'utf8')).toBe('42\n')
  await dock.getByRole('button', { name: '接回控制' }).click()
  await type(page, dock, 'writeLines(as.character(dawn_number), "r-manual.txt")')
  await expect.poll(() => existsSync(join(workspace, 'r-manual.txt'))).toBe(true)
  expect(readFileSync(join(workspace, 'r-manual.txt'), 'utf8')).toBe('42\n')
})
