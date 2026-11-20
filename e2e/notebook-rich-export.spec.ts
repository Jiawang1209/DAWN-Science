import { existsSync, copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

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
