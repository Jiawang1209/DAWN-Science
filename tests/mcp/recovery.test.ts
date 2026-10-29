import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCP池 } from '../../src/mcp/客户端.js'
import type { McpServer } from '../../src/config/schema.js'
import { McpClient } from '../../src/mcp/requests.js'

const script = join(process.cwd(), 'scripts/mcp-test-server.mjs')
let dir: string, log: string, pool: MCP池
const config = (args: string[] = []): McpServer => ({ command: process.execPath, args: [script, '--reliability', ...args], env: ['DAWN_MCP_TEST_LOG'] })
const logs = () => existsSync(log) ? readFileSync(log, 'utf8') : ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dawn-mcp-recovery-')); log = join(dir, 'calls.jsonl'); pool = new MCP池({ 取密: () => log }) })
afterEach(async () => { await pool.全关(); rmSync(dir, { recursive: true, force: true }) })

describe('MCP connection recovery with a real stdio server', () => {
  it('preserves the original rich response for deliberate model projection', async () => {
    const result = await pool.调('fixture', config(), 'rich', {})
    expect(result.出错了).toBe(true)
    expect(result).toMatchObject({ result: { structuredContent: { count: 7 }, _meta: { secret: 'APP_ONLY' } } })
  })

  it('evicts a dead connection and reconnects on a later call without replaying the write', async () => {
    const result = await pool.调('fixture', config(), 'crash_after_write', {})
    expect(result.出错了).toBe(true)
    expect(result.文字).toContain('结果未知')
    expect(pool.查('fixture')).toBeUndefined()
    const calls = await Promise.all(Array.from({ length: 3 }, () => pool.调('fixture', config(), 'pid', {})))
    expect(calls.every(call => !call.出错了)).toBe(true)
    expect(new Set(calls.map(call => call.文字)).size).toBe(1)
    expect(logs().match(/performed-once/g)).toHaveLength(1)
  })

  it('cancels one call while another continues on the same process', async () => {
    const controller = new AbortController()
    const pending = pool.调('fixture', config(), 'hold', { milliseconds: 10_000 }, undefined, controller.signal)
    await vi.waitFor(() => expect(logs()).toContain('hold-started'))
    const before = await pool.调('fixture', config(), 'pid', {})
    controller.abort()
    const cancelled = await pending
    expect(cancelled.出错了).toBe(true)
    expect(cancelled.文字).toContain('结果未知')
    await vi.waitFor(() => expect(logs()).toContain('hold-cancelled'))
    expect((await pool.调('fixture', config(), 'pid', {})).文字).toBe(before.文字)
  })

  it('returns promptly when a caller cancels shared initialization', async () => {
    const controller = new AbortController(), delayed = config(['--startup-delay=400'])
    const pending = pool.调('fixture', delayed, 'pid', {}, undefined, controller.signal)
    const other = pool.调('fixture', delayed, 'pid', {})
    await vi.waitFor(() => expect(logs()).toContain('starting'))
    controller.abort()
    expect((await pending).文字).toContain('尚未发送')
    expect((await other).出错了).toBe(false)
  })

  it('does not start a process for an already cancelled call', async () => {
    const result = await pool.调('fixture', config(), 'pid', {}, undefined, AbortSignal.abort())
    expect(result.出错了).toBe(true)
    expect(pool.连着的()).toEqual([])
    expect(logs()).toBe('')
  })

  it('replaces the connection when configuration or credentials change', async () => {
    const first = await pool.调('fixture', config(), 'pid', {})
    const second = await pool.调('fixture', config(['--different-config']), 'pid', {})
    expect(second.文字).not.toBe(first.文字)
    log = join(dir, 'changed.jsonl')
    const third = await pool.调('fixture', config(['--different-config']), 'pid', {})
    expect(third.文字).not.toBe(second.文字)
  })

  it('explicit close prevents late initialization from repopulating the cache', async () => {
    const delayed = config(['--startup-delay=400'])
    const initializing = pool.备好('fixture', delayed)
    await vi.waitFor(() => expect(logs()).toContain('starting'))
    const oldPid = JSON.parse(logs().trim().split('\n')[0]!).pid
    await pool.关('fixture')
    expect((await initializing).失败).toBeTruthy()
    expect(pool.查('fixture')).toBeUndefined()
    await vi.waitFor(() => expect(() => process.kill(oldPid, 0)).toThrow())
    expect((await pool.调('fixture', config(), 'pid', {})).出错了).toBe(false)
  })

  it('application shutdown cleans initialization and rejects new launches', async () => {
    const initializing = pool.备好('fixture', config(['--startup-delay=400']))
    await vi.waitFor(() => expect(logs()).toContain('starting'))
    const oldPid = JSON.parse(logs().trim().split('\n')[0]!).pid
    await pool.全关()
    expect((await initializing).失败).toBeTruthy()
    expect((await pool.备好('fixture', config())).失败).toBeTruthy()
    expect(pool.连着的()).toEqual([])
    await vi.waitFor(() => expect(() => process.kill(oldPid, 0)).toThrow())
  })

  it.each(['replace', 'close', 'shutdown'] as const)('invalidates an older replacement while its previous close is waiting: %s', async action => {
    await pool.备好('fixture', config())
    const client = [...(pool as any).连着.values()][0].client
    const close = client.close.bind(client)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const closing = vi.spyOn(client, 'close').mockImplementation(async () => { await gate; await close() })
    const older = pool.备好('fixture', config(['--older']))
    await vi.waitFor(() => expect(closing).toHaveBeenCalled())
    const latest = action === 'replace' ? pool.备好('fixture', config(['--newer'])) : action === 'close' ? pool.关('fixture') : pool.全关()
    release()
    expect((await older).失败).toBeTruthy()
    const result = await latest
    if (action === 'replace') expect(result).toMatchObject({ 工具: expect.any(Array) })
    else expect(pool.查('fixture')).toBeUndefined()
  })

  it('does not cache a connection which closes immediately after discovery', async () => {
    const original = McpClient.prototype.listTools
    const closing = vi.spyOn(McpClient.prototype, 'listTools').mockImplementation(async function (this: McpClient, ...args) {
      const result = await original.apply(this, args)
      await this.close()
      return result
    })
    try {
      expect((await pool.备好('fixture', config())).失败).toContain('断开')
      expect(pool.查('fixture')).toBeUndefined()
    } finally { closing.mockRestore() }
  })
})
