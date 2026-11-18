import { test, expect, CANNED_REPLY } from './fixtures.js'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { 科研目录 } from '../src/policy/science-layout.js'

test.describe('new project from the approved homepage', () => {
  test.use({ dawnOptions: { showHome: true, pickDirectory: '/tmp' } })

  test('previews and creates shared research folders, enters the project and persists metadata', async ({ dawn }, info) => {
    const { page } = dawn
    const name = `dawn-project-e2e-${Date.now()}`
    // Use the chooser then select this fixture's isolated parent, keeping created files disposable.
    await page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建项目', exact: true })
    await dialog.getByLabel('项目名称', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: '选择文件夹', exact: true }).click()
    await expect(dialog.getByLabel('保存位置', { exact: true })).toHaveValue('/tmp')
    await dialog.getByLabel('保存位置', { exact: true }).fill(dawn.dir)
    await dialog.getByLabel('项目说明（可选）', { exact: true }).fill('DAWN_DISPLAY_DESCRIPTION_PRIVATE')
    await expect(dialog.getByLabel(/Agent/)).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('new-project-simple.png'), scale: 'css' })
    await dialog.getByRole('button', { name: '初始化科研目录', exact: true }).click()
    const preview=dialog.getByRole('region', {name:'科研目录预览'})
    await expect(preview).toBeVisible()
    expect((await preview.locator('[data-path]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-path')))).sort()).toEqual([...科研目录].sort())
    expect(existsSync(join(dawn.dir,name))).toBe(false)
    const lastFolder=dialog.locator('.project-science-tree-row').last()
    const lastBox=(await lastFolder.boundingBox())!,footer=(await dialog.locator('.project-dialog-actions').boundingBox())!
    expect(lastBox.y+lastBox.height).toBeLessThanOrEqual(footer.y)
    await page.screenshot({ path: info.outputPath('new-project-light.png'), scale:'css' })
    await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const target = realpathSync(join(dawn.dir, name))
    for (const directory of 科研目录) expect(existsSync(join(target,directory))).toBe(true)
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toContain('产物落位')
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).not.toContain('DAWN_DISPLAY_DESCRIPTION_PRIVATE')
    const reopened = await page.evaluate(async ({ workspace, target }) => {
      const before = (await window.dawn!.invoke('listProjects', {})).data as { projectId: string; workspace: string }[]
      const opened = await window.dawn!.invoke('openProject', { workspace })
      if (!opened.ok) throw new Error(JSON.stringify(opened.error))
      const after = (await window.dawn!.invoke('listProjects', {})).data as unknown[]
      return { expected: before.find(row => row.workspace === target)?.projectId, actual: (opened.data as { projectId: string }).projectId, countChanged: before.length !== after.length }
    }, { workspace: join(dawn.dir, name), target })
    expect(reopened.actual).toBe(reopened.expected)
    expect(reopened.countChanged).toBe(false)
    await page.locator('.composer textarea').fill('项目科研目录验收')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText(CANNED_REPLY, { exact: false }).last()).toBeVisible()
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

  test('removing research folders creates an empty project and cancelling writes nothing',async({dawn})=>{
    const {page}=dawn
    const name='plain-project-'+Date.now()
    const open=page.locator('.app-home').getByRole('button',{name:'新建项目',exact:true})
    await open.click()
    let dialog=page.getByRole('dialog',{name:'新建项目',exact:true})
    await dialog.getByLabel('项目名称',{exact:true}).fill(name)
    await dialog.getByLabel('保存位置',{exact:true}).fill(dawn.dir)
    await dialog.getByRole('button',{name:'初始化科研目录',exact:true}).press('Enter')
    const selected=dialog.getByRole('button',{name:'已选择科研目录',exact:true})
    await selected.press('Enter');await expect(selected).toHaveAttribute('aria-expanded','false')
    await expect(selected).toHaveAttribute('aria-pressed','true')
    await dialog.getByRole('button',{name:'取消',exact:true}).click()
    expect(existsSync(join(dawn.dir,name))).toBe(false)
    await open.click();dialog=page.getByRole('dialog',{name:'新建项目',exact:true})
    await dialog.getByLabel('项目名称',{exact:true}).fill(name)
    await dialog.getByLabel('保存位置',{exact:true}).fill(dawn.dir)
    await dialog.getByRole('button',{name:'初始化科研目录',exact:true}).click()
    await dialog.getByRole('button',{name:'取消添加',exact:true}).click()
    await expect(dialog.getByRole('button',{name:'初始化科研目录',exact:true})).toBeFocused()
    await dialog.getByRole('button',{name:'创建项目',exact:true}).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.composer textarea')).toBeVisible()
    expect(readdirSync(join(dawn.dir,name))).toEqual([])
  })

  test('rejects a duplicate target without changing files and fits a narrow dialog', async ({ dawn }, info) => {
    const { page } = dawn
    const name = `new-project-${Date.now()}`
    const created = await page.evaluate(async ({ name, parentDirectory }) => window.dawn!.invoke('createProject', { name, parentDirectory, agentContext: 'keep these instructions' }), { name, parentDirectory: dawn.dir })
    expect(created.ok).toBe(true)
    await page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建项目', exact: true })
    await dialog.getByLabel('项目名称', { exact: true }).fill(name)
    await dialog.getByLabel('保存位置', { exact: true }).fill(dawn.dir)
    await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('已存在')
    expect(readFileSync(join(dawn.dir, name, 'AGENTS.md'), 'utf8')).toBe('keep these instructions\n')
    await page.setViewportSize({ width: 600, height: 700 })
    await dialog.getByRole('button', { name: '初始化科研目录', exact: true }).click()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const lastRow=dialog.locator('.project-science-tree-row').last()
    await lastRow.scrollIntoViewIfNeeded()
    const rowBox=await lastRow.boundingBox(),errorBox=await dialog.getByRole('alert').boundingBox()
    expect(rowBox && errorBox && rowBox.y+rowBox.height<=errorBox.y).toBe(true)
    await page.evaluate(()=>document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({path:info.outputPath('project-dialog-dark.png'),scale:'css'})
    await expect(dialog.getByRole('button', { name: '创建项目', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath('project-dialog-narrow.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.app-home').getByRole('button', { name: '新建项目', exact: true })).toBeFocused()
  })
})
