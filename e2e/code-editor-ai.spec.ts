import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { discoverKernelSpecs } from '../src/kernel/specs.js'
import { test, expect, 在项目里开会话, 进坞, type DawnFixture } from './fixtures.js'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const finalPython = 'shared_value = 41\n# unsaved context retained\nprint(shared_value + 2)'
const savedPython = 'shared_value = 41\n# original disk comment\nprint(shared_value + 1)'
const draftPython = finalPython.replace('+ 2)', '+ 1)')
const pythonReply = '```python\n' + finalPython + '\n```'

async function openInitial(dawn: DawnFixture, title: string) {
  const { page } = dawn
  await 在项目里开会话(page)
  const chat = page.locator('.conversation .composer textarea')
  await chat.fill(title)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
  const pane = page.getByRole('region', { name: '代码编辑区', exact: true })
  const editor = pane.getByRole('textbox', { name: '脚本代码编辑器', exact: true })
  await expect(editor).toBeVisible()
  return { page, chat, pane, editor }
}

async function source(editor: Locator) {
  return editor.evaluate(el => {
    const node = el as HTMLElement & { cmTile: { root: { view: { state: { sliceDoc(): string } } } } }
    return node.cmTile.root.view.state.sliceDoc()
  })
}

async function selectLastLine(editor: Locator) {
  await editor.focus()
  await editor.press(`${modifier}+a`)
  await editor.press('ArrowRight')
  await editor.press(process.platform === 'darwin' ? 'Control+l' : 'Alt+l')
}

async function attachAndSend(page: Page, pane: Locator, editor: Locator, chat: Locator, draft: string) {
  await selectLastLine(editor)
  await pane.getByRole('button', { name: '带入对话', exact: true }).click()
  const context = await chat.inputValue()
  expect(context).toContain(draft)
  expect(context).toContain('需要修改的选区')
  expect(context).toContain('<!-- dawn-script-edit:')
  expect(context).toContain(draft.split('\n').at(-1)!)
  await chat.fill('请只修改最后一条输出语句，保留其余代码与未保存的注释。\n\n' + context)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const review = page.getByRole('button', { name: '查看差异', exact: true })
  await expect(review).toBeVisible()
  return review
}

test.describe('original script revision', () => {
  test.use({ dawnOptions: { reply: pythonReply } })

  test('carries the full unsaved draft, reviews a diff and applies back to the same saved script with undo', async ({ dawn }) => {
    const { page, pane, editor, chat } = await openInitial(dawn, '基于原脚本改代码')
    const path = join(dawn.workspace, 'ai-apply.py')
    await editor.fill(savedPython)
    await pane.getByRole('textbox', { name: '脚本保存路径', exact: true }).fill('ai-apply.py')
    await pane.getByRole('button', { name: '保存脚本', exact: true }).click()
    await expect.poll(() => existsSync(path) && readFileSync(path, 'utf8')).toBe(savedPython)
    await editor.fill(draftPython)
    const requestsBeforeAttach = dawn.requests.length
    const review = await attachAndSend(page, pane, editor, chat, draftPython)
    expect(dawn.requests.length).toBeGreaterThan(requestsBeforeAttach)
    const requests = dawn.requests as { body?: { messages?: { role?: string; content?: unknown }[] } }[]
    expect(requests.some(r => r.body?.messages?.some(m => m.role === 'user' && (
      typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(c => (c as { text?: string }).text ?? '').join('') : ''
    ).includes(draftPython)))).toBe(true)
    expect(await source(editor)).toBe(draftPython)
    expect(readFileSync(path, 'utf8')).toBe(savedPython)
    await review.click()
    const dialog = page.getByRole('dialog', { name: '审阅脚本修改', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-kind="del"]')).toContainText('print(shared_value + 1)')
    await expect(dialog.locator('[data-kind="add"]')).toContainText('print(shared_value + 2)')
    await expect(dialog).toContainText(path)
    expect(await source(editor)).toBe(draftPython)
    expect(readFileSync(path, 'utf8')).toBe(savedPython)
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
    }
    await page.screenshot({ path: 'output/playwright/code-editor/ai-edit-diff-light.png' })
    await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({ path: 'output/playwright/code-editor/ai-edit-diff-dark.png' })
    await page.setViewportSize({ width: 1000, height: 740 })
    const fit = await dialog.evaluate(el => {
      const bounds = el.getBoundingClientRect()
      const button = el.querySelector('footer button:last-child')!.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight && button.bottom <= innerHeight
    })
    expect(fit).toBe(true)
    await page.screenshot({ path: 'output/playwright/code-editor/ai-edit-diff-narrow.png' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(review).toBeFocused()
    expect(await source(editor)).toBe(draftPython)
    await review.click()
    await dialog.getByRole('button', { name: '应用到原脚本', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => source(editor)).toBe(finalPython)
    await expect(pane.locator('.code-editor-name')).toHaveText('ai-apply.py •')
    await expect(pane.getByRole('textbox', { name: '脚本保存路径', exact: true })).toHaveCount(0)
    expect(readFileSync(path, 'utf8')).toBe(savedPython)
    await editor.focus()
    await editor.press(`${modifier}+z`)
    await expect.poll(() => source(editor)).toBe(draftPython)
    await editor.press(`${modifier}+Shift+z`)
    await expect.poll(() => source(editor)).toBe(finalPython)
    await pane.getByRole('button', { name: '保存脚本', exact: true }).click()
    await expect.poll(() => readFileSync(path, 'utf8')).toBe(finalPython)
    await pane.getByRole('button', { name: '收起代码编辑区', exact: true }).click()
    await page.getByRole('button', { name: '回到原脚本', exact: true }).click()
    await expect.poll(() => source(editor)).toBe(finalPython)
    await expect(pane.locator('.code-editor-name')).toHaveText('ai-apply.py')

    const title = (await page.getByRole('tab', { selected: true }).innerText()).trim()
    await page.reload()
    await page.getByText(title, { exact: true }).click()
    await expect(page.getByRole('button', { name: '修改请求已失效', exact: true })).toBeDisabled()
    expect(readFileSync(path, 'utf8')).toBe(finalPython)
  })

  test('keeps CRLF script bytes when the native composer normalizes attached context to LF', async ({ dawn }) => {
    const { page } = dawn
    const path = join(dawn.workspace, 'crlf.py')
    const original = draftPython.replaceAll('\n', '\r\n')
    const expected = finalPython.replaceAll('\n', '\r\n')
    writeFileSync(path, original)
    await 在项目里开会话(page)
    const chat = page.locator('.conversation .composer textarea')
    await chat.fill('修改 Windows 换行脚本')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByRole('button', { name: '在旁边编辑', exact: true })).toBeVisible()
    await 进坞(page, '文件')
    await page.getByRole('button', { name: /^crlf\.py/ }).click()
    await page.getByRole('button', { name: '编辑脚本', exact: true }).click()
    const pane = page.getByRole('region', { name: '代码编辑区', exact: true })
    const editor = pane.getByRole('textbox', { name: '脚本代码编辑器', exact: true })
    await expect.poll(() => source(editor)).toBe(original)
    await selectLastLine(editor)
    await pane.getByRole('button', { name: '带入对话', exact: true }).click()
    const context = await chat.inputValue()
    expect(context).toContain(draftPython)
    expect(context).not.toContain('\r')
    await chat.fill('请修改最后一行，其余代码保持原样。\n\n' + context)
    await page.getByRole('button', { name: '发送', exact: true }).click()
    const review = page.getByRole('button', { name: '查看差异', exact: true })
    await expect(review).toBeVisible()
    expect(await source(editor)).toBe(original)
    expect(readFileSync(path, 'utf8')).toBe(original)
    await review.click()
    await page.getByRole('dialog', { name: '审阅脚本修改', exact: true }).getByRole('button', { name: '应用到原脚本', exact: true }).click()
    await expect.poll(() => source(editor)).toBe(expected)
    expect(readFileSync(path, 'utf8')).toBe(original)
    await pane.getByRole('button', { name: '保存脚本', exact: true }).click()
    await expect.poll(() => readFileSync(path, 'utf8')).toBe(expected)
  })

  test('blocks an AI reply after the original draft changes before review', async ({ dawn }) => {
    const { page, pane, editor, chat } = await openInitial(dawn, '保留后续人工修改')
    await editor.fill(draftPython)
    const review = await attachAndSend(page, pane, editor, chat, draftPython)
    const later = draftPython.replace('shared_value = 41', 'shared_value = 99')
    await editor.fill(later)
    await review.click()
    const dialog = page.getByRole('dialog', { name: '审阅脚本修改', exact: true })
    await expect(dialog.getByRole('alert')).toContainText('原脚本草稿已改变')
    await expect(dialog.getByRole('button', { name: '应用到原脚本', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: '暂不应用', exact: true }).click()
    expect(await source(editor)).toBe(later)
  })
})

test.describe('selection fragment revision', () => {
  test.use({ dawnOptions: { reply: '```python\nprint(shared_value + 2)\n```' } })
  test('explicitly replaces only the selected range when the AI returns a fragment', async ({ dawn }) => {
    const { page, pane, editor, chat } = await openInitial(dawn, '选区片段回到完整脚本')
    await editor.fill(draftPython)
    const review = await attachAndSend(page, pane, editor, chat, draftPython)
    await review.click()
    const dialog = page.getByRole('dialog', { name: '审阅脚本修改', exact: true })
    await dialog.getByRole('radio', { name: '仅替换所选代码', exact: true }).check()
    await expect(dialog.locator('[data-kind="del"]')).toHaveCount(1)
    await expect(dialog.locator('[data-kind="context"]').first()).toContainText('shared_value = 41')
    await dialog.getByRole('button', { name: '应用到原脚本', exact: true }).click()
    await expect.poll(() => source(editor)).toBe(finalPython)
    await expect(pane.locator('.code-editor-name')).toContainText('未保存脚本')
  })
})

const r = process.env.DAWN_E2E_R ?? discoverKernelSpecs().specs.find(s => s.language?.toLowerCase() === 'r')?.executable
let rReady = false
if (r) try {
  execFileSync(r, ['--vanilla', '--slave', '-e', 'quit(status=if(requireNamespace("IRkernel",quietly=TRUE)&&requireNamespace("ggplot2",quietly=TRUE))0 else 1)'], { stdio: 'ignore', timeout: 20000 })
  rReady = true
} catch { /* Core apply tests above still run without a local R kernel. */ }
const finalR = 'library(ggplot2)\np <- ggplot(iris, aes(Sepal.Length, Petal.Length, color = Species)) + geom_point()\n# unsaved plot context retained\nprint(p + theme_minimal())'
const draftR = finalR.replace('print(p + theme_minimal())', 'print(p)')

test.describe('real R original-script execution', () => {
  test.use({ dawnOptions: { reply: '```R\n' + finalR + '\n```', realKernels: true } })
  test('runs the reviewed original R script and then a selection in its same real plotting kernel', async ({ dawn }) => {
    test.skip(!rReady || !r, '本机缺少 R、IRkernel 或 ggplot2；核心回写验收另行执行')
    test.setTimeout(120000)
    const { page, pane, editor, chat } = await openInitial(dawn, 'R 原脚本修改后绘图')
    expect((await page.evaluate(path => window.dawn!.invoke('setInterpreter', { language: 'R', path }), r!)).ok).toBe(true)
    await editor.fill(draftR)
    const review = await attachAndSend(page, pane, editor, chat, draftR)
    await review.click()
    await page.getByRole('dialog', { name: '审阅脚本修改', exact: true }).getByRole('button', { name: '应用到原脚本', exact: true }).click()
    await expect.poll(() => source(editor)).toBe(finalR)
    await editor.focus()
    await editor.press(`${modifier}+a`)
    await editor.press('ArrowRight')
    await pane.getByRole('button', { name: '运行脚本', exact: true }).click()
    const gallery = pane.getByRole('region', { name: '会话图形历史', exact: true })
    await expect(gallery).toBeVisible({ timeout: 45000 })
    await expect.poll(() => gallery.locator('img.kout-img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await selectLastLine(editor)
    await pane.getByRole('button', { name: '运行选区', exact: true }).click()
    await expect(pane.getByText('选区执行', { exact: true })).toBeVisible()
    await expect(pane.getByText('正在当前会话内核中执行…', { exact: true })).toHaveCount(0, { timeout: 45000 })
    await gallery.getByRole('button', { name: '图形列表', exact: true }).click()
    await expect(gallery.getByRole('combobox', { name: '选择历史图形', exact: true }).locator('option')).toHaveCount(2)
    await expect(pane.getByRole('alert')).toHaveCount(0)
    await page.screenshot({ path: 'output/playwright/code-editor/ai-edit-r-result.png' })
  })
})
