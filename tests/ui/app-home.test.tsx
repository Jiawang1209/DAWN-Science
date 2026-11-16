import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppHome, type AppHomeProps } from '../../src/ui/app-home.js'
import type { ProjectSummary, SessionSummary } from '../../src/protocol/index.js'

const project = (id: string, temporary?: true): ProjectSummary => ({ projectId: id, name: `Project ${id}`, workspace: `/research/${id}`, createdAt: '2026-11-01T00:00:00Z', totalRunCount: 0, totalSessionCount: 1, unresolvedProblemCount: 0, ...(temporary ? { temporary } : {}) })
const session = (id: string, pid: string, extra: Partial<SessionSummary> = {}): SessionSummary => ({ sessionId: id, projectId: pid, agentId: 'model', kind: 'native', state: 'alive', pinned: false, sortOrder: 0, createdAt: '2026-11-01T00:00:00Z', title: `Chat ${id}`, ...extra })
function fixture(projects: ProjectSummary[], rows: Record<string, SessionSummary[]>) {
  const get = vi.fn(async (op: string, request: unknown): Promise<unknown[]> => op === 'listProjects' ? projects : rows[(request as { projectId: string }).projectId] ?? [])
  const props: AppHomeProps = { client: { get: get as AppHomeProps['client']['get'] }, projects, ready: true, onOpenProject: vi.fn(), onOpenSession: vi.fn().mockResolvedValue(undefined), onChooseProject: vi.fn().mockResolvedValue(undefined), onNewChat: vi.fn() }
  return { props, get }
}

describe('App homepage', () => {
  it('reports a project-list read failure instead of claiming there are no projects', async () => {
    const { props, get } = fixture([], {})
    get.mockRejectedValueOnce(new Error('listProjects unavailable'))
    render(<AppHome {...props} />)
    expect((await screen.findByRole('alert')).textContent).toContain('listProjects unavailable')
    expect(screen.queryByText('还没有项目，打开一个文件夹即可开始。')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await screen.findByText('还没有项目，打开一个文件夹即可开始。')
  })
  it('sorts across all projects by activity, excluding archived and terminal sessions', async () => {
    const latest = session('latest', 'b', { lastActiveAt: '2026-11-16T00:00:00Z' })
    const { props } = fixture([project('a'), project('b'), project('scratch', true)], {
      a: [session('old', 'a')], b: [latest, session('archived', 'b', { archivedAt: '2026-11-16T00:00:00Z' }), session('terminal', 'b', { kind: 'pty' })], scratch: [session('temporary', 'scratch')],
    })
    render(<AppHome {...props} />)
    const resume = await screen.findByRole('button', { name: /上次进行到这里/ })
    expect(resume.textContent).toContain('Chat latest')
    expect(screen.queryByRole('button', { name: /Chat archived|Chat terminal/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Project scratch/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Chat temporary/ }).textContent).toContain('普通对话')
    fireEvent.click(resume)
    await waitFor(() => expect(props.onOpenSession).toHaveBeenCalledWith(latest))
  })
  it('provides a useful empty state and lets chat start without projects or runtimes', async () => {
    const { props, get } = fixture([], {})
    render(<AppHome {...props} />)
    await screen.findByText('还没有会话，开始一段新对话吧。')
    expect(get.mock.calls.map(([op]) => op)).toEqual(['listProjects'])
    fireEvent.click(screen.getByRole('button', { name: '新建对话' }))
    expect(props.onNewChat).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '打开项目' }))
    await waitFor(() => expect(props.onChooseProject).toHaveBeenCalledOnce())
  })
  it('keeps partial results and can retry an actual project-read failure', async () => {
    const { props, get } = fixture([project('a'), project('b')], { b: [session('b', 'b')] })
    let failed = false
    get.mockImplementation(async (op, req) => {
      if (op === 'listProjects') return props.projects.slice()
      if ((req as { projectId: string }).projectId === 'a' && !failed) { failed = true; throw new Error('project unavailable') }
      return [session('b', 'b')]
    })
    render(<AppHome {...props} />)
    expect((await screen.findByRole('alert')).textContent).toContain('project unavailable')
    expect(screen.getByRole('button', { name: /Chat b/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(get.mock.calls.filter(([op]) => op === 'listSessions')).toHaveLength(4)
  })
  it('shows open failures on home and restores usable controls', async () => {
    const { props } = fixture([], {})
    props.onChooseProject = vi.fn().mockRejectedValue(new Error('cannot open folder'))
    render(<AppHome {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '打开项目' }))
    expect((await screen.findByRole('alert')).textContent).toContain('cannot open folder')
    expect((screen.getByRole('button', { name: '打开项目' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('drops a slow old response after switching project lists', async () => {
    const { props, get } = fixture([project('old')], { new: [session('new', 'new')] })
    let finish!: (value: SessionSummary[]) => void
    get.mockImplementation((op, request) => {
      if (op === 'listProjects') return Promise.resolve(props.projects.slice())
      if ((request as { projectId: string }).projectId === 'old') return new Promise(resolve => { finish = resolve })
      return Promise.resolve([session('new', 'new')])
    })
    const ui = render(<AppHome {...props} />)
    await waitFor(() => expect(finish).toBeDefined())
    const newProjects = [project('new')]
    get.mockImplementation(async op => op === 'listProjects' ? newProjects : [session('new', 'new')])
    ui.rerender(<AppHome {...props} projects={newProjects} />)
    await screen.findByRole('button', { name: /Chat new/ })
    await act(async () => finish([session('stale', 'old')]))
    expect(screen.queryByRole('button', { name: /Chat stale/ })).toBeNull()
  })
  it('does not start detection or read sessions before connection readiness', async () => {
    const { props, get } = fixture([project('a')], {})
    render(<AppHome {...props} ready={false} />)
    expect(within(screen.getByRole('main')).getByText('正在连接…')).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
  })
})
