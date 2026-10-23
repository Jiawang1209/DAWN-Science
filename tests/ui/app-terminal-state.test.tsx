import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App.js'
import { createClient } from '../../src/ui/client.js'
import { OPERATIONS, WORKBENCH_PROTOCOL_VERSION, type SessionSummary } from '../../src/protocol/index.js'
import { $dockOpen, $dockSessionId, $dockChunks, $activeSessionId, $projects, $providers, $sessions, $终端归属, $terminalAgentSessions, setActiveProjectId, setActiveSessionId, setDockOpen, setDockSessionId, setView } from '../../src/ui/state/index.js'

// The state/navigation integration is under test; real PTYs and canvas are covered in Electron.
vi.mock('../../src/ui/terminal.js', () => ({ TerminalPane: () => <div className="term-host" /> }))
const date = '2026-10-23T00:00:00Z'
beforeEach(() => { setDockOpen(false); setDockSessionId(undefined); $终端归属.set(new Map()); $terminalAgentSessions.set(new Map()) })
const session = (id: string, kind: 'native' | 'pty', projectId = 'p1'): SessionSummary => ({ sessionId: id, projectId, agentId: kind === 'pty' ? 'shell' : 'chat', kind, state: 'alive', title: id, pinned: false, sortOrder: 0, createdAt: date })
function harness() {
  const calls: { op: string; req: any }[] = [], entries = [session('s1', 'native'), session('s2', 'native')]
  const pending: { id: string; req: any; finish: () => void; fail: () => void }[] = []
  const modes = new Map<string, any>()
  const snapshots: ((text: string) => void)[] = []
  const modeReplies: ((value: unknown) => void)[] = []
  let projectIds = ['p1', 'p2']
  let serial = 0, defer = false, deferSnapshots = false, holdMode = false
  const invoke = async (op: string, req: any) => {
    calls.push({ op, req })
    let value: unknown
    switch (op) {
      case 'getCapabilities': value = { workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, operations: Object.keys(OPERATIONS), entityTypes: [], maxPageSize: 200, readOnly: false }; break
      case 'listProjects': value = projectIds.map(projectId => ({ projectId, name: projectId, workspace: '/work/' + projectId, createdAt: date, totalRunCount: 0, totalSessionCount: 2, unresolvedProblemCount: 0 })); break
      case 'getProviders': value = { agents: [{ agentId: 'chat', kind: 'native', provider: 'deepseek', model: 'deepseek-flash' }, { agentId: 'shell', kind: 'pty', command: '/bin/bash' }], providers: [{ providerId: 'deepseek', models: ['deepseek-flash'] }] }; break
      case 'listCredentials': value = { configured: ['deepseek'], encrypted: true }; break
      case 'listSessions': if (!projectIds.includes(req.projectId)) throw Error('project no longer exists'); value = entries.filter(x => x.projectId === req.projectId); break
      case 'listTemporarySessions': case 'listTasks': case 'listRuns': case 'listConnections': case 'listSchedules': value = []; break
      case 'listMcpServers': value = { servers: [], problems: [] }; break
      case 'listPlugins': value = { plugins: [] }; break
      case 'listArchivedSessions': value = { sessions: [] }; break
      case 'createTerminalSession': {
        const made = session('t' + ++serial, 'pty', req.projectId ?? entries.find(x => x.sessionId === req.ownerSessionId)?.projectId ?? 'p1')
        if (defer) await new Promise<void>((resolve, reject) => pending.push({ id: made.sessionId, req, finish: resolve, fail: () => reject(Error('terminal creation failed')) }))
        entries.push(made); value = made; break
      }
      case 'subscribeSession': {
        const kind = entries.find(x => x.sessionId === req.sessionId)?.kind ?? 'native'
        const terminal = deferSnapshots && kind === 'pty' ? await new Promise<string>(resolve => snapshots.push(resolve)) : ''
        value = { sessionId: req.sessionId, kind, revision: 0, items: [], terminal, terminalTrimmed: false, state: 'alive' }; break
      }
      case 'getTerminalAgentMode': value = holdMode
        ? await new Promise(resolve => { holdMode = false; modeReplies.push(resolve) })
        : modes.get(req.terminalId) ?? { mode: 'normal' }; break
      case 'getTerminalAgentAttachments': value = { revision: 0, pending: [] }; break
      default: value = {}; break
    }
    // Reject unsupported fixture responses instead of leaking malformed data into App.
    ;(OPERATIONS as any)[op]?.response.parse(value)
    return { ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: value, warnings: [] }
  }
  return { client: createClient(invoke, () => () => {}, async () => null), calls, pending, modes, snapshots, modeReplies,
    removeProjects() { projectIds = []; $projects.set([]) },
    defer() { defer = true },
    holdSnapshots() { deferSnapshots = true },
    holdNextMode() { holdMode = true },
    async finish(index: number) { await act(async () => { pending[index]!.finish() }) },
    async fail(index: number) { await act(async () => { pending[index]!.fail() }) },
  }
}
async function mount(h: ReturnType<typeof harness>, owner?: string) {
  render(<App client={h.client} />)
  await waitFor(() => expect($providers.get().agents).toHaveLength(2))
  await act(async () => { setActiveProjectId('p1') })
  await waitFor(() => expect($sessions.get().some(x => x.sessionId === 's1')).toBe(true))
  if (owner) await act(async () => { setActiveSessionId(owner) })
  await act(async () => { setDockOpen(true) })
}

it('a slow creation cannot overwrite the terminal of the conversation switched to afterwards', async () => {
  const h = harness(); h.defer(); await mount(h, 's1')
  await waitFor(() => expect(h.pending).toHaveLength(1))
  await act(async () => { setActiveSessionId('s2') })
  await waitFor(() => expect(h.pending).toHaveLength(2))
  await h.finish(1); await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
  await h.finish(0)
  expect($dockSessionId.get()).toBe('t2')
})

it('returning and reopening invalidates an earlier creation even with the same owner and project', async () => {
  const h = harness(); h.defer(); await mount(h)
  await waitFor(() => expect(h.pending).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  expect($dockOpen.get()).toBe(false)
  await act(async () => { setDockOpen(true) })
  await waitFor(() => expect(h.pending).toHaveLength(2))
  await h.finish(1); await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
  await h.finish(0)
  expect($dockSessionId.get()).toBe('t2')
})

it('a welcome page switches terminals by project even though neither page has an active conversation', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  await act(async () => { setActiveProjectId('p2') })
  await waitFor(() => expect(h.calls.filter(x => x.op === 'createTerminalSession')).toHaveLength(2))
  expect(h.calls.filter(x => x.op === 'createTerminalSession')[1]!.req.projectId).toBe('p2')
  await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
  await act(async () => { setActiveProjectId('p1') })
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
})

it('collapse from a non-conversation page closes the panel even if its Agent has a conversation', async () => {
  const h = harness(); await mount(h, 's1')
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  h.modes.set('t1', { mode: 'dawn', sessionId: 's2', projectId: 'p1' })
  await act(async () => { setView('schedule') })
  fireEvent.click(screen.getByRole('button', { name: '收起面板' }))
  await waitFor(() => expect($dockOpen.get()).toBe(false))
})

it('a failed creation leaves a usable return path and allows an explicit retry', async () => {
  const h = harness(); h.defer(); await mount(h)
  await waitFor(() => expect(h.pending).toHaveLength(1))
  await h.fail(0)
  expect((screen.getByRole('button', { name: '返回会话' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '＋ 新开一个' }))
  await waitFor(() => expect(h.pending).toHaveLength(2))
  await h.finish(1); await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
})

it('a manual tab selection is not overridden when an earlier new-terminal request finishes', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  h.defer(); fireEvent.click(screen.getByRole('button', { name: '＋ 新开一个' }))
  await waitFor(() => expect(h.pending).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '终端 1' }))
  await h.finish(0)
  expect($dockSessionId.get()).toBe('t1')
})

it('A-to-B-to-A tab switches do not apply an obsolete A snapshot over the new A screen', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  fireEvent.click(screen.getByRole('button', { name: '＋ 新开一个' }))
  await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
  h.holdSnapshots()
  fireEvent.click(screen.getByRole('button', { name: '终端 1' }))
  await waitFor(() => expect(h.snapshots).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '终端 2' }))
  await waitFor(() => expect(h.snapshots).toHaveLength(2))
  fireEvent.click(screen.getByRole('button', { name: '终端 1' }))
  await waitFor(() => expect(h.snapshots).toHaveLength(3))
  await act(async () => { h.snapshots[2]!('CURRENT_A') })
  expect($dockChunks.get()).toEqual(['CURRENT_A'])
  await act(async () => { h.snapshots[0]!('STALE_A'); h.snapshots[1]!('LATE_B') })
  expect($dockChunks.get()).toEqual(['CURRENT_A'])
})

it('a return started before A-to-B-to-A navigation cannot close or redirect the new view', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  fireEvent.click(screen.getByRole('button', { name: '＋ 新开一个' }))
  await waitFor(() => expect($dockSessionId.get()).toBe('t2'))
  fireEvent.click(screen.getByRole('button', { name: '终端 1' }))
  h.holdNextMode(); fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  await waitFor(() => expect(h.modeReplies).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '终端 2' }))
  fireEvent.click(screen.getByRole('button', { name: '终端 1' }))
  expect((screen.getByRole('button', { name: '返回会话' }) as HTMLButtonElement).disabled).toBe(false)
  await act(async () => { h.modeReplies[0]!({ mode: 'dawn', sessionId: 's2', projectId: 'p1' }) })
  expect($dockOpen.get()).toBe(true)
  expect($activeSessionId.get()).toBeUndefined()
})

it('a return from a previous panel opening cannot close a newly reopened panel', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  h.holdNextMode(); fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  await waitFor(() => expect(h.modeReplies).toHaveLength(1))
  await act(async () => { setDockOpen(false) })
  await act(async () => { setDockOpen(true) })
  await act(async () => { h.modeReplies[0]!({ mode: 'dawn', sessionId: 's2', projectId: 'p1' }) })
  expect($dockOpen.get()).toBe(true)
  expect($activeSessionId.get()).toBeUndefined()
})

it('a stale deleted project selection still opens a home terminal instead of querying the missing project', async () => {
  const h = harness()
  render(<App client={h.client} />)
  await waitFor(() => expect($providers.get().agents).toHaveLength(2))
  await act(async () => { h.removeProjects(); setActiveSessionId(undefined); setActiveProjectId('removed-project') })
  await act(async () => { setDockOpen(true) })
  await waitFor(() => expect(h.calls.filter(x => x.op === 'createTerminalSession')).toHaveLength(1))
  expect(h.calls.find(x => x.op === 'createTerminalSession')!.req).toEqual({ agentId: 'shell' })
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
})


it('an older return completion cannot clear the busy state of a newer return to the same terminal', async () => {
  const h = harness(); await mount(h)
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  h.holdNextMode(); fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  await waitFor(() => expect(h.modeReplies).toHaveLength(1))
  await act(async () => { setDockOpen(false) })
  await act(async () => { setDockOpen(true) })
  await waitFor(() => expect($dockSessionId.get()).toBe('t1'))
  h.holdNextMode(); fireEvent.click(screen.getByRole('button', { name: '返回会话' }))
  await waitFor(() => expect(h.modeReplies).toHaveLength(2))
  await act(async () => { h.modeReplies[0]!({ mode: 'normal' }) })
  expect((screen.getByRole('button', { name: '返回会话' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { h.modeReplies[1]!({ mode: 'normal' }) })
  await waitFor(() => expect($dockOpen.get()).toBe(false))
})
