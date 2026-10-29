import { expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream, type JsonObject } from '@earendil-works/pi-ai'
import { NativeRuntime } from '../../src/runtime/native.js'
import { MCP池 } from '../../src/mcp/客户端.js'
import type { AgentEvent } from '../../src/runtime/types.js'

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-native-mcp-')), log = join(dir, 'calls.jsonl')
  const config = { command: process.execPath, args: [join(process.cwd(), 'scripts/mcp-test-server.mjs'), '--reliability'], env: ['DAWN_MCP_TEST_LOG'] }
  const pool = new MCP池({ 取密: () => log })
  const runtime = new NativeRuntime({ provenance: false, checkpoints: false, credentials: {
    read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {},
  }, mcp: { 池: pool, 取工具: async () => {
    const ready = await pool.备好('fixture', config, dir)
    return { 工具: ready.工具, 名单: [{ 名: 'fixture', 服务器: config }], 问题: ready.失败 ? [ready.失败] : [] }
  } } })
  const spec = { sessionId: 'mcp-reliability', workspace: dir, sessionDir: join(dir, '.dawn'), native: { provider: 'openai', model: 'gpt-4.1' } }
  await runtime.start(spec)
  return { runtime, pool, config, dir, log, spec, state: (runtime as any).sessions.get(spec.sessionId), close: async () => {
    await runtime.stop(spec.sessionId); await pool.全关(); rmSync(dir, { recursive: true, force: true })
  } }
}

function modelCalls(state: any, tool: string, args: JsonObject, seen: unknown[]) {
  let requests = 0
  state.session.agent.streamFunction = (model: any, context: any) => {
    seen.push(context)
    const stream = createAssistantMessageEventStream(), first = requests++ === 0
    const message = { role: 'assistant' as const,
      content: first ? [{ type: 'toolCall' as const, id: 'mcp-call', name: `fixture__${tool}`, arguments: args }] : [{ type: 'text' as const, text: 'Observed the MCP result.' }],
      api: model.api, provider: model.provider, model: model.id,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: first ? 'toolUse' as const : 'stop' as const, timestamp: Date.now(),
    }
    stream.push({ type: 'done', reason: message.stopReason, message }); stream.end()
    return stream
  }
}

it('keeps MCP rich output and failure in model context, live events and restored history', async () => {
  const f = await setup(), contexts: any[] = [], events: AgentEvent[] = []
  try {
    f.runtime.attach(f.spec.sessionId, event => events.push(event))
    modelCalls(f.state, 'rich', {}, contexts)
    f.runtime.withTerminalReply(f.spec.sessionId, () => f.runtime.write(f.spec.sessionId, 'Inspect the MCP rich response.'))
    await f.runtime.waitForIdle(f.spec.sessionId)
    expect(events.find(event => event.kind === 'tool_end')).toMatchObject({ toolCallId: 'mcp-call', isError: true })
    const receipt = f.state.sessionManager.getBranch().find((entry: any) => entry.type === 'message' && entry.message.role === 'toolResult')?.message
    expect(receipt.isError).toBe(true)
    expect(receipt.content.some((block: any) => block.type === 'image')).toBe(true)
    expect(JSON.stringify(receipt)).toContain('r-1')
    expect(JSON.stringify(receipt)).toContain('observed method')
    expect(JSON.stringify(receipt)).not.toContain('APP_ONLY')
    const modelReceipt = contexts.at(-1).messages.find((message: any) => message.role === 'toolResult')
    expect(modelReceipt).toMatchObject({ isError: true })
    expect(modelReceipt.content.some((block: any) => block.type === 'image')).toBe(true)
    await f.runtime.stop(f.spec.sessionId)
    await f.runtime.start({ ...f.spec, resume: true })
    expect((await f.runtime.history(f.spec.sessionId)).find(item => item.kind === 'tool' && item.id === 'mcp-call')).toMatchObject({ isError: true })
    expect(f.runtime.historyPictures(f.spec.sessionId)).toHaveLength(1)
  } finally { await f.close() }
})

it('the native Stop signal cancels MCP waiting without closing its shared server', async () => {
  const f = await setup()
  try {
    const before = await f.pool.调('fixture', f.config, 'pid', {}, f.dir)
    modelCalls(f.state, 'hold', { milliseconds: 60_000 }, [])
    f.runtime.withTerminalReply(f.spec.sessionId, () => f.runtime.write(f.spec.sessionId, 'Wait on the MCP tool.'))
    await vi.waitFor(() => expect(existsSync(f.log) ? readFileSync(f.log, 'utf8') : '').toContain('hold-started'))
    await f.runtime.abort(f.spec.sessionId)
    await f.runtime.waitForIdle(f.spec.sessionId)
    await vi.waitFor(() => expect(readFileSync(f.log, 'utf8')).toContain('hold-cancelled'))
    const receipt = f.state.sessionManager.getBranch().find((entry: any) => entry.type === 'message' && entry.message.role === 'toolResult')?.message
    expect(receipt).toMatchObject({ isError: true })
    expect(JSON.stringify(receipt.content)).toContain('结果未知')
    expect((await f.pool.调('fixture', f.config, 'pid', {}, f.dir)).文字).toBe(before.文字)
  } finally { await f.close() }
})
