import { expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkbench } from '../../src/electron/wiring.js'
import { connectDesktopCli } from '../../src/cli/desktop-client.js'
import { memoryCredentials } from '../helpers/credentials.js'
import { RunStore } from '../../src/store/runs.js'

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-history-wiring-')), configPath = join(dir, 'providers.yaml')
  writeFileSync(configPath, 'agents:\n  chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat]\n  shell:\n    kind: pty\n    command: /bin/bash\n    args: ["--noprofile", "--norc"]\n    capabilities: [exec]\n')
  const wb = createWorkbench({ configPath, dbPath: join(dir, 'db.sqlite'), credentials: memoryCredentials({ deepseek: 'offline' }), skillsDir: join(dir, 'skills'), memoriesDir: join(dir, 'memories'),
    desktopCli: { entry: '/unused', executable: process.execPath, descriptor: join(dir, 'desktop.json') } })
  const call = async (op: any, input: any) => {
    const response = await wb.server.handle(op, input)
    if (!response.ok) throw Error(response.error.message)
    return response.data as any
  }
  const task = await call('createTask', { agentId: 'chat', workspace: dir })
  task.projectId = (await call('listProjects', {})).find((p: any) => p.workspace === dir).projectId
  await call('createTerminalSession', { agentId: 'shell', projectId: task.projectId })
  const descriptor = JSON.parse(readFileSync(join(dir, 'desktop.json'), 'utf8'))
  return { dir, task, call, descriptor, native: wb.nativeRuntime, db: wb.db, close: async () => { await wb.closeAsync(3000); rmSync(dir, { recursive: true, force: true }) } }
}

for (const phase of ['inFlight', '转述中', '回退中', '中止中'] as const) {
  it(`refuses history takeover while the original GUI conversation is in ${phase}`, async () => {
    const f = await fixture()
    const state = (f.native as any).sessions.get(f.task.sessionId)
    const before = state[phase]
    let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
    try {
      state[phase] = phase === '回退中' ? true : 1
      await expect(connectDesktopCli(f.descriptor, f.dir, undefined, undefined, f.task.sessionId).then(c => { cli = c; return c })).rejects.toThrow('仍在执行')
    } finally { state[phase] = before; await cli?.close(); await f.close() }
  })
}

it('reopens the original stopped native conversation without adding a task or changing its identity', async () => {
  const f = await fixture()
  let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const before = (await f.call('listTasks', {})).length
    await f.call('stopSession', { sessionId: f.task.sessionId })
    cli = await connectDesktopCli(f.descriptor, f.dir, undefined, undefined, f.task.sessionId)
    expect(cli.sessionId).toBe(f.task.sessionId)
    expect((await f.call('listTasks', {})).length).toBe(before)
    expect((await f.call('subscribeSession', { sessionId: f.task.sessionId })).state).toBe('alive')
  } finally { await cli?.close(); await f.close() }
})

it('reads cumulative model usage from the original branch across stop and resume, scoped to this CLI', async () => {
  const f = await fixture()
  let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const state = (f.native as any).sessions.get(f.task.sessionId)
    state.sessionManager.appendMessage({ role: 'user', content: 'Original question', timestamp: 1 })
    state.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Original reply' }], stopReason: 'stop',
      api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', timestamp: 2,
      usage: { input: 30, output: 6, cacheRead: 70, cacheWrite: 0, totalTokens: 106, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } })
    await f.call('stopSession', { sessionId: f.task.sessionId })
    cli = await connectDesktopCli(f.descriptor, f.dir, undefined, undefined, f.task.sessionId)
    expect(await cli.usage()).toMatchObject({ input: 30, output: 6, cacheRead: 70, turns: 1, tools: 0 })
    expect(await cli.call('$usage', { sessionId: 'another-session' })).toMatchObject({ input: 30, output: 6, cacheRead: 70, turns: 1, tools: 0 })
    await cli.close(); cli = undefined
    await vi.waitFor(() => expect(f.native.canControlTerminal(f.task.sessionId)).toBe(false))
    cli = await connectDesktopCli(f.descriptor, f.dir, undefined, undefined, f.task.sessionId)
    expect(await cli.usage()).toMatchObject({ input: 30, output: 6, cacheRead: 70, turns: 1, tools: 0 })
  } finally { await cli?.close(); await f.close() }
})

it('restores original turn and tool counts with ledger timing after the live transcript has been rebuilt', async () => {
  const f = await fixture()
  let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const state = (f.native as any).sessions.get(f.task.sessionId)
    state.sessionManager.appendMessage({ role: 'user', content: 'Inspect original data', timestamp: 1 })
    state.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'original-tool', name: 'read', arguments: { path: 'data.csv' } }], timestamp: 2 })
    state.sessionManager.appendMessage({ role: 'toolResult', toolCallId: 'original-tool', toolName: 'read', content: [{ type: 'text', text: 'data' }], timestamp: 3 })
    new RunStore(f.db).insert({ runId: 'original-run', projectId: f.task.projectId, sessionId: f.task.sessionId, origin: 'agent',
      requestType: 'tool_call:read', toolCallId: 'original-tool', status: 'completed', hasError: false,
      startedAt: '2026-10-24T00:00:00Z', finishedAt: '2026-10-24T00:00:02.500Z' })
    await f.call('stopSession', { sessionId: f.task.sessionId })
    for (let cycle = 0; cycle < 2; cycle++) {
      cli = await connectDesktopCli(f.descriptor, f.dir, undefined, undefined, f.task.sessionId)
      expect(await cli.usage()).toMatchObject({ turns: 1, tools: 1, toolMs: 2500 })
      expect((await cli.usage()).toolMsPartial).toBeUndefined()
      await cli.close(); cli = undefined
      await vi.waitFor(() => expect(f.native.canControlTerminal(f.task.sessionId)).toBe(false))
    }
  } finally { await cli?.close(); await f.close() }
})

it('opens a new Shell for the stopped owner and resumes its same Agent without a GUI reconnect', async () => {
  const f = await fixture()
  let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
  try {
    const count = (await f.call('listTasks', {})).length
    const first = await f.call('createTerminalSession', { agentId: 'shell', projectId: f.task.projectId, ownerSessionId: f.task.sessionId })
    cli = await connectDesktopCli(f.descriptor, f.dir, first.sessionId, undefined, f.task.sessionId)
    await cli.close(); cli = undefined
    await vi.waitFor(() => expect(f.native.canControlTerminal(f.task.sessionId)).toBe(false))
    await f.call('deleteSession', { sessionId: first.sessionId })
    const shell = await f.call('createTerminalSession', { agentId: 'shell', projectId: f.task.projectId, ownerSessionId: f.task.sessionId })
    expect(shell.sessionId).not.toBe(first.sessionId)
    expect((await f.call('getTerminalControl', { terminalId: shell.sessionId })).ownerSessionId).toBe(f.task.sessionId)
    // Opening Normal must not restart the model or grant it terminal control.
    expect(f.native.canControlTerminal(f.task.sessionId)).toBe(false)
    await expect(f.call('setTerminalControl', { terminalId: shell.sessionId, ownerSessionId: f.task.sessionId, enabled: true, mode: 'shell' })).rejects.toThrow()
    cli = await connectDesktopCli(f.descriptor, f.dir, shell.sessionId, undefined, f.task.sessionId)
    expect(cli.sessionId).toBe(f.task.sessionId)
    expect(f.native.canControlTerminal(f.task.sessionId)).toBe(true)
    expect((await f.call('listTasks', {})).length).toBe(count)
  } finally { await cli?.close(); await f.close() }
})

for (const reason of ['archived', 'missing', 'terminal', 'wrong-project'] as const) {
  it(`does not create a Shell for a ${reason} owner while allowing a paused local main`, async () => {
    const f = await fixture()
    try {
      await f.call('stopSession', { sessionId: f.task.sessionId })
      let ownerSessionId = f.task.sessionId, projectId = f.task.projectId
      if (reason === 'archived') await f.call('setSessionArchived', { sessionId: ownerSessionId, archived: true })
      if (reason === 'missing') ownerSessionId = 'missing-owner'
      if (reason === 'terminal') ownerSessionId = (await f.call('listSessions', { projectId })).find((s: any) => s.kind === 'pty').sessionId
      if (reason === 'wrong-project') projectId = 'another-project'
      const count = (await f.call('listSessions', { projectId: f.task.projectId })).length
      await expect(f.call('createTerminalSession', { agentId: 'shell', projectId, ownerSessionId })).rejects.toThrow()
      expect((await f.call('listSessions', { projectId: f.task.projectId })).length).toBe(count)
      expect(f.native.canControlTerminal(f.task.sessionId)).toBe(false)
    } finally { await f.close() }
  })
}

for (const reason of ['archived', 'wrong-directory', 'terminal', 'missing'] as const) {
  it(`refuses ${reason} history without creating a substitute conversation`, async () => {
    const f = await fixture()
    let cli: Awaited<ReturnType<typeof connectDesktopCli>> | undefined
    try {
      let id = f.task.sessionId, cwd = f.dir
      if (reason === 'archived') await f.call('setSessionArchived', { sessionId: id, archived: true })
      if (reason === 'wrong-directory') { cwd = join(f.dir, 'other'); mkdirSync(cwd) }
      if (reason === 'terminal') id = (await f.call('listSessions', { projectId: f.task.projectId })).find((s: any) => s.kind === 'pty').sessionId
      if (reason === 'missing') id = 'missing-history'
      const before = (await f.call('listTasks', {})).length
      let failure: unknown
      try { cli = await connectDesktopCli(f.descriptor, cwd, undefined, undefined, id) } catch (error) { failure = error }
      expect(failure).toBeInstanceOf(Error)
      expect((await f.call('listTasks', {})).length).toBe(before)
    } finally { await cli?.close(); await f.close() }
  })
}
