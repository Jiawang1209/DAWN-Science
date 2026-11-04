/** The model is deterministic; Electron, Pi, child process, transcript and result outbox are real. */
import {mkdirSync, writeFileSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test, expect, 在项目里开会话, CANNED_REPLY} from './fixtures.js'

test.use({dawnOptions: {gitInit: true, toolCall: {when: '后台协作验收', toolName: 'start_subagent', args: {agent: 'scout', task: '请简短说明结果。'}}}})

test('background child returns a stable receipt, appears in the existing dock and durably reports to its parent', async ({dawn}) => {
  const {page, workspace, dir} = dawn
  mkdirSync(join(workspace, '.dawn', 'agents'), {recursive: true})
  writeFileSync(join(workspace, '.dawn', 'agents', 'scout.md'), '---\nname: scout\ndescription: 只读检查\ntools: read, ls\n---\n只读检查，简短回答。\n')
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill('后台协作验收')
  await page.getByRole('button', {name: '发送', exact: true}).click()
  const receipt = page.locator('.tool[data-tool-name="start_subagent"]')
  await expect(receipt).toBeVisible()
  if (await receipt.locator('.tool-head').getAttribute('aria-expanded') !== 'true') await receipt.locator('.tool-head').click()
  await expect(receipt.locator('.tool-result')).toContainText('childId')
  await expect(receipt.locator('.tool-result')).toContainText('messageId')
  const chip = page.locator('.chip-group .chip').first()
  await expect(chip).toHaveAttribute('data-status', 'ok', {timeout: 45_000})
  await chip.click()
  await expect(page.locator('.subagent-result')).toContainText(CANNED_REPLY)
  await expect(page.locator('main.main')).toContainText('结果已返回')
  await expect(page.getByRole('button', {name: '停止', exact: true})).toHaveCount(0, {timeout: 45_000})
  // Host-owned custom receipt confirms delivery; no second execution is used to recover the result.
  const findStates = (path: string): string[] => readdirSync(path, {withFileTypes: true}).flatMap(entry => entry.isDirectory() && !entry.isSymbolicLink() && !['electron-user-data', '.git'].includes(entry.name) ? findStates(join(path, entry.name)) : entry.name === 'state.json' && path.endsWith('orchestration') ? [join(path, entry.name)] : [])
  const files = findStates(dir)
  const state = files.map(file => JSON.parse(readFileSync(file, 'utf8'))).find(value => value.messages?.length)
  expect(state?.messages).toHaveLength(1)
  expect(state.messages[0]).toMatchObject({status: 'completed', deliveredAt: expect.any(Number)})
})
