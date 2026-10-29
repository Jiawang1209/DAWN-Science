import { afterEach, describe, expect, it, vi } from 'vitest'
import { MCP池 } from '../../src/mcp/客户端.js'
import { mcpHttpFixture } from './http-fixture.js'
import { createMcpTools } from '../../src/tools/mcp-tool.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); for (const close of cleanups.splice(0)) await close() })

async function setup(mode: 'http' | 'sse' = 'http', streaming: boolean | string = false) {
  const fixture = await mcpHttpFixture(mode, streaming)
  const pool = new MCP池({ 取密: () => undefined })
  cleanups.push(async () => { await pool.全关(); await fixture.close() })
  return { ...fixture, pool }
}

describe('MCP remote transports', () => {
  it.each(['http', 'sse'] as const)('preserves rich results and isolates cancellation over %s', async mode => {
    const f = await setup(mode), controller = new AbortController()
    const waiting = f.pool.调('remote', f.config, 'hold', {}, '/project-one', controller.signal)
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    controller.abort()
    expect((await waiting).文字).toContain('结果未知')
    await vi.waitFor(() => expect(f.cancelled).toHaveLength(1))
    const result = await f.pool.调('remote', f.config, 'echo', {}, '/project-two')
    expect(result).toMatchObject({ 出错了: false, result: { structuredContent: { generation: 1 } } })
    expect(f.generations()).toBe(1)
  })

  it.each([false, true])('releases the cancelled HTTP response stream (headers flushed: %s)', async streaming => {
    const f = await setup('http', streaming), controller = new AbortController()
    const waiting = f.pool.调('remote', f.config, 'hold', {}, undefined, controller.signal)
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    await f.pool.调('remote', f.config, 'echo', {})
    controller.abort()
    await waiting
    await vi.waitFor(() => expect(f.closedWaits).toHaveLength(1))
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
    expect(f.generations()).toBe(1)
  })

  it.each(['endWaits', 'breakWaits'] as const)('settles a truncated streaming response and reconnects without replay: %s', async drop => {
    const f = await setup('http', true)
    let outcome: Awaited<ReturnType<MCP池['调']>> | undefined
    const waiting = f.pool.调('remote', f.config, 'hold', {}).then(result => { outcome = result })
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    await f.pool.调('remote', f.config, 'echo', {})
    f[drop]()
    await vi.waitFor(() => expect(outcome?.出错了).toBe(true))
    await waiting
    expect(outcome?.文字).toContain('结果未知')
    expect(f.pool.查('remote')).toBeUndefined()
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })

  it('settles pending requests when the legacy SSE stream fails', async () => {
    const f = await setup('sse')
    let outcome: Awaited<ReturnType<MCP池['调']>> | undefined
    const waiting = f.pool.调('remote', f.config, 'hold', {}).then(result => { outcome = result })
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    f.breakEvents()
    await vi.waitFor(() => expect(outcome?.出错了).toBe(true))
    await waiting
    expect(f.pool.查('remote')).toBeUndefined()
  })

  it('does not replay a write on HTTP session loss; the next request starts a new session', async () => {
    const f = await setup()
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
    f.expireNextWrite()
    const result = await f.pool.调('remote', f.config, 'write', {})
    expect(result.出错了).toBe(true)
    expect(result.文字).toContain('结果未知')
    expect(f.calls.filter(name => name === 'write')).toHaveLength(1)
    expect(f.pool.查('remote')).toBeUndefined()
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
    expect(f.generations()).toBe(2)
    expect(f.calls.filter(name => name === 'write')).toHaveLength(1)
  })

  it('does not dispatch an old tool when reconnecting changes its schema or read-only declaration', async () => {
    const f = await setup()
    const ready = await f.pool.备好('remote', f.config)
    const tool = createMcpTools({ 池: f.pool, 名单: [{ 名: 'remote', 服务器: f.config }], 工具: ready.工具.filter(tool => tool.工具名 === 'echo') })[0] as { execute: Function }
    f.changeCatalog()
    await f.pool.关('remote')
    const result = await tool.execute('old-tool', {})
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('定义已变化')
    expect(f.calls).toEqual([])
  })

  it('recognizes mixed-case SSE media types when detecting EOF without a result', async () => {
    const f = await setup('http', 'Text/Event-Stream; charset=utf-8')
    let outcome: Awaited<ReturnType<MCP池['调']>> | undefined
    const waiting = f.pool.调('remote', f.config, 'hold', {}).then(result => { outcome = result })
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    f.endWaits()
    await vi.waitFor(() => expect(outcome?.出错了).toBe(true))
    await waiting
  })

  it('resumes an explicitly resumable SSE response with GET without replaying tools/call', async () => {
    const f = await setup('http', 'resume')
    expect((await f.pool.调('remote', f.config, 'hold', {})).文字).toContain('resumed receipt')
    expect(f.resumed()).toBe(1)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })

  it('cancels a resumed response without closing the shared session', async () => {
    const f = await setup('http', 'resume-hold'), controller = new AbortController()
    const waiting = f.pool.调('remote', f.config, 'hold', {}, undefined, controller.signal)
    await vi.waitFor(() => expect(f.resumed()).toBe(1))
    controller.abort()
    expect((await waiting).文字).toContain('结果未知')
    await vi.waitFor(() => expect(f.closedWaits.some(id => id.startsWith('resume-'))).toBe(true))
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
    expect(f.generations()).toBe(1)
  })

  it('bounds response-only resumes that make no progress without replaying the tool', async () => {
    const f = await setup('http', 'resume-empty')
    const result = await f.pool.调('remote', f.config, 'hold', {})
    expect(result.出错了).toBe(true)
    expect(result.文字).toContain('结果未知')
    expect(f.resumed()).toBe(2)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })

  it('settles a resumed response that ends without any further event id or result', async () => {
    const f = await setup('http', 'resume-no-id')
    expect((await f.pool.调('remote', f.config, 'hold', {})).出错了).toBe(true)
    expect(f.resumed()).toBe(1)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })

  it.each(['endEvents', 'breakEvents'] as const)('preserves SDK-owned shared GET resumption for HTTP 202 after %s', async drop => {
    const f = await setup('http', 'shared')
    let result: Awaited<ReturnType<MCP池['调']>> | undefined
    const waiting = f.pool.调('remote', f.config, 'hold', {}).then(value => { result = value })
    await vi.waitFor(() => { expect(f.calls).toContain('hold'); expect(f.eventsOpen()).toBe(true) })
    f[drop]()
    await vi.waitFor(() => expect(result?.文字).toContain('shared resumed receipt'))
    await waiting
    expect(f.resumed()).toBe(1)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })

  it('does not resume a JSON-RPC error response or disrupt another waiting call', async () => {
    const f = await setup('http', true), controller = new AbortController()
    const waiting = f.pool.调('remote', f.config, 'hold', {}, undefined, controller.signal)
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    const fetchCalls = vi.spyOn(globalThis, 'fetch')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect((await f.pool.调('remote', f.config, 'error', {})).出错了).toBe(true)
    await vi.advanceTimersByTimeAsync(50)
    const resumes = fetchCalls.mock.calls.filter(([, init]) => new Headers(init?.headers).get('last-event-id') === 'failed-receipt')
    expect(resumes).toHaveLength(0)
    expect(f.pool.查('remote')).toBeDefined()
    controller.abort()
    expect((await waiting).文字).toContain('取消')
  })

  it('settles remaining shared HTTP202 calls after a stream closes following partial completion', async () => {
    const f = await setup('http', 'shared-partial')
    const results: Awaited<ReturnType<MCP池['调']>>[] = []
    const first = f.pool.调('remote', f.config, 'hold', {}).then(result => { results[0] = result })
    const second = f.pool.调('remote', f.config, 'hold', {}).then(result => { results[1] = result })
    await vi.waitFor(() => { expect(f.calls.filter(name => name === 'hold')).toHaveLength(2); expect(f.eventsOpen()).toBe(true) })
    f.completeFirstSharedAndEnd()
    await vi.waitFor(() => {
      expect(results[0]).toMatchObject({ 出错了: false, 文字: 'first receipt' })
      expect(results[1]).toMatchObject({ 出错了: true })
    })
    await Promise.all([first, second])
    expect(results[1]!.文字).toContain('结果未知')
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(2)
    expect(f.pool.查('remote')).toBeUndefined()
    expect((await f.pool.调('remote', f.config, 'echo', {})).出错了).toBe(false)
  })

  it('resumes a response after an actual socket interruption when the server supplied an event ID', async () => {
    const f = await setup('http', 'resume-broken')
    let result: Awaited<ReturnType<MCP池['调']>> | undefined
    const waiting = f.pool.调('remote', f.config, 'hold', {}).then(value => { result = value })
    await vi.waitFor(() => expect(f.calls).toContain('hold'))
    await f.pool.调('remote', f.config, 'echo', {})
    f.breakWaits()
    await vi.waitFor(() => expect(result).toMatchObject({ 出错了: false, 文字: 'resumed receipt' }))
    await waiting
    expect(f.resumed()).toBe(1)
    expect(f.calls.filter(name => name === 'hold')).toHaveLength(1)
  })
})
