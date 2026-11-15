import { test, expect, 在项目里开会话 } from './fixtures.js'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
for (const [language, assignment, prefix, builtin, indent] of [
  ['python', 'shared_value = 42', 'pri', 'print', '    '],
  ['r', 'shared_value <- 42', 'mea', 'mean', '  '],
] as const) test.describe(`${language} completion`, () => {
  test.use({ dawnOptions: { reply: `\`\`\`${language}\n${assignment}\n\`\`\`` } })
  test('offers local candidates, accepts with Tab/Enter, preserves indentation and composition', async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await page.locator('.conversation .composer textarea').fill('生成脚本')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByRole('button', { name: '在旁边编辑', exact: true }).click()
    const pane = page.getByRole('region', { name: '代码编辑区', exact: true })
    const editor = pane.getByRole('textbox', { name: '脚本代码编辑器', exact: true })
    const lines = () => editor.locator('.cm-line').allTextContents()
    await editor.fill(assignment + '\n')
    await editor.press('End')
    await page.keyboard.type(prefix, { delay: 70 })
    await expect(page.getByRole('option', { name: builtin, exact: true })).toBeVisible()
    await page.screenshot({ path: `output/playwright/code-editor/completion-${language}.png` })
    await page.evaluate(() => document.documentElement.classList.add('dawn-dark'))
    await page.screenshot({ path: `output/playwright/code-editor/completion-${language}-dark.png` })
    await page.evaluate(() => document.documentElement.classList.remove('dawn-dark'))
    await editor.press('Tab')
    await expect.poll(lines).toEqual([assignment, builtin])
    await editor.press(`${modifier}+z`)
    await expect.poll(lines).toEqual([assignment, prefix])
    await editor.press('Escape')

    await editor.fill(assignment + '\n')
    await editor.press('End')
    await page.keyboard.type('shared_v')
    await expect(page.getByRole('option', { name: 'shared_value', exact: true })).toBeVisible()
    await editor.press('Enter')
    await expect.poll(lines).toEqual([assignment, 'shared_value'])
    await editor.press('Tab')
    await expect.poll(lines).toEqual([assignment, indent + 'shared_value'])

    if (language === 'python') {
      await editor.fill('de')
      await editor.press('End')
      await editor.press('Control+Space')
      await page.getByRole('option', { name: /^def/ }).click()
      await expect.poll(lines).toEqual(['def name(params):', '    '])
      await editor.press('Tab')
      await page.keyboard.type('values')
      await expect.poll(async () => (await lines())[0]).toBe('def name(values):')
    }

    await editor.fill(assignment + '\n' + prefix)
    await editor.press('End')
    await editor.press('Control+Space')
    await expect(page.getByRole('option', { name: builtin, exact: true })).toBeVisible()
    await editor.dispatchEvent('compositionstart', { data: '' })
    await page.keyboard.insertText('中')
    await expect.poll(lines).toEqual([assignment, prefix + '中'])
    await editor.press('Tab')
    await expect.poll(lines).toEqual([assignment, prefix + '中'])
    await editor.dispatchEvent('compositionend', { data: '中' })
    await editor.press('Escape')

    await editor.fill('# ' + prefix)
    await editor.press('End')
    await editor.press('Control+Space')
    await expect(page.getByRole('option')).toHaveCount(0)
    await expect(pane.locator('.code-editor-output')).toHaveCount(0)
  })
})
