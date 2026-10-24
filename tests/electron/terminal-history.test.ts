import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkbench } from '../../src/electron/wiring.js'
import { connectDesktopCli } from '../../src/cli/desktop-client.js'
import { memoryCredentials } from '../helpers/credentials.js'

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
  return { dir, task, call, descriptor, native: wb.nativeRuntime, close: async () => { await wb.closeAsync(3000); rmSync(dir, { recursive: true, force: true }) } }
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
