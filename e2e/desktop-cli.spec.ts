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
  await expect.poll(text).toContain('DAWN Science · deepseek/')
  await type('这是桌面 CLI 连接验收，请简短回答。')
  await expect.poll(text, { timeout: 30000 }).toContain('假模型已应答')
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

test('return opens the same Agent conversation and continues it without creating or copying a task', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page); await 等进了对话(page)
  const composer = page.locator('.main .composer-card textarea.composer-field')
  await composer.fill('保留原会话草稿 CONTEXT_DRAFT')
  const open = async () => {
    await page.locator('.composer-card .attach-trigger').click()
    await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
    await expect(page.locator('.dock .term-host')).toBeVisible()
  }
  const sessions = () => page.evaluate(async () => {
    const p = await window.dawn!.invoke('listProjects', {}) as any
    return (await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any).data as any[]
  })
  await open()
  const before = await sessions(), terminal = before.find(s => s.kind === 'pty'), original = before.find(s => s.kind === 'native')
  // Normal with no CLI still restores the original conversation.
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(composer).toHaveValue('保留原会话草稿 CONTEXT_DRAFT')
  await open()
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  const state = await page.evaluate(async terminalId => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId }) as any).data, terminal.sessionId)
  expect(state.sessionId).toBeTruthy(); expect(state.sessionId).not.toBe(original.sessionId)
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type('终端上下文标记 CONTEXT_RETURN_7X9'); await page.keyboard.press('Enter')
  await expect.poll(async () => {
    const r = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, state.sessionId)
    return r.items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)
  }).toBe(true)
  const count = (await sessions()).length
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main .composer-card')).toBeVisible()
  await expect(page.locator('.main')).toContainText('CONTEXT_RETURN_7X9')
  await expect(composer).toHaveValue('')
  await composer.fill('GUI_CONTINUATION_4A'); await composer.press('Enter')
  await expect.poll(async () => {
    const r = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, state.sessionId)
    return r.items.some((x: any) => x.type === 'turn' && x.who === 'user' && x.text.includes('GUI_CONTINUATION_4A'))
  }).toBe(true)
  expect((await sessions()).length).toBe(count)
  // The CLI's graphical view can reopen the original PTY.
  await open()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const current = await page.evaluate(async () => {
    const p = await window.dawn!.invoke('listProjects', {}) as any
    return (await window.dawn!.invoke('listSessions', { projectId: p.data[0].projectId }) as any).data.filter((x: any) => x.kind === 'pty').map((x: any) => x.sessionId)
  })
  expect(current).toEqual([terminal.sessionId])
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.main')).toContainText('GUI_CONTINUATION_4A')
  const originalSnapshot = await page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data, original.sessionId)
  expect(originalSnapshot.items.some((x: any) => x.type === 'turn' && x.text.includes('GUI_CONTINUATION_4A'))).toBe(false)
})
