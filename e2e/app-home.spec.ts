import { test, expect, CANNED_REPLY } from './fixtures.js'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

test.describe('App homepage', () => {
  test.use({ dawnOptions: { showHome: true } })

  test('shows one brand, larger actions on one row, and persistent favorite groups', async ({ dawn }, info) => {
    const { page } = dawn
    await expect(page.locator('.app-home-project-card').first()).toBeVisible()
    await expect(page.locator('.app-home-shell > header')).toHaveCount(0)
    const actions = await page.locator('.app-home-actions button').evaluateAll(buttons => buttons.map(button => ({ y: button.getBoundingClientRect().y, height: button.getBoundingClientRect().height, icon: button.querySelector('svg')!.getBoundingClientRect().width })))
    expect(actions).toHaveLength(3)
    expect(new Set(actions.map(action => action.y)).size).toBe(1)
    expect(actions.every(action => action.height >= 42 && action.icon >= 20)).toBe(true)
    const star = page.locator('.app-home-project-card').first().getByRole('button', { name: /^收藏项目：/ })
    await star.click()
    const favorites = page.getByRole('group', { name: '已收藏 · 优先显示', exact: true })
    await expect(favorites.locator('[aria-pressed="true"]')).toContainText('已收藏')
    await page.reload()
    await expect(favorites).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: info.outputPath('home-favorites-light.png') })
    await favorites.getByRole('button', { name: /^取消收藏项目：/ }).click()
    await expect(favorites).toHaveCount(0)
    await expect(page.getByRole('group', { name: '本地项目', exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 760 })
    expect(await page.locator('.app-home').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: info.outputPath('home-mobile-light.png') })
  })

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
    await page.screenshot({ animations: 'disabled', path: info.outputPath('homepage-light.png') })
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
    await page.screenshot({ animations: 'disabled', path: info.outputPath('homepage-dark-narrow.png') })
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


test.describe('home remote workspace entry', () => {
  test.use({ dawnOptions: { showHome: true, fakeSsh: true } })
  test('shows a saved remote directory and restores that remote session', async ({ dawn }, info) => {
    const { page } = dawn
    const remote = await page.evaluate(async () => {
      const call = async (op: string, req: unknown) => {
        const result = await window.dawn!.invoke(op, req)
        if (!result.ok) throw new Error(JSON.stringify(result.error))
        return result.data as any
      }
      const providers = await call('getProviders', {})
      const connection = await call('saveConnection', { label: '科研服务器', host: 'fake.example', username: 'dawn', secret: 'dawn' })
      const session = await call('createRemoteSession', { connectionId: connection.id, agentId: providers.agents[0].agentId })
      await call('renameSession', { sessionId: session.sessionId, title: '远程研究进度' })
      return session
    })
    await page.reload()
    const workspaces = page.getByRole('group', { name: '远程工作区', exact: true })
    await expect(workspaces).toContainText('科研服务器')
    await expect(workspaces).toContainText(remote.remote.cwd)
    await page.locator('.app-home-project-card').first().getByRole('button', { name: /^收藏项目：/ }).click()
    await expect(page.getByRole('group', { name: '已收藏 · 优先显示', exact: true })).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: info.outputPath('home-remote-light.png') })
    await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({ animations: 'disabled', path: info.outputPath('home-remote-dark.png') })
    await workspaces.getByRole('button').click()
    await expect(page.locator('.composer textarea')).toBeVisible()
    await expect(page.locator('.app-home')).toHaveCount(0)
    // The visible conversation heading confirms the existing remote session was restored.
    await expect(page.locator('.conv-title')).toContainText('远程研究进度')
  })
})
