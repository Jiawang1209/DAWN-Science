import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, 在项目里开会话 } from './fixtures.js'

test.use({ dawnOptions: { fakeSsh: true } })

test('轻量进度查询真实读取摘要，模型请求包含选择边界且没有内核调用', async ({ dawn }, info) => {
  const { page, workspace, requests } = dawn
  writeFileSync(join(workspace, 'download-status.txt'), '隔离快照：14:40\n中国优先：27/28块，剩余10个文件。')
  await 在项目里开会话(page)
  const box = page.locator('main.main .composer-box textarea')
  await box.fill('工具边界验收：查询已有下载进度')
  await box.press('Enter')
  await expect(page.locator('.turns')).toContainText('信息足以回答本次进度查询')
  await expect(page.locator('.turns')).toContainText('剩余10个文件')
  const messages = requests.flatMap((r: any) => r.body.messages ?? [])
  const calls = messages.flatMap((m: any) => m.tool_calls ?? []).map((c: any) => c.function.name)
  expect(calls).toContain('read')
  expect(calls).not.toContain('run_code')
  expect(calls).not.toContain('inspect_data')
  expect(JSON.stringify(messages.filter((m: any) => ['system', 'developer'].includes(m.role)))).toContain('已有信息足以回答')
  await expect(page.locator('.nb-pill')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('lightweight-query.png') })
})

test('假模型仍强行调用时，明确内核禁令在执行前拦截，普通查询与讨论门分别保留', async ({ dawn }, info) => {
  const { page, requests } = dawn
  await 在项目里开会话(page)
  const box = page.locator('main.main .composer-box textarea')
  await box.fill('工具边界验收\n先不要启动内核，只查看已有状态。')
  await box.press('Enter')
  await expect(page.locator('.turns')).toContainText('内核调用已被运行时拦住')
  expect(JSON.stringify(requests)).toContain('用户明确要求不要启动或使用内核')
  await expect(page.locator('.nb-pill')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('kernel-denied.png') })
  await box.fill('工具边界验收：恢复内核\n现在允许使用 Python 内核做统计。')
  await box.press('Enter')
  await expect(page.locator('.turns')).toContainText('内核使用限制已解除')
  // 夹具故意未配置解释器：证明调用已进入内核层；不伪称计算成功。
  expect(JSON.stringify(requests)).toMatch(/还没配|请用户选一个解释器/)
})

test('服务器会话请求明确远端位置，cd结果将新目录告知模型', async ({ dawn }) => {
  const { page, requests } = dawn
  const head = page.getByRole('button', { name: /^服务器/ })
  if (await head.getAttribute('aria-expanded') !== 'true') await head.click()
  await page.getByRole('button', { name: /添加服务器/ }).click()
  await page.locator('#conn-host').fill('fake.example')
  await page.locator('#conn-user').fill('dawn')
  await page.locator('#conn-label').fill('工具边界假服务器')
  await page.locator('#conn-secret').fill('dawn')
  await page.getByRole('button', { name: '保存并连接', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '添加服务器', exact: true })).toHaveCount(0)
  await page.locator('.remote-row').first().getByRole('button', { name: '新建远端任务', exact: true }).click()
  await expect(page.locator('.conv-remote')).toBeVisible()
  const box = page.locator('main.main .composer-box textarea')
  await box.fill('工具边界验收：查询已有下载进度')
  await box.press('Enter')
  await expect(page.locator('.turns')).toContainText('剩余10个文件')
  const all = JSON.stringify(requests)
  expect(all).toContain('远端执行上下文')
  expect(all).toContain('本机元数据')
  expect(all).toContain('/home/dawn')
  await box.fill('工具边界验收：切换目录')
  await box.press('Enter')
  await expect(page.locator('.turns')).toContainText('[当前目录 /home/dawn/数据]')
  expect(JSON.stringify(requests)).toContain('[当前目录 /home/dawn/数据]')
})

test.describe('格式化工具名的明确禁令', () => {
  test.use({ dawnOptions: { toolCall: { toolName: 'run_code', args: { language: 'python', code: 'print(2)' } } } })
  test('@python 后明确禁用行内代码格式的 run_code，仍在起内核前拒绝', async ({ dawn }) => {
    await 在项目里开会话(dawn.page)
    await dawn.page.getByPlaceholder(/输入问题/).fill('@python 请不要调用 `run_code`，只查看已有状态。')
    await dawn.page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(dawn.page.getByText('假模型已应答').last()).toBeVisible()
    expect(JSON.stringify(dawn.requests)).toContain('不能调用run_code')
    await expect(dawn.page.locator('.nb-pill')).toHaveCount(0)
  })
})
