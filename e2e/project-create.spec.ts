import { test, expect } from './fixtures.js'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

test.describe('new project from the approved homepage', () => {
  test.use({ dawnOptions: { showHome: true, pickDirectory: '/tmp' } })

  test('creates a project, reads its context in the first conversation and persists metadata', async ({ dawn }, info) => {
    const { page } = dawn
    const name = `dawn-project-e2e-${Date.now()}`
    // Use the chooser then select this fixture's isolated parent, keeping created files disposable.
    await page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建项目', exact: true })
    await dialog.getByLabel('项目名称', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: '浏览目录', exact: true }).click()
    await expect(dialog.getByLabel('父目录', { exact: true })).toHaveValue('/tmp')
    await dialog.getByLabel('父目录', { exact: true }).fill(dawn.dir)
    await dialog.getByLabel('项目说明（可选）', { exact: true }).fill('DAWN_DISPLAY_DESCRIPTION_PRIVATE')
    await dialog.locator('summary').click()
    await dialog.getByRole('checkbox', { name: '建立标准科研目录', exact: true }).check()
    await dialog.getByLabel('Agent 上下文（可选）', { exact: true }).fill('DAWN_PROJECT_CONTEXT_ACCEPT: use R and preserve raw data.')
    await page.screenshot({ path: info.outputPath('new-project-light.png') })
    await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const target = realpathSync(join(dawn.dir, name))
    expect(existsSync(join(target, 'analysis/scripts'))).toBe(true)
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toContain('DAWN_PROJECT_CONTEXT_ACCEPT')
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).not.toContain('DAWN_DISPLAY_DESCRIPTION_PRIVATE')
    await page.locator('.composer textarea').fill('项目上下文验收')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('项目约定：已读取；展示说明：未发送', { exact: false }).last()).toBeVisible()
    const tasks = await page.evaluate(async () => (await window.dawn!.invoke('listTasks', {})).data) as { workspace?: string }[]
    expect(tasks.some(task => task.workspace === target)).toBe(true)
    await page.getByRole('button', { name: '首页', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('button', { name: new RegExp(name) }) })
    await expect(card).toContainText('DAWN_DISPLAY_DESCRIPTION_PRIVATE')
    await page.getByRole('button', { name: `收藏项目：${name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `取消收藏项目：${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: `项目设置：${name}`, exact: true }).click()
    const settings = page.getByRole('dialog', { name: '项目设置', exact: true })
    await settings.getByLabel('项目名称', { exact: true }).fill('重命名研究项目')
    await settings.getByRole('button', { name: '保存设置', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: '取消收藏项目：重命名研究项目', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('homepage-project-light.png') })
    await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({ path: info.outputPath('homepage-project-dark.png') })
  })

  test('rejects a duplicate target without changing files and fits a narrow dialog', async ({ dawn }, info) => {
    const { page } = dawn
    const name = `new-project-${Date.now()}`
    const created = await page.evaluate(async ({ name, parentDirectory }) => window.dawn!.invoke('createProject', { name, parentDirectory, agentContext: 'keep these instructions' }), { name, parentDirectory: dawn.dir })
    expect(created.ok).toBe(true)
    await page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建项目', exact: true })
    await dialog.getByLabel('项目名称', { exact: true }).fill(name)
    await dialog.getByLabel('父目录', { exact: true }).fill(dawn.dir)
    await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('已存在')
    expect(readFileSync(join(dawn.dir, name, 'AGENTS.md'), 'utf8')).toBe('keep these instructions\n')
    await page.setViewportSize({ width: 600, height: 700 })
    await dialog.locator('summary').click()
    await dialog.getByRole('checkbox', { name: '建立标准科研目录', exact: true }).check()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const context = dialog.getByLabel('Agent 上下文（可选）', { exact: true })
    await context.scrollIntoViewIfNeeded()
    const contextBox = await context.boundingBox(), errorBox = await dialog.getByRole('alert').boundingBox()
    expect(contextBox && errorBox && contextBox.y + contextBox.height <= errorBox.y).toBe(true)
    await expect(dialog.getByRole('button', { name: '创建项目', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath('project-dialog-narrow.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true })).toBeFocused()
  })
})
