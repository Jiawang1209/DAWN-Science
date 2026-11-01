import { test, expect, 开一段临时会话 } from './fixtures.js'

test.describe('Skill 检索与读取证据', () => {
  test.use({ dawnOptions: { toolCall: [
    { toolName: 'search_skills', args: { query: 'EDA', limit: 3 } },
    { toolName: 'use_skill', args: { name: 'dataset-first-look', limit: 4000 } },
  ] } })
  test('检索后读取，折叠可见、展开指纹、重载恢复', async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/输入问题/).fill('先检索 EDA 工作流，再读取说明')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
    await expect(page.locator('.skill-read-summary')).toContainText('已读取技能 dataset-first-look')
    const bodies = JSON.stringify(dawn.requests)
    expect(bodies).toContain('"name":"search_skills"')
    expect(bodies).toContain('"name":"use_skill"')
    expect(bodies).toContain('contentSha256')
    expect(bodies).toContain('match')
    await expect(page.locator('.tool-group').last()).toHaveAttribute('data-running', 'false')
    await page.screenshot({ path: 'test-results/skill-read-collapsed.png', animations: 'disabled' })
    await page.locator('.tool-group-head').last().click()
    await page.locator('.tool-head').filter({ hasText: 'use_skill' }).click()
    await expect(page.locator('.skill-read-details')).toContainText('内容 SHA-256')
    await expect(page.locator('.skill-read-details')).toContainText('不代表代码已执行或科学结论已验证')
    await page.screenshot({ path: 'test-results/skill-read-expanded.png', animations: 'disabled' })
    await page.reload()
    await page.locator(".session-list .sess-item .row").first().click()
    await expect(page.locator('.skill-read-summary')).toContainText('已读取技能 dataset-first-look')
  })
})

test('实际手动展开写入读取记录并恢复', async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/输入问题/).fill('/skill:scientific-review 只审不运行')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  await expect(page.locator('.skill-read-summary')).toContainText('已读取技能 scientific-review')
  await page.reload()
    await page.locator(".session-list .sess-item .row").first().click()
  await expect(page.locator('.skill-read-summary')).toContainText('已读取技能 scientific-review')
})
