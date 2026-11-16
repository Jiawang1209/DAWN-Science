import { test, expect, CANNED_REPLY } from './fixtures.js'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

test.describe('App homepage', () => {
  test.use({ dawnOptions: { showHome: true } })

  test('launches at home, preserves chat drafts and returns from the four-step guide', async ({ dawn }, info) => {
    const { page } = dawn
    await expect(page.getByRole('heading', { name: 'DAWN Science', exact: true })).toBeVisible()
    await page.locator('.app-home').getByRole('button', { name: '新建对话', exact: true }).click()
    const field = page.locator('.composer textarea')
    await field.fill('只测试首页入口')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
    await field.fill('保留这份尚未发送的草稿')
    await page.getByRole('button', { name: '首页', exact: true }).click()
    const recent = page.locator('.app-home').getByRole('button', { name: /上次进行到这里/ })
    await expect(recent).toContainText('只测试首页入口')
    await page.screenshot({ path: info.outputPath('homepage-light.png') })
    await recent.click()
    await expect(field).toHaveValue('保留这份尚未发送的草稿')
    await page.locator('.app-statusbar').getByRole('button', { name: '导航栏', exact: true }).click()
    const wizard = page.locator('.setup-wizard')
    await expect(wizard.getByRole('heading', { name: '欢迎使用 DAWN Science', exact: true })).toBeVisible()
    await wizard.getByRole('button', { name: '先跳过', exact: true }).click()
    await expect(field).toHaveValue('保留这份尚未发送的草稿')
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await page.locator('.app-home-status').getByRole('button', { name: '导航栏', exact: true }).click()
    await wizard.getByRole('button', { name: '先跳过', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'DAWN Science', exact: true })).toBeVisible()
    await page.setViewportSize({ width: 700, height: 700 })
    expect(await page.locator('.app-home').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({ path: info.outputPath('homepage-dark-narrow.png') })
  })

  test('opens a recent conversation from a different project', async ({ dawn }) => {
    const other = join(dawn.dir, 'another-project'); mkdirSync(other)
    await dawn.page.evaluate(async workspace => {
      const providers = (await window.dawn!.invoke('getProviders', {})).data as { agents: { agentId: string }[] }
      const created = await window.dawn!.invoke('createTask', { agentId: providers.agents[0]!.agentId, workspace })
      if (!created.ok) throw new Error(JSON.stringify(created.error))
      const task = created.data as { sessionId: string }
      await window.dawn!.invoke('renameSession', { sessionId: task.sessionId, title: '另一个项目的研究' })
    }, other)
    await dawn.page.reload()
    await dawn.page.locator('.app-home').getByRole('button', { name: /另一个项目的研究/ }).click()
    await expect(dawn.page.locator('.composer textarea')).toBeVisible()
    await dawn.page.locator('.composer textarea').fill('项目归属测试')
    await dawn.page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(dawn.page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
    const tasks = await dawn.page.evaluate(async () => (await window.dawn!.invoke('listTasks', {})).data) as { workspace?: string; title?: string }[]
    expect(tasks.some(task => task.workspace === other && task.title === '另一个项目的研究')).toBe(true)
  })

  test('a project card starts the first conversation in that directory, and new chat resets it', async ({ dawn }) => {
    const { page } = dawn
    await page.locator('.app-home-project').first().click()
    await page.locator('.composer textarea').fill('这个项目的第一句')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
    const tasks = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {})).data) as { workspace?: string; title?: string }[]
    expect(tasks.some(task => task.workspace === dawn.workspace && task.title === '这个项目的第一句')).toBe(true)
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await page.locator('.app-home').getByRole('button', { name: '新建对话', exact: true }).click()
    await page.locator('.composer textarea').fill('不关联项目的新对话')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
    const after = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {})).data) as { workspace?: string; title?: string }[]
    expect(after.find(task => task.title === '不关联项目的新对话')?.workspace).toBeUndefined()
  })
})

test.describe('home directory chooser', () => {
  test.use({ dawnOptions: { showHome: true, pickDirectory: '/tmp' } })
  test('opens the native directory choice and uses it for the first message', async ({ dawn }) => {
    const { page } = dawn
    await page.locator('.app-home').getByRole('button', { name: '打开项目', exact: true }).click()
    await page.locator('.composer textarea').fill('使用刚选择的项目目录')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
    const tasks = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {})).data) as { workspace?: string; title?: string }[]
    expect(tasks.find(task => task.title === '使用刚选择的项目目录')?.workspace).toMatch(/\/(?:private\/)?tmp$/)
  })
})

test.describe('first-run home', () => {
  test.use({ dawnOptions: { showSetup: true, showHome: true } })
  test('four steps finish at home before opening the workbench', async ({ dawn }) => {
    const { page } = dawn, wizard = page.locator('.setup-wizard')
    await expect(wizard.getByRole('heading', { name: '欢迎使用 DAWN Science', exact: true })).toBeVisible()
    await wizard.getByRole('button', { name: '下一页', exact: true }).click()
    await wizard.getByRole('button', { name: '下一页', exact: true }).click()
    await wizard.getByRole('button', { name: '稍后配置', exact: true }).click()
    await wizard.getByRole('button', { name: /开始使用|跳过，进入首页/ }).click()
    await expect(wizard).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'DAWN Science', exact: true })).toBeVisible()
    await page.locator('.app-home').getByRole('button', { name: '新建对话', exact: true }).click()
    await expect(page.locator('.composer textarea')).toBeVisible()
  })
})
