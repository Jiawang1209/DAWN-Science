import { existsSync, copyFileSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { test, expect, 在项目里开会话, 进坞 } from './fixtures.js'

const python = process.env.DAWN_TEST_PYTHON ?? resolve('.venv-kernel/bin/python')
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><text y="20">中文 # %</text></svg>'
test.use({ dawnOptions: { realKernels: true } })

test('真实 Python 的 JSON 数组与 SVG 经 Notebook IPC 导出后保留结构和图片', async ({ dawn }, info) => {
  test.skip(!existsSync(python), '缺少本地测试 Python；不调用真实模型')
  const files = await dawn.page.evaluate(async ({ python, svg }) => {
    const bridge = window.dawn
    if (!bridge) throw new Error('Electron preload bridge unavailable')
    const invoke = async (op: string, request: unknown): Promise<any> => {
      const result = await bridge.invoke(op, request)
      if (!result.ok) throw new Error(`${op}: ${JSON.stringify(result.error)}`)
      return result.data
    }
    const interpreter = await invoke('setInterpreter', { language: 'python', path: python })
    if (interpreter.problem) throw new Error(interpreter.problem)
    const providers = await invoke('getProviders', {})
    const session = await invoke('createTask', { agentId: providers.agents.find((a: { kind: string }) => a.kind === 'native').agentId })
    await invoke('runInKernel', { sessionId: session.sessionId, language: 'python', code: `from IPython.display import display, JSON, SVG\ndisplay(JSON([1, {"中文": [2, 3]}]))\ndisplay(SVG(${JSON.stringify(svg)}))` })
    return {
      ipynb: await invoke('exportNotebook', { sessionId: session.sessionId, format: 'ipynb' }),
      markdown: await invoke('exportNotebook', { sessionId: session.sessionId, format: 'md' }),
    }
  }, { python, svg })
  expect(files.ipynb.cells).toBe(1)
  const notebook = JSON.parse(readFileSync(files.ipynb.path, 'utf8'))
  const outputs = notebook.cells[0].outputs as { data?: Record<string, unknown> }[]
  expect(outputs.find(o => o.data?.['application/json'])?.data?.['application/json']).toEqual([1, { 中文: [2, 3] }])
  expect(outputs.find(o => o.data?.['image/svg+xml'])?.data?.['image/svg+xml']).toContain('<svg')
  const markdown = readFileSync(files.markdown.path, 'utf8')
  expect(markdown).toContain(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  // Preserve these deterministic outputs after the disposable application is removed.
  copyFileSync(files.ipynb.path, info.outputPath('rich-output.ipynb'))
  copyFileSync(files.markdown.path, info.outputPath('rich-output.md'))
})

test('真实 Python 含Markdown围栏的代码与输出导出后可在文件预览完整阅读', async ({ dawn }, info) => {
  test.skip(!existsSync(python), '缺少本地测试 Python；不调用真实模型')
  const { page } = dawn
  await 在项目里开会话(page)
  const literal = 'before\n```\n## literal heading\n``````\nafter'
  const code = `report = """${literal}"""\nprint(report)`
  const exported = await page.evaluate(async ({ python, code }) => {
    const invoke = async (op: string, request: unknown): Promise<any> => {
      const result = await window.dawn!.invoke(op, request)
      if (!result.ok) throw new Error(`${op}: ${JSON.stringify(result.error)}`)
      return result.data
    }
    const interpreter = await invoke('setInterpreter', { language: 'python', path: python })
    if (interpreter.problem) throw new Error(interpreter.problem)
    const [task] = await invoke('listTasks', {})
    await invoke('runInKernel', { sessionId: task.sessionId, language: 'python', code })
    await invoke('runInKernel', { sessionId: task.sessionId, language: 'python', code: 'print("next-cell")' })
    return await invoke('exportNotebook', { sessionId: task.sessionId, format: 'md' }) as { path: string; cells: number }
  }, { python, code })
  expect(exported.cells).toBe(2)
  const markdown = readFileSync(exported.path, 'utf8')
  expect(markdown).toContain(`\`\`\`\`\`\`\`python\n${code}\n\`\`\`\`\`\`\``)
  expect(markdown).toContain(`\`\`\`\`\`\`\`text\n${literal}\n\`\`\`\`\`\`\``)
  await 进坞(page, '文件')
  await page.getByRole('button', { name: 'docs', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${basename(exported.path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click()
  const preview = page.locator('.file-preview')
  await expect(preview.locator('h3')).toHaveCount(2)
  await expect(preview.locator('h2')).toHaveCount(0)
  await expect(preview.locator('pre')).toHaveCount(4)
  await expect(preview.locator('pre').nth(1)).toContainText('## literal heading')
  await expect(preview.locator('pre').nth(3)).toContainText('next-cell')
  await preview.getByRole('button', { name: '展开阅读', exact: true }).click()
  await preview.locator('pre').nth(1).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('notebook-fence-preview.png') })
})
