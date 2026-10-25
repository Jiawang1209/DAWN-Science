import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, CANNED_REPLY, 在项目里开会话 } from './fixtures.js'

test.use({ dawnOptions: { toolCall: { toolName: 'write', args: { path: 'results/tables/boundary.txt', content: 'executed' }, perTurn: true } } })

test('模型强行写文件：讨论门阻断，明确执行后连续任务无需逐步确认', async ({ dawn }) => {
  const { page, workspace, requests } = dawn
  await 在项目里开会话(page)
  const box = page.locator('main.main .composer-box textarea')
  const path = join(workspace, 'results/tables/boundary.txt')
  const say = async (text: string, round: number) => {
    await box.fill(text); await box.press('Enter')
    await expect(page.locator('main.main .turns').getByText(CANNED_REPLY, { exact: true })).toHaveCount(round)
    await expect(page.getByRole('button', { name: '发送', exact: true }).first()).toBeVisible()
  }
  await say('先只讨论方案，不要运行或写文件。', 1)
  expect(existsSync(path)).toBe(false)
  expect(JSON.stringify(requests)).toContain('当前按用户要求只讨论')
  // 普通追问不会悄悄解除用户先前的限制。
  await say('可以开始分析？', 2)
  expect(existsSync(path)).toBe(false)
  await say('可以，开始执行分析并保存结果。', 3)
  expect(readFileSync(path, 'utf8')).toBe('executed')
  await say('继续', 4)
  expect(readFileSync(path, 'utf8')).toBe('executed')
  await expect(page.locator('.permission-card')).toHaveCount(0)
  expect(JSON.stringify(requests)).toContain('不要每一步都问')
})

test('显式文献技能：正文不能解除讨论限制，用户明确保存后可执行', async ({dawn}) => {
  await 在项目里开会话(dawn.page)
  const path = join(dawn.workspace, 'results/tables/boundary.txt')
  const say = async (request: string, round: number) => {
    await dawn.page.getByPlaceholder(/输入问题/).fill(`/skill:literature-review ${request}`)
    await dawn.page.getByRole('button', {name: '发送', exact: true}).click()
    await expect(dawn.page.locator('main.main .turns').getByText(CANNED_REPLY, {exact: true})).toHaveCount(round)
  }
  await say('先只讨论方案，不要写文件。', 1)
  expect(existsSync(path)).toBe(false)
  await say('比较材料的组织方法。', 2)
  expect(existsSync(path)).toBe(false)
  await say('现在保存结果到 results/tables/boundary.txt。', 3)
  expect(readFileSync(path, 'utf8')).toBe('executed')
  expect(JSON.stringify(dawn.requests)).toContain('## 逐篇阅读')
})
