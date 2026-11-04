/** Local mock HTTP only: real Pi parent, subprocess child, resume and durable receipts. */
import {afterEach, expect, it} from 'vitest'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {OrchestrationService} from '../../src/orchestration/service.js'
import type {OrchestrationMailbox} from '../../src/orchestration/mailbox.js'
// @ts-expect-error -- shared deterministic development server is an mjs module.
import {startMockInferenceServer, mockModelsJson, CANNED_REPLY} from '../../scripts/mock-inference-server.mjs'
const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
const until = async (condition: () => boolean) => {const end = Date.now() + 12_000; while (!condition()) {if (Date.now() > end) throw new Error('Timed out waiting for durable delivery'); await new Promise(resolve => setTimeout(resolve, 20))}}

it('background start and a model-authored followup use one child transcript and return both results once', async () => {
  const childEntry = resolve('dist/electron/subagent-child.js')
  expect(existsSync(childEntry), 'Build Electron before running this built-entry integration').toBe(true)
  const dir = mkdtempSync(join(tmpdir(), 'dawn-live-orchestration-')); roots.push(dir)
  const server = await startMockInferenceServer()
  const modelsPath = join(dir, 'models.json')
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url)))
  mkdirSync(join(dir, '.dawn', 'agents'), {recursive: true})
  writeFileSync(join(dir, '.dawn', 'agents', 'scout.md'), '---\nname: scout\ndescription: 只读检查\ntools: read\n---\n只读回答，不修改文件。\n')
  const runtime = new NativeRuntime({modelsPath, subagentChildEntry: childEntry, credentials: {read: async () => ({type: 'api_key', key: 'offline-mock'}), list: async () => [], modify: async () => undefined, delete: async () => {}}})
  const sessionDir = join(dir, 'session')
  try {
    await runtime.start({sessionId: 'p', workspace: dir, sessionDir, native: {provider: 'deepseek', model: 'deepseek-flash'}})
    type Tool = {execute(callId: string, params: unknown): Promise<{isError?: boolean; content: {text: string}[]}>}
    const internal = runtime as unknown as {sessions: Map<string, {session: {getToolDefinition(name: string): Tool}; sessionManager: import('@earendil-works/pi-coding-agent').SessionManager}>;
      orchestrations: Map<string, OrchestrationService>; orchestrationControls: Map<string, {mailbox: OrchestrationMailbox}>}
    // Model tool calls normally follow a persisted assistant entry; reproduce that public Pi precondition.
    internal.sessions.get('p')!.sessionManager.appendMessage({role: 'assistant', content: [{type: 'text', text: 'fixture delegation'}], stopReason: 'stop', timestamp: Date.now()} as never)
    const session = internal.sessions.get('p')!.session, store = internal.orchestrations.get('p')!.store
    const start = await session.getToolDefinition('start_subagent').execute('initial.call', {agent: 'scout', task: '用一句话回答初始检查。'})
    expect(start.isError).not.toBe(true)
    const receipt = JSON.parse(start.content[0]!.text) as {childId: string; messageId: string}
    await internal.orchestrationControls.get('p')!.mailbox.settled()
    await until(() => store.message(receipt.messageId)?.deliveredAt !== undefined && !runtime.terminalBusy('p'))
    const follow = await session.getToolDefinition('send_subagent_message').execute('followup.call', {childId: receipt.childId, message: '请继续补充一句。'})
    expect(follow.isError).not.toBe(true)
    const next = JSON.parse(follow.content[0]!.text) as {messageId: string}
    await internal.orchestrationControls.get('p')!.mailbox.settled()
    await until(() => store.message(next.messageId)?.deliveredAt !== undefined && !runtime.terminalBusy('p'))
    expect(store.messages()).toHaveLength(2)
    expect(store.messages().every(message => message.status === 'completed' && message.outcome?.output.includes(CANNED_REPLY))).toBe(true)
    const transcriptDir = join(sessionDir, 'subagents', 'initial_call', '0', 'transcript')
    const files = readdirSync(transcriptDir).filter(name => name.endsWith('.jsonl'))
    expect(files).toHaveLength(1)
    const transcript = readFileSync(join(transcriptDir, files[0]!), 'utf8')
    expect(transcript).toContain(receipt.messageId); expect(transcript).toContain(next.messageId)
    expect(store.get(receipt.childId)?.epoch).toBe(2)
  } finally {await runtime.stop('p'); await server.close()}
}, 30_000)
