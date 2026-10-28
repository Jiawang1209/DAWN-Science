import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg=='
async function open(page: Page) {
  await page.getByRole('button', { name: '终端面板', exact: true }).click()
  await expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
}
async function type(page: Page, value: string) {
  await page.locator('.dock .xterm-helper-textarea').focus(); await page.keyboard.type(value); await page.keyboard.press('Enter')
}
async function terminal(page: Page) {
  return page.evaluate(async () => {
    const projects = (await window.dawn!.invoke('listProjects', {}) as any).data
    const all = (await Promise.all(projects.map(async (p: any) => (await window.dawn!.invoke('listSessions', { projectId: p.projectId }) as any).data))).flat()
    return all.find((s: any) => s.kind === 'pty' && s.state !== 'exited').sessionId as string
  })
}
async function mode(page: Page, id: string) { return page.evaluate(async terminalId => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId }) as any).data, id) }
async function final(page: Page, id: string, count = 1) {
  await expect.poll(async () => page.evaluate(async id => (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data.items.filter((i: any) => i.type === 'turn' && i.who === 'agent' && i.final).length, id)).toBe(count)
}
async function seed(page: Page) {
  await 在项目里开会话(page); await 等进了对话(page); await open(page)
  const terminalId = await terminal(page)
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const state = await mode(page, terminalId)
  await page.locator('.dock .term-host').evaluate((el, data) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], 'history-source.png', { type: 'image/png' }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, png)
  await expect(page.locator('.terminal-attachment')).toHaveCount(1)
  await type(page, 'HISTORY_IMAGE_ORIGINAL'); await final(page, state.sessionId)
  await page.evaluate(async id => { await window.dawn!.invoke('renameSession', { sessionId: id, title: 'HISTORY_ORIGINAL' }) }, state.sessionId)
  const tasks = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.composer-card')).toBeVisible()
  await open(page)
  return { ...state, tasks, newTerminalId: await terminal(page) }
}

test('CLI resume restores the original conversation, original image and GUI continuation after closing its last terminal', async ({ dawn }) => {
  const { page, requests } = dawn, target = await seed(page)
  await expect(page.getByRole('button', { name: '接续旧对话', exact: true })).toHaveCount(0)
  await type(page, `dawn --resume ${target.sessionId}`)
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.dock .xterm-screen')).toContainText('HISTORY_IMAGE_ORIGINAL')
  expect((await mode(page, target.newTerminalId)).sessionId).toBe(target.sessionId)
  await expect(page.locator('.terminal-inline-image img').first()).toBeVisible()
  await page.locator('.terminal-inline-image').first().click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
  await type(page, 'HISTORY_FOLLOWUP_NO_REUPLOAD'); await final(page, target.sessionId, 2)
  const payload = requests.findLast((r: any) => JSON.stringify(r.body).includes('HISTORY_FOLLOWUP_NO_REUPLOAD')) as any
  expect(JSON.stringify(payload?.body)).toContain('image_url')
  expect(JSON.stringify(payload?.body)).toContain('HISTORY_IMAGE_ORIGINAL')
  expect(await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)).toBe(target.tasks)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.sessionId)
  await expect(page.locator('.main')).toContainText('HISTORY_IMAGE_ORIGINAL')
  await expect(page.locator('.main .turn-images img').first()).toBeVisible()
})

test('dawn --resume picker cancels without a new task, then explicit CLI resume restores the original ID', async ({ dawn }) => {
  const { page } = dawn, target = await seed(page)
  await type(page, 'dawn --resume')
  await expect(page.locator('.dock .xterm-screen')).toContainText('选择历史会话')
  await page.keyboard.press('Enter')
  await expect(page.locator('.dock .xterm-screen')).toContainText('已取消恢复')
  expect(await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)).toBe(target.tasks)
  await type(page, 'dawn --resume')
  await expect(page.locator('.dock .xterm-screen')).toContainText('编号 >')
  await type(page, '1')
  await expect(page.locator('.dock .xterm-screen')).toContainText('已恢复原会话')
  expect((await mode(page, target.newTerminalId)).sessionId).toBe(target.sessionId)
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await type(page, '/exit')
  await expect.poll(async () => (await mode(page, target.newTerminalId)).mode).toBe('normal')
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await type(page, `dawn --resume ${target.sessionId}`)
  await expect.poll(async () => (await mode(page, target.newTerminalId)).mode).toBe('dawn')
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.dock .xterm-screen')).toContainText('已恢复原会话')
  expect((await mode(page, target.newTerminalId)).sessionId).toBe(target.sessionId)
  await type(page, 'CLI_HISTORY_CONTINUE'); await final(page, target.sessionId, 2)
  await type(page, '/exit')
  await expect(page.getByRole('button', { name: 'Normal 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.sessionId)
})

test('restarting the desktop preserves the original image context and restores the same saved conversation', async ({ dawn }) => {
  const target = await seed(dawn.page)
  const page = await dawn.重开()
  await page.getByRole('button', { name: /^HISTORY_ORIGINAL/ }).click()
  await expect(page.locator('.main .turn-images img').first()).toBeVisible()
  await open(page)
  await type(page, `dawn --resume ${target.sessionId}`)
  await expect(page.locator('.dock .xterm-screen')).toContainText('已恢复原会话')
  const id = await terminal(page)
  expect((await mode(page, id)).sessionId).toBe(target.sessionId)
  await expect(page.locator('.terminal-inline-image img').first()).toBeVisible()
  await type(page, 'RESTART_HISTORY_FOLLOWUP'); await final(page, target.sessionId, 2)
  const payload = dawn.requests.findLast((r: any) => JSON.stringify(r.body).includes('RESTART_HISTORY_FOLLOWUP')) as any
  expect(JSON.stringify(payload?.body)).toContain('image_url')
})

test('history follows a real Shell cd and does not offer conversations from the old directory', async ({ dawn }) => {
  const { page, workspace } = dawn
  await seed(page)
  const nested = join(workspace, 'nested-history'); mkdirSync(nested)
  const target = await page.evaluate(async workspace => {
    const providers = (await window.dawn!.invoke('getProviders', {}) as any).data
    const agentId = providers.agents.find((a: any) => a.kind === 'native').agentId
    const task = (await window.dawn!.invoke('createTask', { agentId, workspace }) as any).data
    await window.dawn!.invoke('renameSession', { sessionId: task.sessionId, title: 'NESTED_HISTORY_TARGET' })
    return task.sessionId as string
  }, nested)
  await type(page, 'cd nested-history')
  await type(page, 'dawn --resume')
  await expect(page.locator('.dock .xterm-screen')).toContainText('NESTED_HISTORY_TARGET')
  await expect(page.locator('.dock .xterm-screen')).not.toContainText('HISTORY_ORIGINAL')
  await expect(page.locator('.dock .xterm-screen')).toContainText('编号 >')
  await type(page, '1')
  await expect(page.locator('.dock .xterm-screen')).toContainText('已恢复原会话')
  expect((await mode(page, await terminal(page))).sessionId).toBe(target)
})

test('an unsupported old image preview warns while the same conversation and original model image context remain usable', async ({ dawn }) => {
  const { page, requests } = dawn, target = await seed(page)
  const bmp = Buffer.alloc(58)
  bmp.write('BM'); bmp.writeUInt32LE(58, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(1, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28)
  await page.evaluate(async ({ sessionId, data }) => {
    await window.dawn!.invoke('subscribeSession', { sessionId })
    await window.dawn!.invoke('acquireLease', { sessionId, holder: 'user' })
    const response = await window.dawn!.invoke('writeToSession', { sessionId, as: 'user', data: 'GUI_BMP_HISTORY', images: [{ from: 'bytes', data, mimeType: 'image/bmp' }] })
    if (!response.ok) throw Error(response.error?.message ?? 'Could not seed the original BMP conversation')
  }, { sessionId: target.sessionId, data: bmp.toString('base64') })
  await final(page, target.sessionId, 2)
  await type(page, `dawn --resume ${target.sessionId}`)
  await expect(page.locator('.dock .xterm-screen')).toContainText('历史图片 2 无法预览，原始图片上下文保留')
  expect((await mode(page, target.newTerminalId)).sessionId).toBe(target.sessionId)
  await expect(page.locator('.terminal-inline-image img').first()).toBeVisible()
  await type(page, 'CONTINUE_WITH_ORIGINAL_BMP'); await final(page, target.sessionId, 3)
  const payload = requests.findLast((r: any) => JSON.stringify(r.body).includes('CONTINUE_WITH_ORIGINAL_BMP')) as any
  expect(JSON.stringify(payload?.body)).toContain('image/bmp')
  expect(await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)).toBe(target.tasks)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', target.sessionId)
})

test('the current owner can close its last resumed terminal, reopen directly and continue the original image without reconnecting the GUI', async ({ dawn }) => {
  const { page, requests } = dawn
  await 在项目里开会话(page); await 等进了对话(page)
  const ownerId = await page.locator('.session-tab[aria-selected="true"]').getAttribute('data-session')
  expect(ownerId).toBeTruthy()
  await page.evaluate(async sessionId => { await window.dawn!.invoke('renameSession', { sessionId: sessionId!, title: 'CURRENT_OWNER_HISTORY' }) }, ownerId)
  const count = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)
  await open(page)
  const resumeOwner = async () => {
    await type(page, `dawn --resume ${ownerId}`)
    await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect((await mode(page, await terminal(page))).sessionId).toBe(ownerId)
  }
  const ready = async () => expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
  await resumeOwner()
  await expect(page.locator('.dock .xterm-screen')).toContainText('输入 未提供')
  await page.locator('.dock .term-host').evaluate((el, data) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], 'owner-original.png', { type: 'image/png' }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, png)
  await expect(page.locator('.terminal-attachment')).toHaveCount(1)
  await type(page, 'CURRENT_OWNER_IMAGE'); await final(page, ownerId!)
  const usage = async (turns: number) => {
    await expect(page.locator('.dock .xterm-screen')).toContainText(`${turns} 轮`)
    await expect(page.locator('.dock .xterm-screen')).toContainText(`输入 ${12 * turns}`)
    await expect(page.locator('.dock .xterm-screen')).toContainText(`输出 ${8 * turns}`)
    await expect(page.locator('.dock .xterm-screen')).toContainText('缓存 未确认')
    await expect(page.locator('.dock .xterm-screen')).toContainText('命中 未提供')
  }
  await usage(1)
  for (const viaGui of [false, true]) {
    const n = viaGui ? 3 : 2
    const close = page.locator('.dock').getByRole('button', { name: /^关闭终端 / })
    await expect(close).toHaveCount(1); await close.click()
    await expect(page.locator('.dock .empty')).toContainText('还没有终端')
    if (viaGui) {
      await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
      await expect(page.locator('.main .turn-images img').first()).toBeVisible()
      await page.getByRole('button', { name: '终端面板', exact: true }).click()
    }
    // Deliberately never subscribe to the owner or click the GUI reconnect button here.
    await page.getByRole('button', { name: '＋ 新开一个', exact: true }).click(); await ready()
    await resumeOwner()
    await usage(n - 1)
    await expect(page.locator('.terminal-inline-image img').first()).toBeVisible()
    await type(page, `OWNER_REOPEN_${n}`); await final(page, ownerId!, n)
    await usage(n)
    const payload = requests.findLast((r: any) => JSON.stringify(r.body).includes(`OWNER_REOPEN_${n}`)) as any
    expect(JSON.stringify(payload?.body)).toContain('image_url')
    expect(JSON.stringify(payload?.body)).toContain('CURRENT_OWNER_IMAGE')
  }
  await page.getByRole('button', { name: 'Normal 模式', exact: true }).click(); await ready()
  await resumeOwner()
  await usage(3)
  expect(await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {}) as any).data.length)).toBe(count)
  await page.locator('.dock').getByRole('button', { name: '返回会话', exact: true }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', ownerId!)
  await expect(page.locator('.main .turn-images img').first()).toBeVisible()
  await expect(page.locator('.composer-card textarea')).toBeEnabled()
})
