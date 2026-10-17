import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import type { NativeRuntimeOptions } from '../../src/runtime/native.js'
import type { SessionManager } from '@earendil-works/pi-coding-agent'
import { MCP池 } from '../../src/mcp/客户端.js'

type Result = { isError?: boolean; content: { text: string }[] }
type Pi = { getToolDefinition(name: string): { execute: (...args: unknown[]) => Promise<Result> }; messages: unknown[] }
async function setup(id = 'boundary', dir = mkdtempSync(join(tmpdir(), 'dawn-boundary-')), resume = false, options: NativeRuntimeOptions = {}) {
  const run = vi.fn(async () => ({ 输出: [{ kind: 'stream', text: '2' }] }))
  const kernels = { 能起远端: () => false, 执行: run, 收: async () => {} } as unknown as NonNullable<NativeRuntimeOptions['kernels']>
  const rt = new NativeRuntime({ kernels, credentials: { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {} }, ...options })
  await rt.start({ sessionId: id, sessionDir: join(dir, '.dawn'), workspace: dir, resume, native: { provider: 'deepseek', model: 'deepseek-flash' } })
  const state = (rt as unknown as { sessions: Map<string, { session: Pi; sessionManager: SessionManager }> }).sessions.get(id)!
  const say = (text: string) => state.sessionManager.appendMessage({ role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() })
  const call = (name: string, params: Record<string, unknown>) => state.session.getToolDefinition(name).execute(`call-${Math.random()}`, params, undefined, undefined, undefined)
  return { rt, id, dir, state, say, call, run }
}

describe('明确讨论限制的真实工具门', () => {
  it.each([false, true])('旧 MLAI 检索穿过讨论门，权限拒绝仍生效：deny=%s', async deny => {
    const pool = new MCP池({ 取密: () => undefined })
    const config = { command: process.execPath, args: [join(process.cwd(), 'scripts/mcp-test-server.mjs'), '--legacy-mlai'] }
    const listed = await pool.备好('cases', config)
    const invoke = vi.spyOn(pool, '调')
    const x = await setup('legacy-mlai', undefined, false, { mcp: {
      池: pool,
      取工具: async () => ({ 工具: listed.工具, 名单: [{ 名: 'cases', 服务器: config }], 问题: [] }),
      门: () => deny ? { kind: 'deny', reason: '服务器权限拒绝' } : { kind: 'allow' },
    } })
    try {
      x.say('只讨论，暂不运行代码。请查询真实案例。')
      const result = await x.call('cases__search_cases', { query: 'guide-alpha' })
      if (deny) {
        expect(result.content[0]!.text).toContain('权限拒绝')
        expect(invoke).not.toHaveBeenCalled()
      } else {
        expect(result.content[0]!.text).toContain('20251017-e2e-alpha-diversity')
        expect(invoke).toHaveBeenCalledTimes(1)
      }
      expect((await x.call('cases__写一行', {})).isError).toBe(true)
      expect((await x.call('run_code', { language: 'python', code: '1' })).isError).toBe(true)
      expect((await x.call('bash', { command: 'touch should-not-exist' })).isError).toBe(true)
      expect((await x.call('write', { path: 'should-not-exist', content: 'ran' })).isError).toBe(true)
      expect(existsSync(join(x.dir, 'should-not-exist'))).toBe(false)
      expect(x.run).not.toHaveBeenCalled()
    } finally { await x.rt.stop(x.id); await pool.全关(); rmSync(x.dir, { recursive: true, force: true }) }
  })
  it('只讨论时禁止 run_code、bash 和写文件；read 仍可用', async () => {
    const x = await setup()
    try {
      writeFileSync(join(x.dir, 'input.txt'), '原始数据')
      x.say('先只讨论方案，不要运行代码。')
      for (const [name, params] of [
        ['run_code', { language: 'python', code: '1+1' }],
        ['bash', { command: 'printf ran > should-not-exist.txt' }],
        ['write', { path: 'should-not-exist.txt', content: 'ran' }],
      ] as const) {
        const result = await x.call(name, params)
        expect(result.isError, `${name} 必须被讨论门拦住`).toBe(true)
        expect(result.content[0]!.text).toContain('讨论')
      }
      expect(x.run).not.toHaveBeenCalled()
      expect(existsSync(join(x.dir, 'should-not-exist.txt'))).toBe(false)
      expect((await x.call('read', { path: 'input.txt' })).isError).toBeFalsy()
    } finally { await x.rt.stop(x.id); rmSync(x.dir, { recursive: true, force: true }) }
  })

  it('明确开始后连续运行多个分析步骤，无权限确认；普通追问不重锁', async () => {
    const x = await setup()
    try {
      x.say('先别执行，只讨论。')
      x.say('可以，开始分析数据并画图。')
      for (const code of ['x = 1', 'x + 1']) expect((await x.call('run_code', { language: 'python', code })).isError).toBeFalsy()
      x.say('这个结果说明什么？')
      expect((await x.call('run_code', { language: 'python', code: 'x + 2' })).isError).toBeFalsy()
      expect(x.run).toHaveBeenCalledTimes(3)
    } finally { await x.rt.stop(x.id); rmSync(x.dir, { recursive: true, force: true }) }
  })

  it('压缩、续接后限制仍在；回到限制之前的分支后不残留', async () => {
    const x = await setup()
    try {
      const before = x.say('开始分析数据。')
      x.say('现在只给代码，不要运行。')
      const manager = x.state.sessionManager
      manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '只讨论，不执行。' }], stopReason: 'stop', timestamp: Date.now() } as never)
      manager.appendCompaction('摘要里没有逐字保留讨论要求', manager.getLeafId()!, 100)
      expect((await x.call('run_code', { language: 'python', code: '1' })).isError).toBe(true)
      await x.rt.stop(x.id)
      const resumed = await setup(x.id, x.dir, true)
      try {
        expect((await resumed.call('run_code', { language: 'python', code: '1' })).isError).toBe(true)
        resumed.state.sessionManager.branch(before)
        expect((await resumed.call('run_code', { language: 'python', code: '1' })).isError).toBeFalsy()
      } finally { await resumed.rt.stop(resumed.id) }
    } finally { await x.rt.stop(x.id); rmSync(x.dir, { recursive: true, force: true }) }
  })

  it('关闭溯源、没有权限门时，内置 bash / write 也不能绕过讨论限制', async () => {
    const x = await setup('no-provenance', undefined, false, { provenance: false, checkpoints: false })
    try {
      x.say('先别运行。')
      expect((await x.call('write', { path: 'blocked.txt', content: 'bad' })).isError).toBe(true)
      expect((await x.call('bash', { command: 'printf ran > blocked.txt' })).isError).toBe(true)
      expect(existsSync(join(x.dir, 'blocked.txt'))).toBe(false)
    } finally { await x.rt.stop(x.id); rmSync(x.dir, { recursive: true, force: true }) }
  })
})
