import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'
import { stripVTControlCharacters } from 'node:util'

async function open(page: Page) {
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await ready(page)
}
async function ready(page: Page) {
  await expect.poll(async () => /[$#%]$/.test(stripVTControlCharacters(await page.locator('.dock .xterm-screen').innerText()).trimEnd())).toBe(true)
}
async function type(page: Page, text: string) {
  await page.locator('.dock .xterm-helper-textarea').focus()
  await page.keyboard.type(text); await page.keyboard.press('Enter')
}
async function ptys(page: Page) {
  return page.evaluate(async () => {
    const invoke = async (op: string, args: any) => {
      const result = await window.dawn!.invoke(op as any, args) as any
      if (!result.ok) throw Error(`${op} failed`)
      return result.data
    }
    const projects = await invoke('listProjects', {})
    const lists = await Promise.all(projects.map((p: any) => invoke('listSessions', { projectId: p.projectId })))
    lists.push(await invoke('listTemporarySessions', {}))
    return [...new Map<string, any>(lists.flat().filter((s: any) => s.kind === 'pty').map((s: any) => [s.sessionId, s])).values()]
      .map(s => ({ sessionId: s.sessionId as string, state: s.state as string }))
  })
}
async function back(page: Page) {
  const button = page.locator('.dock').getByRole('button', { name: '返回会话', exact: true })
  await expect(button).toBeEnabled(); await button.click()
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(page.locator('.composer-card')).toBeVisible()
}
async function closed(page: Page, id: string) {
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock .empty')).toContainText('还没有终端')
  await expect.poll(async () => (await ptys(page)).some(t => t.sessionId === id)).toBe(false)
  await expect(page.locator('.dock-tab')).toHaveCount(0)
}

for (const scope of ['welcome', 'conversation'] as const) {
  test(`${scope}: closing the final terminal, explicit new, and repeated reopen keep a usable page and draft`, async ({ dawn }) => {
    const { page } = dawn
    if (scope === 'conversation') { await 在项目里开会话(page); await 等进了对话(page) }
    const composer = page.locator('.composer-card textarea.composer-field')
    await composer.fill('LIFECYCLE_DRAFT_KEEP')
    await open(page)
    const original = (await ptys(page))[0]!.sessionId
    await type(page, "export DAWN_LIFECYCLE=kept; printf 'SHELL_'; printf 'READY_OK\\n'")
    await expect(page.locator('.dock .xterm-screen')).toContainText('SHELL_READY_OK')
    await closed(page, original)
    await page.getByRole('button', { name: '＋ 新开一个', exact: true }).click(); await ready(page)
    const replacement = (await ptys(page))[0]!.sessionId
    expect(replacement).not.toBe(original)
    await type(page, "printf 'FRESH_'; printf '%s_OK\\n' ${DAWN_LIFECYCLE:-shell}")
    await expect(page.locator('.dock .xterm-screen')).toContainText('FRESH_shell_OK')
    await back(page); await expect(composer).toHaveValue('LIFECYCLE_DRAFT_KEEP')
    for (let i = 0; i < 2; i++) {
      await open(page)
      expect((await ptys(page)).map(t => t.sessionId)).toEqual([replacement])
      await type(page, `printf 'REOPEN_${i}_'; printf 'LIVE_OK\\n'`)
      await expect(page.locator('.dock .xterm-screen')).toContainText(`REOPEN_${i}_LIVE_OK`)
      await back(page); await expect(composer).toHaveValue('LIFECYCLE_DRAFT_KEEP')
    }
    await open(page); await closed(page, replacement); await back(page)
    await page.reload(); await expect(composer).toBeVisible()
    await open(page)
    const afterReload = await ptys(page)
    expect(afterReload).toHaveLength(1)
    expect([original, replacement]).not.toContain(afterReload[0]!.sessionId)
    await back(page)
    await expect(page.locator('.session-tab[data-session="' + original + '"]')).toHaveCount(0)
  })
}

test('closing the last DAWN terminal preserves its conversation; a new Agent is separate and the original GUI can continue', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page); await 等进了对话(page)
  await open(page)
  const terminalId = (await ptys(page))[0]!.sessionId
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const state = await page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, terminalId)
  await type(page, 'LIFECYCLE_AGENT_CONTEXT_KEEP')
  await expect.poll(async () => page.evaluate(async id => {
    const snapshot = (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data
    return snapshot.items.some((x: any) => x.type === 'turn' && x.who === 'agent' && x.final)
  }, state.sessionId)).toBe(true)
  await back(page)
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', state.sessionId)
  await expect(page.locator('.main')).toContainText('LIFECYCLE_AGENT_CONTEXT_KEEP')
  // Reopen through the Agent conversation, then close its only PTY.
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await ptys(page)).map(t => t.sessionId)).toEqual([terminalId])
  await closed(page, terminalId); await back(page)
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', state.sessionId)
  await expect(page.locator('.main')).toContainText('LIFECYCLE_AGENT_CONTEXT_KEEP')
  await page.evaluate(async id => {
    const result = await window.dawn!.invoke('renameSession', { sessionId: id, title: 'LIFECYCLE_AGENT_REOPEN' })
    if (!result.ok) throw Error('Could not label the conversation for reopening')
  }, state.sessionId)
  await page.reload(); await expect(page.locator('.composer-card')).toBeVisible()
  // Reload starts on welcome. Select the retained conversation before asking
  // for its terminal; opening from welcome intentionally starts a new scope.
  await page.getByRole('button', { name: /^LIFECYCLE_AGENT_REOPEN/ }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', state.sessionId)
  await open(page)
  const nextId = (await ptys(page))[0]!.sessionId
  expect(nextId).not.toBe(terminalId)
  await page.getByRole('button', { name: 'DAWN 模式', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const next = await page.evaluate(async id => (await window.dawn!.invoke('getTerminalAgentMode', { terminalId: id }) as any).data, nextId)
  // A new CLI invocation is a new conversation by the existing contract.
  expect(next.sessionId).not.toBe(state.sessionId)
  await type(page, 'LIFECYCLE_NEW_AGENT_TURN')
  await back(page)
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', next.sessionId)
  await expect(page.locator('.main')).not.toContainText('LIFECYCLE_AGENT_CONTEXT_KEEP')
  await page.getByRole('button', { name: /^LIFECYCLE_AGENT_REOPEN/ }).click()
  await expect(page.locator('.session-tab[aria-selected="true"]')).toHaveAttribute('data-session', state.sessionId)
  await expect(page.locator('.main')).toContainText('LIFECYCLE_AGENT_CONTEXT_KEEP')
  const composer = page.locator('.composer-card textarea.composer-field')
  await composer.fill('LIFECYCLE_SECOND_TURN'); await composer.press('Enter')
  await expect(page.locator('.main')).toContainText('LIFECYCLE_SECOND_TURN')
  await expect.poll(async () => page.evaluate(async id => {
    const snapshot = (await window.dawn!.invoke('subscribeSession', { sessionId: id }) as any).data
    return snapshot.items.filter((x: any) => x.type === 'turn' && x.who === 'agent' && x.final).length
  }, state.sessionId)).toBe(2)
})

test('closing the current terminal selects a live sibling and keeps receiving real output', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page); await 等进了对话(page); await open(page)
  const first = (await ptys(page))[0]!.sessionId
  await type(page, 'export DAWN_SIBLING=preserved')
  await page.getByRole('button', { name: '＋ 新开一个', exact: true }).click(); await ready(page)
  await expect(page.locator('.dock-tab')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭终端 2', exact: true }).click()
  await expect(page.locator('.dock-tab')).toHaveCount(1)
  await expect.poll(async () => (await ptys(page)).map(t => t.sessionId)).toEqual([first])
  await type(page, "printf 'SIBLING_'; printf '%s_OK\\n' $DAWN_SIBLING")
  await expect(page.locator('.dock .xterm-screen')).toContainText('SIBLING_preserved_OK')
  await back(page); await open(page)
  await type(page, "printf 'AFTER_RETURN_'; printf '%s_OK\\n' $DAWN_SIBLING")
  await expect(page.locator('.dock .xterm-screen')).toContainText('AFTER_RETURN_preserved_OK')
})

test('an ended sibling remains selectable after closing the live terminal and can still be closed and replaced', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page); await 等进了对话(page); await open(page)
  await type(page, 'exit'); await expect(page.locator('.dock')).toContainText('已结束')
  await page.getByRole('button', { name: '＋ 新开一个', exact: true }).click(); await ready(page)
  await expect(page.locator('.dock-tab')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭终端 2', exact: true }).click()
  await expect(page.locator('.dock-tab')).toHaveCount(1)
  await page.getByRole('button', { name: '终端 1 已结束', exact: true }).click()
  await expect(page.getByRole('button', { name: 'DAWN 模式', exact: true })).toBeDisabled()
  await back(page)
  await page.locator('.composer-card .attach-trigger').click()
  await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
  await ready(page)
  // A fresh live Shell is created only on explicitly opening again, not on close.
  await expect(page.locator('.dock-tab')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭终端 1', exact: true }).click()
  await expect(page.locator('.dock-tab')).toHaveCount(1)
  await type(page, "printf 'ENDED_REPLACED_'; printf 'OK\\n'")
  await expect(page.locator('.dock .xterm-screen')).toContainText('ENDED_REPLACED_OK')
  await back(page)
})
