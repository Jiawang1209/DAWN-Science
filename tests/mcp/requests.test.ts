import { afterEach, describe, expect, it, vi } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpClient } from '../../src/mcp/requests.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const close of cleanups.splice(0)) await close() })

async function setup() {
  const [transport, peer] = InMemoryTransport.createLinkedPair()
  const server = new Server({ name: 'fixture', version: '1' }, { capabilities: { tools: {} } })
  let release: (() => void) | undefined
  let entered: (() => void) | undefined
  let cancelled = 0, calls = 0
  const started = new Promise<void>(resolve => { entered = resolve })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    { name: 'wait', inputSchema: { type: 'object' } },
    { name: 'echo', inputSchema: { type: 'object' }, outputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] } },
  ] }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    calls++
    if (request.params.name === 'wait') {
      const wait = new Promise<void>(resolve => { release = resolve })
      extra.signal.addEventListener('abort', () => { cancelled++ }, { once: true })
      entered?.()
      await wait
    }
    return { content: [{ type: 'text', text: 'finished' }], structuredContent: { count: request.params.arguments?.invalid ? 'wrong' : 1 } }
  })
  const client = new McpClient(transport)
  await server.connect(peer)
  await client.connect(client.channel)
  await client.listTools()
  cleanups.push(async () => { release?.(); await client.close(); await server.close() })
  return { client, peer, transport, started, release: () => release?.(), calls: () => calls, cancelled: () => cancelled }
}

describe('MCP request lifecycle', () => {
  it('keeps a tool call pending beyond the SDK default deadline', async () => {
    const f = await setup()
    vi.useFakeTimers()
    let outcome = 'pending'
    const result = f.client.callTool({ name: 'wait' }).then(value => { outcome = 'done'; return value }, error => { outcome = 'failed'; throw error })
    const checked = result.catch(() => undefined)
    await f.started
    await vi.advanceTimersByTimeAsync(120_000)
    expect(outcome).toBe('pending')
    f.release()
    expect((await checked)?.content).toEqual([{ type: 'text', text: 'finished' }])
  })

  it('cancels only the caller, sends cancellation, and leaves the shared connection usable', async () => {
    const f = await setup(), controller = new AbortController()
    const pending = f.client.callTool({ name: 'wait' }, undefined, { signal: controller.signal })
    const rejected = expect(pending).rejects.toThrow()
    await f.started
    controller.abort()
    await rejected
    expect(f.cancelled()).toBe(1)
    expect(await f.client.callTool({ name: 'echo' })).toMatchObject({ structuredContent: { count: 1 } })
    f.release()
    expect(await f.client.callTool({ name: 'echo' })).toMatchObject({ structuredContent: { count: 1 } })
  })

  it('does not send an already cancelled request', async () => {
    const f = await setup()
    await expect(f.client.callTool({ name: 'wait' }, undefined, { signal: AbortSignal.abort() })).rejects.toThrow()
    expect(f.calls()).toBe(0)
  })

  it('keeps SDK structured output validation', async () => {
    const f = await setup()
    await expect(f.client.callTool({ name: 'echo', arguments: { invalid: true } })).rejects.toThrow(/schema|valid/i)
  })

  it('supports an explicit per-request deadline without closing the connection', async () => {
    const f = await setup()
    vi.useFakeTimers()
    const failed = expect(f.client.callTool({ name: 'wait' }, undefined, { timeout: 100 })).rejects.toThrow(/timed out|超时/i)
    await f.started
    await vi.advanceTimersByTimeAsync(101)
    await failed
    expect(f.cancelled()).toBe(1)
    expect(await f.client.callTool({ name: 'echo' })).toMatchObject({ structuredContent: { count: 1 } })
  })

  it('settles a waiting request when the transport closes', async () => {
    const f = await setup()
    const failed = expect(f.client.callTool({ name: 'wait' })).rejects.toThrow(/closed|断开/i)
    await f.started
    await f.peer.close()
    await failed
    expect(f.calls()).toBe(1)
  })
})
