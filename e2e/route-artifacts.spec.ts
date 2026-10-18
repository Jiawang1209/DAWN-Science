/** Real tools, filesystem, protocol and Electron; deterministic inference only. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, 在项目里开会话 } from './fixtures.js'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const paths = ['figure.png', 'summary.csv', 'report.md']
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
const script = String.raw`const fs=require('node:fs');fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/figure.png',Buffer.from('${png}','base64'));fs.writeFileSync('outputs/summary.csv','group,value\nA,2\nB,4\n');fs.writeFileSync('outputs/report.md','# Capture report\nActual filesystem outputs.\n')`
const step = { id: 'S1', title: '采集验收', purpose: '核对文件捕获与路线引用，不作科研分析', inputs: ['input.csv'], outputs: ['future.csv'], dependencies: [], status: 'delivered', blockers: [], cases: [], deliverables: [...paths.map(path => ({ path: 'outputs/' + path })), ...paths.map(path => ({ path: 'references/' + path })), { path: 'missing.pdf' }], execution: { state: 'not_run', note: '文件采集验证，不声明科研计算完成' }, verification: { state: 'unreviewed', note: '未审查' }, needsReview: false, notes: [] }

test.describe('route outputs in the artifacts dock', () => {
  test.use({ dawnOptions: { gitInit: true, toolCall: [
    { toolName: 'bash', args: { command: `${quote(process.execPath)} -e ${quote(script)}` }, once: true },
    { toolName: 'update_analysis_route', args: { expectedRevision: 0, route: { title: '产物采集验证', goal: '查看图表报告', dataContext: [], steps: [step] } }, once: true },
  ] } })

  test('captures ignored script outputs and includes route references without claiming they were generated', async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, '.gitignore'), 'outputs/\nreferences/\n')
    writeFileSync(join(workspace, 'input.csv'), 'old input')
    mkdirSync(join(workspace, 'references'))
    writeFileSync(join(workspace, 'references/figure.png'), Buffer.from(png, 'base64'))
    writeFileSync(join(workspace, 'references/summary.csv'), 'group,value\nA,20\n')
    writeFileSync(join(workspace, 'references/report.md'), '# Existing report\nReference only.\n')
    await 在项目里开会话(page)
    const composer = page.locator('main.main .composer-field')
    await composer.fill('验证产物采集'); await composer.press('Enter')
    await expect(page.locator('.analysis-route-summary')).toBeVisible()
    const generated = page.getByRole('group', { name: '本轮生成的文件' })
    await expect(generated).toContainText('已生成 3 个文件')
    await generated.getByRole('button', { name: '查看产物', exact: true }).click()
    const dock = page.locator('.right-dock')
    await expect(dock.getByRole('button', { name: 'outputs/figure.png', exact: true })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'references/figure.png', exact: true })).toBeVisible()
    await expect(dock.getByText('路线登记', { exact: true })).toHaveCount(4)
    await expect(dock.getByRole('button', { name: 'missing.pdf', exact: true })).toBeDisabled()
    await expect(dock.getByRole('button', { name: 'input.csv', exact: true })).toHaveCount(0)
    await expect(dock.getByRole('button', { name: 'future.csv', exact: true })).toHaveCount(0)
    for (const path of paths) {
      await dock.getByRole('button', { name: 'outputs/' + path, exact: true }).click()
      if (path.endsWith('.png')) await dock.locator('.preview img').evaluate((img: HTMLImageElement) => img.decode())
      else await expect(dock.locator('.preview')).toContainText(path.endsWith('.csv') ? 'group' : 'Capture report')
      await dock.getByRole('button', { name: '收起预览', exact: true }).click()
    }
    await expect(dock.getByRole('button', { name: 'outputs/figure.png', exact: true })).toHaveCount(1)
  })
})
