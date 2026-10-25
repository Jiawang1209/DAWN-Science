import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, 在项目里开会话, 进坞, 进设置 } from './fixtures.js'
// @ts-expect-error Shared JavaScript fixture also used by dev:mock.
import { MATH_REPLY } from '../scripts/mock-markdown-math.mjs'

test.use({ dawnOptions: { toolCall: { toolName: 'write', args: { path: 'math.md', content: MATH_REPLY } } } })

async function send(page: import('@playwright/test').Page, slow = false) {
  await 在项目里开会话(page)
  const composer = page.locator('main.main').getByPlaceholder(/输入问题/)
  await composer.fill(`数学公式排版验收${slow ? '，慢慢说' : ''}：请解释 $x^2$。`)
  await composer.press('Enter')
  return page.locator('.turn.agent .md').last()
}

function watchErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (/Content Security Policy|Failed to decode downloaded font|OTS parsing error|\[markdown\]/i.test(m.text())) errors.push(m.text()) })
  return errors
}

test('用户与助手公式实际排版，字体本地可用，深浅主题和原文复制导出保持正确', async ({ dawn }, info) => {
  const { page, app, workspace } = dawn
  const errors = watchErrors(page)
  const reply = await send(page)
  await expect(reply.locator('.katex')).toHaveCount(4)
  await expect(page.locator('.thinking')).toHaveCount(0)
  await expect(page.locator('.turn.user math')).toHaveCount(1)
  await expect(reply.locator('math')).toHaveCount(4)
  await expect(reply.locator('.katex-display')).toHaveCount(3)
  await expect(reply.locator('mtable mtr')).toHaveCount(2)
  await expect(reply.locator('.katex-error')).toContainText('\\frac{1}{')
  await expect(reply.locator('p code')).toHaveText('$x^2$')
  await expect(reply.locator('pre')).toContainText('label = r"$\\alpha$"')
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    await document.fonts.load('16px KaTeX_Main', 'x')
    await document.fonts.load('italic 16px KaTeX_Math', 'x')
    return { main: document.fonts.check('16px KaTeX_Main', 'x'), math: document.fonts.check('italic 16px KaTeX_Math', 'x'), loaded: [...document.fonts].some(f => f.family === 'KaTeX_Main' && f.status === 'loaded') }
  })
  expect(fonts).toEqual({ main: true, math: true, loaded: true })
  const light = await reply.locator('.katex-html').first().evaluate(el => getComputedStyle(el).color)
  await reply.locator('h1').scrollIntoViewIfNeeded()
  await page.mouse.move(1180, 20)
  await expect(page.locator('.sess-hover-card')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('math-light.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '复制这段回答', exact: true }).last().click()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(MATH_REPLY)
  await page.locator('main.main').getByRole('button', { name: '导出对话', exact: true }).click()
  await expect(page.locator('.export-toast')).toContainText('已导出')
  const exported = (await page.locator('.export-toast').innerText()).match(/到 (.+\.md)/)?.[1]
  expect(readFileSync(exported!, 'utf8')).toContain(MATH_REPLY)
  expect(readFileSync(join(workspace, 'math.md'), 'utf8')).toBe(MATH_REPLY)
  await 进设置(page, '外观')
  await page.getByRole('radio', { name: '暗色', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dawn-dark/)
  expect(await reply.locator('.katex-html').first().evaluate(el => getComputedStyle(el).color)).not.toBe(light)
  await reply.locator('h1').scrollIntoViewIfNeeded()
  await page.mouse.move(1180, 20)
  await expect(page.locator('.sess-hover-card')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('math-dark.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})

test('Markdown 文件在窄坞中渲染，长公式只在自身横向滚动', async ({ dawn }, info) => {
  const { page, app } = dawn
  const errors = watchErrors(page)
  const reply = await send(page)
  await expect(reply.locator('.katex')).toHaveCount(4)
  await expect(page.locator('.thinking')).toHaveCount(0)
  await 进坞(page, '文件')
  await page.getByRole('button', { name: /^math\.md/ }).click()
  const preview = page.locator('.right-dock .file-preview')
  await expect(preview.locator('.katex')).toHaveCount(4)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 800))
  const long = preview.locator('.katex-display').last()
  await long.scrollIntoViewIfNeeded()
  const measure = await long.evaluate(el => {
    el.scrollLeft = 120
    return { width: el.clientWidth, content: el.scrollWidth, left: el.scrollLeft, overflow: getComputedStyle(el).overflowX }
  })
  expect(measure.overflow).toBe('auto')
  expect(measure.content).toBeGreaterThan(measure.width)
  expect(measure.left).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('math-narrow-preview.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})

test('逐字流式输出的公式补齐后没有重复、残影或整段回退', async ({ dawn }, info) => {
  const { page } = dawn
  const errors = watchErrors(page)
  const reply = await send(page, true)
  await expect(reply.locator('.katex').first()).toBeVisible()
  await expect(page.locator('.thinking')).not.toHaveCount(0)
  await page.screenshot({ path: info.outputPath('math-streaming.png'), animations: 'disabled' })
  await expect(page.locator('.thinking')).toHaveCount(0)
  await expect(reply.locator('.katex')).toHaveCount(4)
  await expect(reply.locator('.katex-error')).toHaveCount(1)
  await expect(reply.locator('.md-raw')).toHaveCount(0)
  await expect(reply).toContainText('错误之后的说明仍然可读')
  expect(errors).toEqual([])
})
