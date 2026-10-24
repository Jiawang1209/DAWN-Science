import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { NativeRuntime } from '../../src/runtime/native.js'
import type { AgentEvent } from '../../src/runtime/types.js'

for (const tool of ['read', 'bash'] as const) {
  it(`persists a real ${tool} failure across stop and resume without marking it successful`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-tool-error-history-'))
    const runtime = new NativeRuntime({ provenance: false, checkpoints: false, credentials: {
      read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {},
    } })
    const spec = { sessionId: 'tool-error-history', workspace: dir, sessionDir: join(dir, '.dawn'), native: { provider: 'deepseek', model: 'deepseek-flash' } }
    try {
      await runtime.start(spec)
      const state = (runtime as any).sessions.get(spec.sessionId)
      const events: AgentEvent[] = []
      runtime.attach(spec.sessionId, event => events.push(event))
      let requests = 0
      state.session.agent.streamFunction = (model: any) => {
        const stream = createAssistantMessageEventStream(), first = requests++ === 0
        const message = { role: 'assistant' as const,
          content: first ? [{ type: 'toolCall' as const, id: 'failed-tool', name: tool,
            arguments: tool === 'read' ? { path: join(dir, 'absent.txt') } : { command: "printf 'EXPECTED_TOOL_FAILURE'; exit 7" } }]
            : [{ type: 'text' as const, text: 'The tool failed.' }],
          api: model.api, provider: model.provider, model: model.id,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: first ? 'toolUse' as const : 'stop' as const, timestamp: Date.now(),
        }
        stream.push({ type: 'done', reason: message.stopReason, message }); stream.end()
        return stream
      }
      runtime.withTerminalReply(spec.sessionId, () => runtime.write(spec.sessionId, 'Run the requested failing tool.'))
      await runtime.waitForIdle(spec.sessionId)
      const live = events.find(event => event.kind === 'tool_end')
      expect(live).toMatchObject({ kind: 'tool_end', toolCallId: 'failed-tool', isError: true })
      const receipt = state.sessionManager.getBranch().find((entry: any) => entry.type === 'message' && entry.message.role === 'toolResult')
      expect(receipt?.message.isError).toBe(true)
      await runtime.stop(spec.sessionId)
      await runtime.start({ ...spec, resume: true })
      const restored = (await runtime.history(spec.sessionId)).find(item => item.kind === 'tool' && item.id === 'failed-tool')
      expect(restored).toMatchObject({ kind: 'tool', name: tool, isError: true })
      expect(restored && 'result' in restored ? restored.result : '').toContain(tool === 'read' ? 'ENOENT' : 'EXPECTED_TOOL_FAILURE')
    } finally { await runtime.stop(spec.sessionId); rmSync(dir, { recursive: true, force: true }) }
  })
}

it('preserves the existing tool-result hook overrides and propagates its errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-tool-error-hook-'))
  const runtime = new NativeRuntime({ provenance: false, checkpoints: false, credentials: {
    read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {},
  } })
  try {
    await runtime.start({ sessionId: 'tool-error-hook', workspace: dir, sessionDir: join(dir, '.dawn'), native: { provider: 'deepseek', model: 'deepseek-flash' } })
    const session = (runtime as any).sessions.get('tool-error-hook').session
    const runner = session.extensionRunner
    vi.spyOn(runner, 'hasHandlers').mockImplementation((name: unknown) => name === 'tool_result')
    const override = { content: [{ type: 'text', text: 'Hook replacement' }], details: { kept: true }, isError: false }
    const emit = vi.spyOn(runner, 'emitToolResult').mockResolvedValue(override)
    const context = { toolCall: { id: 'failed-tool', name: 'read' }, args: {}, result: { content: [{ type: 'text', text: 'Original error' }], isError: true }, isError: false }
    expect(await session.agent.afterToolCall(context)).toMatchObject(override)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ isError: true }))
    const failure = new Error('Hook failure')
    emit.mockRejectedValueOnce(failure)
    await expect(session.agent.afterToolCall(context, AbortSignal.abort())).rejects.toBe(failure)
  } finally { vi.restoreAllMocks(); await runtime.stop('tool-error-hook'); rmSync(dir, { recursive: true, force: true }) }
})
