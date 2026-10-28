import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test, expect, 在项目里开会话, CANNED_REPLY } from './fixtures.js'
import type { Page } from '@playwright/test'

async function invoke(page: Page, operation: string, input: unknown = {}) {
  return page.evaluate(async ({ operation, input }) => {
    const result = await window.dawn!.invoke(operation, input)
    if (!result.ok) throw new Error(result.error?.message)
    return result.data as any
  }, { operation, input })
}
const main = (page: Page) => page.locator('main.main')
async function openMenu(page: Page) {
  await main(page).locator('.ws-chip').click()
  const menu = page.getByRole('dialog', { name: '工作目录', exact: true })
  await expect(menu).toBeVisible()
  return menu
}
async function send(page: Page, text: string) {
  await main(page).getByRole('textbox').fill(text)
  await main(page).getByRole('textbox').press('Enter')
  await expect(main(page).locator('.turns')).toContainText(CANNED_REPLY)
}

test.describe('default working directory', () => {
  test.use({ dawnOptions: { toolCall: { when: 'WRITE_DEFAULT', toolName: 'bash', args: { command: 'printf DEFAULT_WORKSPACE_OK > default-proof.txt' }, perTurn: true } } })
  test('默认菜单与新建任务均使用设置目录，每段会话独立落盘，更新设置只影响新会话', async ({ dawn }, info) => {
    const { page, workspace } = dawn
    const firstRoot = join(workspace, '默认 工作目录')
    const secondRoot = join(workspace, '新 默认目录')
    await invoke(page, 'setDefaultWorkspace', { path: firstRoot })
    await page.reload()
    const menu = await openMenu(page)
    await expect(menu.locator('.workspace-menu-default')).toContainText(firstRoot)
    await menu.locator('.workspace-menu-default').click()
    await send(page, 'WRITE_DEFAULT_ONE')
    const first = (await invoke(page, 'listTasks'))[0]
    expect(first.workspace).toBeUndefined()
    expect(relative(firstRoot, first.scratchWorkspace).startsWith(`scratch${sep}`)).toBe(true)
    expect(readFileSync(join(first.scratchWorkspace, 'default-proof.txt'), 'utf8')).toBe('DEFAULT_WORKSPACE_OK')
    await (await openMenu(page)).locator('.workspace-menu-default').click()
    await expect(page.locator('.welcome')).toBeVisible()
    expect(await invoke(page, 'listTasks')).toHaveLength(1)
    await send(page, 'WRITE_DEFAULT_TWO')
    const second = (await invoke(page, 'listTasks')).find((task: any) => task.taskId !== first.taskId)
    expect(second.scratchWorkspace).not.toBe(first.scratchWorkspace)
    expect(relative(firstRoot, second.scratchWorkspace).startsWith(`scratch${sep}`)).toBe(true)
    expect(existsSync(join(first.scratchWorkspace, 'default-proof.txt'))).toBe(true)
    await invoke(page, 'setDefaultWorkspace', { path: secondRoot })
    await page.getByRole('button', { name: '新建任务', exact: true }).click()
    const updated = await openMenu(page)
    await expect(updated.locator('.workspace-menu-default')).toContainText(secondRoot)
    await updated.locator('.workspace-menu-default').click()
    await send(page, 'WRITE_DEFAULT_THREE')
    const third = (await invoke(page, 'listTasks')).find((task: any) => ![first.taskId, second.taskId].includes(task.taskId))
    expect(relative(secondRoot, third.scratchWorkspace).startsWith(`scratch${sep}`)).toBe(true)
    expect(readFileSync(join(third.scratchWorkspace, 'default-proof.txt'), 'utf8')).toBe('DEFAULT_WORKSPACE_OK')
    expect(existsSync(join(first.scratchWorkspace, 'default-proof.txt'))).toBe(true)
    await page.screenshot({ path: info.outputPath('default-working-directory.png'), animations: 'disabled' })
  })
})

test('最近目录可搜索和选择，默认项始终在底部，首页切回默认保留草稿', async ({ dawn }, info) => {
  const { page, workspace } = dawn
  const firstPath = join(workspace, '最近目录一')
  const secondPath = join(workspace, '最近目录二')
  const defaultPath = join(workspace, '默认目录')
  mkdirSync(firstPath, { recursive: true }); mkdirSync(secondPath, { recursive: true })
  await invoke(page, 'setDefaultWorkspace', { path: defaultPath })
  const agentId = (await invoke(page, 'getProviders')).agents.find((agent: any) => agent.kind === 'native').agentId
  await invoke(page, 'createTask', { agentId, workspace: firstPath })
  await invoke(page, 'createTask', { agentId, workspace: secondPath })
  await invoke(page, 'createTask', { agentId, workspace: secondPath })
  await page.reload()
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await main(page).getByRole('textbox').fill('保留这段草稿')
  const menu = await openMenu(page)
  await expect(menu.getByRole('menuitemradio', { name: secondPath, exact: true })).toHaveCount(1)
  await menu.getByRole('searchbox').fill('目录二')
  await expect(menu.getByRole('menuitemradio', { name: firstPath, exact: true })).toHaveCount(0)
  await expect(menu.getByRole('menuitemradio').last()).toContainText('默认工作目录')
  await expect(menu.locator('.workspace-menu-default')).toContainText(defaultPath)
  await page.screenshot({ path: info.outputPath('recent-directory-search.png'), animations: 'disabled' })
  await menu.getByRole('menuitemradio', { name: secondPath, exact: true }).click()
  await expect(main(page).locator('.ws-chip-label')).toHaveText('最近目录二')
  await expect(main(page).getByRole('textbox')).toHaveValue('保留这段草稿')
  await (await openMenu(page)).locator('.workspace-menu-default').click()
  await expect(main(page).locator('.ws-chip-label')).toHaveText('默认工作目录')
  await expect(main(page).getByRole('textbox')).toHaveValue('保留这段草稿')
  expect(await invoke(page, 'listTasks')).toHaveLength(3)
  await send(page, '这是新的临时会话')
  const fresh = (await invoke(page, 'listTasks')).find((task: any) => !task.workspace)
  expect(relative(defaultPath, fresh.scratchWorkspace).startsWith(`scratch${sep}`)).toBe(true)
})

test('项目内选默认目录开启新的临时任务，原对话和文件保持原位', async ({ dawn }) => {
  const { page, workspace } = dawn
  await invoke(page, 'setDefaultWorkspace', { path: join(workspace, '默认根') })
  writeFileSync(join(workspace, '原项目.txt'), '原数据')
  await 在项目里开会话(page)
  await send(page, 'PROJECT_ORIGINAL_CONTEXT')
  const original = (await invoke(page, 'listTasks')).find((task: any) => task.workspace === workspace)
  await (await openMenu(page)).locator('.workspace-menu-default').click()
  await expect(page.locator('.welcome')).toBeVisible()
  await send(page, 'FRESH_TEMPORARY_CONTEXT')
  const tasks = await invoke(page, 'listTasks')
  expect(tasks.find((task: any) => task.taskId === original.taskId)).toMatchObject({ workspace, sessionId: original.sessionId })
  expect(tasks.find((task: any) => !task.workspace).sessionId).not.toBe(original.sessionId)
  expect(readFileSync(join(workspace, '原项目.txt'), 'utf8')).toBe('原数据')
})
