import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync, mkdirSync, renameSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {CredentialStore} from '@earendil-works/pi-ai'
import type {OrchestrationService} from '../../src/orchestration/service.js'

const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
const credentials: CredentialStore = {read: async () => ({type: 'api_key', key: 'sk-offline'}), list: async () => [], modify: async () => undefined, delete: async () => {}}

it('the real Native assembly shares the coordinator and drains it before parent disposal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-coord-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internals = runtime as unknown as {orchestrations: Map<string, OrchestrationService>}
  const coordinator = internals.orchestrations.get('p')!
  expect(coordinator).toBeDefined()
  const child = coordinator.store.register('subagent', ['c', '0'], 'a')
  let cleaned = false
  const run = coordinator.run(child.id, async signal => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => {cleaned = true; resolve()}, {once: true}))
    return {ok: true, output: 'late'}
  })
  await runtime.stop('p')
  expect(cleaned).toBe(true); expect((await run).ok).toBe(false)
  expect(internals.orchestrations.has('p')).toBe(false)
  expect(coordinator.store.get(child.id)?.state).toBe('cancelled')
})

it('registers usable control tools in the Native assembly and protects plan-mode execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-control-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  type Tool = {execute: (callId: string, params: unknown) => Promise<{isError?: boolean; content: {text: string}[]}>}
  const internals = runtime as unknown as {sessions: Map<string, {session: {getToolDefinition(name: string): Tool | undefined; getAllTools(): {name: string}[]}}>}
  const session = internals.sessions.get('p')!.session
  try {
    expect(session.getAllTools().map(tool => tool.name)).toEqual(expect.arrayContaining(['start_subagent', 'send_subagent_message', 'list_subagents', 'wait_subagents', 'interrupt_subagent']))
    await runtime.setConfigOption('p', 'dawn.plan', '1')
    const rejected = await session.getToolDefinition('start_subagent')!.execute('start', {agent: 'x', task: 'y'})
    expect(rejected.isError).toBe(true); expect(rejected.content[0]?.text).toContain('先出方案')
    const listing = await session.getToolDefinition('list_subagents')!.execute('list', {})
    expect(listing.isError).not.toBe(true)
  } finally {await runtime.stop('p')}
})

it('acknowledges a result only after the real Pi session has persisted its receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-receipt-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internals = runtime as unknown as {
    sessions: Map<string, {sessionManager: import('@earendil-works/pi-coding-agent').SessionManager}>
    orchestrations: Map<string, OrchestrationService>
    orchestrationControls: Map<string, {delivery: {flush(): Promise<number>}}>
  }
  const store = internals.orchestrations.get('p')!.store
  const child = store.register('subagent', ['c', '0'], 'a')
  const message = store.enqueue(child.id, 'r', 'work', true)
  store.updateMessage(message.id, {status: 'completed', outcome: {ok: true, output: 'verified execution'}})
  try {
    expect(await internals.orchestrationControls.get('p')!.delivery.flush()).toBe(0)
    expect(store.message(message.id)?.deliveredAt).toBeUndefined()
    // Pi defers file creation until its first assistant message.
    internals.sessions.get('p')!.sessionManager.appendMessage({role: 'assistant', content: [{type: 'text', text: 'fixture reply'}], stopReason: 'stop', timestamp: Date.now()} as never)
    expect(await internals.orchestrationControls.get('p')!.delivery.flush()).toBe(0)
    expect(store.message(message.id)?.deliveredAt).toBeDefined()
  } finally {await runtime.stop('p')}
})

it('a pause persistence failure does not leave rewind permanently busy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-rewind-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internal = runtime as unknown as {sessions: Map<string, {回退中: boolean}>; orchestrationControls: Map<string, {mailbox: {pauseAll(): void}}>}
  internal.orchestrationControls.get('p')!.mailbox.pauseAll = () => {throw new Error('disk full')}
  try {
    await expect(runtime.rewind('p', {倒数第几句: 0, 文: 'missing'}, 'conversation', [])).rejects.toThrow()
    expect(internal.sessions.get('p')!.回退中).toBe(false)
  } finally {await runtime.stop('p')}
})


it('a failed Pi append cannot become a delivered receipt merely because it remains in memory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-native-durable-receipt-')); roots.push(root)
  const runtime = new NativeRuntime({credentials, subagentChildEntry: '/unused.js'})
  await runtime.start({sessionId: 'p', workspace: root, sessionDir: join(root, 'session'), native: {provider: 'deepseek', model: 'deepseek-flash'}})
  const internal = runtime as unknown as {sessions: Map<string, {sessionManager: import('@earendil-works/pi-coding-agent').SessionManager}>;
    orchestrations: Map<string, OrchestrationService>; orchestrationControls: Map<string, {delivery: {flush(): Promise<number>}}>}
  const manager = internal.sessions.get('p')!.sessionManager
  manager.appendMessage({role: 'assistant', content: [{type: 'text', text: 'fixture reply'}], stopReason: 'stop', timestamp: Date.now()} as never)
  const file = manager.getSessionFile()!, backup = file + '.backup'
  const store = internal.orchestrations.get('p')!.store
  const child = store.register('subagent', ['c', '0'], 'a'), message = store.enqueue(child.id, 'r', 'work', true)
  store.updateMessage(message.id, {status: 'completed', outcome: {ok: true, output: 'result'}})
  renameSync(file, backup); mkdirSync(file)
  const delivery = internal.orchestrationControls.get('p')!.delivery
  try {
    await expect(delivery.flush()).rejects.toThrow()
    await expect(delivery.flush()).rejects.toThrow()
    expect(store.message(message.id)?.deliveredAt).toBeUndefined()
  } finally {rmSync(file, {recursive: true, force: true}); renameSync(backup, file); await runtime.stop('p')}
})
