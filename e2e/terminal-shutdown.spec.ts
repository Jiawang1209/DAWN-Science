import { test, expect, 在项目里开会话, 等进了对话 } from './fixtures.js'
import type { Page } from '@playwright/test'

async function invoke(page: Page, operation: string, input: unknown = {}): Promise<any> {
  return page.evaluate(async ({ operation, input }) => {
    const r = await window.dawn!.invoke(operation, input)
    if (!r.ok) throw Error(r.error?.message)
    return r.data
  }, { operation, input })
}

for (const agent of [false, true]) {
  test(`quitting with two live ${agent ? 'DAWN' : 'Normal'} terminals exits cleanly and reopening retains the conversations`, async ({ dawn }) => {
    const { page, app } = dawn
    await 在项目里开会话(page); await 等进了对话(page)
    await page.locator('.composer-card .attach-trigger').click()
    await page.getByRole('menuitem', { name: '终端面板', exact: true }).click()
    const start = async () => {
      await expect(page.locator('.dock').getByRole('button', { name: 'Normal 模式', exact: true })).toBeEnabled()
      await expect.poll(async () => /[$#%]$/.test((await page.locator('.dock .xterm-rows').innerText()).trimEnd())).toBe(true)
      if (agent) {
        await page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true }).click()
        await expect(page.locator('.dock').getByRole('button', { name: 'DAWN 模式', exact: true })).toHaveAttribute('aria-pressed', 'true')
      }
    }
    await start()
    await page.locator('.dock').getByRole('button', { name: '＋ 新开一个', exact: true }).click()
    await expect(page.locator('.dock .dock-tab')).toHaveCount(2)
    await start()
    const tasks = await invoke(page, 'listTasks'), archived = await invoke(page, 'listArchivedSessions')
    const child = app.process()
    const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    await app.close()
    expect(await exited).toEqual({ code: 0, signal: null })
    const reopened = await dawn.重开()
    const after = await invoke(reopened, 'listTasks')
    expect(after.map((t: any) => t.sessionId).sort()).toEqual(tasks.map((t: any) => t.sessionId).sort())
    expect(await invoke(reopened, 'listArchivedSessions')).toEqual(archived)
  })
}
