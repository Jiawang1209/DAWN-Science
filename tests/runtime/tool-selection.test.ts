import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import type { NativeRuntimeOptions } from '../../src/runtime/native.js'
import type { SessionSpec } from '../../src/runtime/types.js'
import type { SessionManager } from '@earendil-works/pi-coding-agent'
import { 内核请求标记 } from '../../src/kernel/shortcuts.js'

type Pi = {
  systemPrompt: string
  messages: unknown[]
  getToolDefinition(name: string): { description: string; execute: (...args: unknown[]) => Promise<{ isError?: boolean; content: { text: string }[] }> }
}

async function setup(remote?: SessionSpec['remote']) {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-tool-choice-'))
  const execute = vi.fn(async () => ({ 输出: [{ kind: 'stream', text: '42' }] }))
  const kernels = { 能起远端: () => true, 执行: execute, 收: async () => {} } as unknown as NonNullable<NativeRuntimeOptions['kernels']>
  const runtime = new NativeRuntime({ kernels, provenance: false, checkpoints: false, credentials: { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {} } })
  await runtime.start({ sessionId: 'choice', workspace: dir, sessionDir: join(dir, '.dawn'), native: { provider: 'deepseek', model: 'deepseek-flash' }, ...(remote ? { remote } : {}) })
  const state = (runtime as unknown as { sessions: Map<string, { session: Pi; sessionManager: SessionManager }> }).sessions.get('choice')!
  const say = (text: string) => {
    const message = { role: 'user' as const, content: [{ type: 'text' as const, text }], timestamp: Date.now() }
    state.sessionManager.appendMessage(message)
    state.session.messages.push(message)
  }
  return { dir, execute, say, session: state.session, close: async () => { await runtime.stop('choice'); rmSync(dir, { recursive: true, force: true }) } }
}

describe('实际工具选择上下文', () => {
  it('系统提示先读现成摘要、足够就回答，同时保留复杂分析及一次性脚本的选择', async () => {
    const x = await setup()
    try {
      const prompt = x.session.systemPrompt
      expect(prompt).toContain('已有摘要')
      expect(prompt).toContain('足以回答')
      expect(prompt).toContain('来源与时间')
      expect(prompt).toContain('一次性脚本')
      expect(prompt).toContain('保留变量')
      expect(prompt).toContain('不要每一步都问')
      const description = x.session.getToolDefinition('run_code').description
      expect(description).toContain('状态')
      expect(description).toContain('现成')
      expect(description).not.toContain('所以做数据分析用这个，不要用 bash 每次重跑一遍')
      expect(x.execute).not.toHaveBeenCalled()
    } finally { await x.close() }
  })

  it('服务器执行位置明确区别于本机资源目录，读取状态不会启动内核', async () => {
    const readFile = vi.fn(async () => Buffer.from('中国优先：27/28 块，剩余10个文件'))
    const exec = vi.fn()
    const remote = { executor: { readFile, exec, writeFile: vi.fn() }, cwd: { get: () => '/home/test/downloads', set: vi.fn() } } as unknown as SessionSpec['remote']
    const x = await setup(remote)
    try {
      expect(x.session.systemPrompt).toContain('远端执行上下文')
      expect(x.session.systemPrompt).toContain('/home/test/downloads')
      expect(x.session.systemPrompt).toContain('本机元数据')
      const result = await x.session.getToolDefinition('read').execute('status', { path: '_work/status.txt' })
      expect(result.isError).toBeFalsy()
      expect(result.content[0]?.text).toContain('剩余10个文件')
      expect(readFile).toHaveBeenCalledWith('/home/test/downloads/_work/status.txt')
      expect(exec).not.toHaveBeenCalled()
      expect(x.execute).not.toHaveBeenCalled()
    } finally { await x.close() }
  })

  it('明确不要起内核只拦内核工具，shell查询仍可用；明确恢复后连续分析', async () => {
    const x = await setup()
    const call = (name: string, params: unknown) => x.session.getToolDefinition(name).execute('boundary', params)
    try {
      x.say('先查看现有下载状态，不要启动 Python 内核。')
      expect((await call('run_code', { language: 'python', code: '1+1' })).isError).toBe(true)
      expect((await call('inspect_data', { path: 'input.csv' })).isError).toBe(true)
      expect((await call('bash', { command: 'printf status-query' })).content[0]?.text).toContain('status-query')
      expect(x.execute).not.toHaveBeenCalled()
      x.say('目前进度怎么样？')
      expect((await call('run_code', { language: 'python', code: '1+1' })).isError).toBe(true)
      x.say('现在允许使用 Python 内核做统计。')
      expect((await call('run_code', { language: 'python', code: 'x = 1' })).isError).toBeFalsy()
      expect((await call('run_code', { language: 'python', code: 'x + 1' })).isError).toBeFalsy()
      expect(x.execute).toHaveBeenCalledTimes(2)
    } finally { await x.close() }
  })

  it.each([['@R', ['R']], ['@Python', ['python']], ['@RPython', ['R', 'python']]] as const)('%s 显式入口解除先前内核限制并严格约束本轮语言，下一轮不继承语言', async (token, languages) => {
    const x = await setup()
    const call = (language: string) => x.session.getToolDefinition('run_code').execute('shortcut', { language, code: '1+1' })
    try {
      x.say('不要启动内核。')
      x.say(token + ' 运行计算\n' + 内核请求标记(languages))
      for (const language of ['R', 'python']) {
        const result = await call(language)
        if (languages.some(allowed => allowed === language)) expect(result.isError).toBeFalsy()
        else expect(result.isError).toBe(true)
      }
      x.say('继续已授权的分析')
      expect((await call('python')).isError).toBeFalsy()
      x.say(token + ' 先不要运行\n' + 内核请求标记(languages))
      expect((await call(languages[0])).isError).toBe(true)
    } finally { await x.close() }
  })

  it('明确禁用行内代码格式的工具名，也必须在内核执行前拒绝', async () => {
    const x = await setup()
    try {
      x.say('先不要调用 `run_code`，读取已有状态。')
      const result = await x.session.getToolDefinition('run_code').execute('formatted', { language: 'python', code: 'print(1)' })
      expect(result.isError).toBe(true)
      expect(x.execute).not.toHaveBeenCalled()
    } finally { await x.close() }
  })
})
