import { test, expect, 在项目里开会话 } from './fixtures.js'

test('关闭页签保留会话和草稿，只有明确归档才进入已归档', async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const tabs = page.getByRole('tablist', { name: '同一处的会话' })
  const input = page.locator('main.main .composer textarea')
  const first = (await tabs.getByRole('tab', { selected: true }).getAttribute('data-session'))!
  await page.evaluate(async id => { await window.dawn!.invoke('renameSession', { sessionId: id, title: '关闭第一段' }) }, first)
  await input.fill('第一段尚未发送的草稿')
  await tabs.getByRole('button', { name: '在这里再开一段', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  const second = (await tabs.getByRole('tab', { selected: true }).getAttribute('data-session'))!
  await page.evaluate(async id => { await window.dawn!.invoke('renameSession', { sessionId: id, title: '关闭第二段' }) }, second)
  await input.fill('第二段尚未发送的草稿')
  await tabs.locator('.session-tab-wrap.current .session-tab-close').click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await expect(page.locator('.proj-session-list .sess-item')).toHaveCount(2)
  await expect(input).toHaveValue('第一段尚未发送的草稿')
  const archived = () => page.evaluate(async () => (await window.dawn!.invoke('listArchivedSessions', {})).data as { sessions: { sessionId: string }[] })
  expect((await archived()).sessions).toEqual([])
  await tabs.locator('.session-tab-close').click()
  await expect(tabs).toHaveCount(0)
  await expect(page.locator('.proj-session-list .sess-item')).toHaveCount(2)
  expect((await archived()).sessions).toEqual([])

  // A closed tab can be reopened from the sidebar, without losing its draft.
  const rows = page.locator('.proj-session-list .sess-item')
  const firstRow = rows.filter({ hasText: '关闭第一段' }).locator('.row').first()
  const secondRow = rows.filter({ hasText: '关闭第二段' }).locator('.row').first()
  await firstRow.click()
  await expect(input).toHaveValue('第一段尚未发送的草稿')
  await secondRow.click()
  await expect(input).toHaveValue('第二段尚未发送的草稿')
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await tabs.getByRole('tab', { selected: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '收进归档', exact: true }).click()
  await expect.poll(async () => (await archived()).sessions.map(row => row.sessionId)).toEqual([second])
  await expect(page.locator('.side-bottom').getByRole('button', { name: /^已归档/ })).toContainText('1')
})
