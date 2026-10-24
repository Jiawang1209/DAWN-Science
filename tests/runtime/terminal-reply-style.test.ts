import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream, getCurrentSystemMessage, getCurrentTools, getSystemMessageText, type Message } from '@earendil-works/pi-ai'
import { NativeRuntime } from '../../src/runtime/native.js'

it.each([true, false])('projects reply style per delivered input in a real SDK run (first terminal=%s)', async firstTerminal => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-reply-style-'))
  const runtime = new NativeRuntime({ provenance: false, checkpoints: false, credentials: { read: async () => ({ type: 'api_key', key: 'offline' }), list: async () => [], modify: async () => undefined, delete: async () => {} } })
  let release!: () => void
  try {
    await runtime.start({ sessionId: 'style', workspace: dir, sessionDir: join(dir, '.dawn'), native: { provider: 'deepseek', model: 'deepseek-flash' } })
    const state = (runtime as any).sessions.get('style'), session = state.session
    const tools = session.getActiveToolNames(), captures: Message[][] = []
    let started!: () => void
    const reached = new Promise<void>(r => { started = r }), gate = new Promise<void>(r => { release = r })
    session.agent.streamFunction = (model: any, context: any) => {
      const stream = createAssistantMessageEventStream(), index = captures.length
      captures.push(structuredClone(context.messages))
      void (async () => {
        const message = { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'ok' }], api: model.api, provider: model.provider, model: model.id,
          usage: { input: 1, output: 1, cacheRead: 1, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop' as const, timestamp: Date.now() }
        stream.push({ type: 'start', partial: message })
        if (index === 0) { started(); await gate }
        stream.push({ type: 'done', reason: 'stop', message }); stream.end()
      })()
      return stream
    }
    const write = (terminal: boolean, text: string, queueId?: string) => terminal
      ? runtime.withTerminalReply('style', () => runtime.write('style', text, 'followUp', queueId))
      : runtime.write('style', text, 'followUp', queueId)
    write(firstTerminal, 'first')
    await reached
    write(!firstTerminal, 'queued', 'queued')
    await vi.waitFor(() => expect(session.getFollowUpMessages()).toContain('queued'))
    release(); await runtime.waitForIdle('style')
    expect(captures).toHaveLength(2)
    for (const [i, terminal] of [firstTerminal, !firstTerminal].entries()) {
      const prompt = getSystemMessageText(getCurrentSystemMessage(captures[i]!)!)
      expect(prompt.includes('终端回复风格')).toBe(terminal)
      expect(prompt.includes('answer with exactly this')).toBe(!terminal)
      expect(prompt).toContain('deepseek-flash')
      if (terminal) expect(prompt).not.toContain('model "deepseek-flash（provider：deepseek）"')
      expect(getCurrentTools(captures[i]!).map(t => t.name).sort()).toEqual([...tools].sort())
    }
    expect(JSON.stringify(session.sessionManager.getBranch())).not.toContain('终端回复风格')
    state.设当前模型('changed-model（provider：changed-provider）')
    write(true, 'model check'); await runtime.waitForIdle('style')
    expect(getSystemMessageText(getCurrentSystemMessage(captures[2]!)!)).toContain('changed-model')
    write(false, 'GUI continued'); await runtime.waitForIdle('style')
    expect(getSystemMessageText(getCurrentSystemMessage(captures[3]!)!)).not.toContain('终端回复风格')
    expect(session.getActiveToolNames()).toEqual(tools)
  } finally { release?.(); await runtime.stop('style'); rmSync(dir, { recursive: true, force: true }) }
})
