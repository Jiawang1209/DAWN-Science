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
  it('exposes project creation, metadata settings and persisted favorites', async () => {
    const a = project('a'), b = { ...project('b'), favorite: true as const, description: 'Project description' }
    const { props } = fixture([a, b], {})
    const onCreateProject = vi.fn(), onEditProject = vi.fn(), onToggleFavorite = vi.fn().mockResolvedValue(undefined)
    render(<AppHome {...props} onCreateProject={onCreateProject} onEditProject={onEditProject} onToggleFavorite={onToggleFavorite} />)
    await screen.findByText('Project description')
    expect(screen.getAllByRole('article')[0]?.textContent).toContain('Project b')
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
    expect(onCreateProject).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '项目设置：Project b' }))
    expect(onEditProject).toHaveBeenCalledWith(b)
    fireEvent.click(screen.getByRole('button', { name: '取消收藏项目：Project b' }))
    await waitFor(() => expect(onToggleFavorite).toHaveBeenCalledWith(b))
  })
  it('makes favorite placement explicit and keeps other projects in their own group', async () => {
    const { props } = fixture([project('a'), { ...project('b'), favorite: true }], {})
    render(<AppHome {...props} />)
    const favorites = await screen.findByRole('group', { name: '已收藏 · 优先显示' })
    expect(within(favorites).getByText('Project b')).toBeTruthy()
    expect(within(favorites).queryByText('Project a')).toBeNull()
    expect(within(screen.getByRole('group', { name: '其他项目' })).getByText('Project a')).toBeTruthy()
  })
  it('lists remote workspaces beyond the six recent chats and opens the latest matching session', async () => {
    const remote = { connectionId: 'server', label: '研究服务器', cwd: '/data/study' }
    const old = session('remote-old', 'scratch', { remote })
    const newest = session('remote-new', 'scratch', { remote, lastActiveAt: '2026-11-02T00:00:00Z' })
    const { props } = fixture([project('a'), project('scratch', true)], {
      a: Array.from({ length: 7 }, (_, i) => session(`local-${i}`, 'a', { lastActiveAt: '2026-11-25T00:00:00Z' })),
      scratch: [old, newest, session('archived', 'scratch', { remote: { ...remote, cwd: '/archive' }, archivedAt: '2026-11-03T00:00:00Z' })],
    })
    render(<AppHome {...props} />)
    const group = await screen.findByRole('group', { name: '远程工作区' })
    const button = within(group).getByRole('button', { name: /研究服务器/ })
    expect(button.textContent).toContain('/data/study')
    expect(button.textContent).toContain('2 个会话')
    expect(within(group).queryByText('/archive')).toBeNull()
    fireEvent.click(button)
    await waitFor(() => expect(props.onOpenSession).toHaveBeenCalledWith(newest))
  })
  it('keeps identical directory names on different servers separate', async () => {
    const a = session('a', 'scratch', { remote: { connectionId: 'one', label: 'Server one', cwd: '/data' } })
    const b = session('b', 'scratch', { remote: { connectionId: 'two', label: 'Server two', cwd: '/data' } })
    const { props } = fixture([project('scratch', true)], { scratch: [a, b] })
    render(<AppHome {...props} />)
    const group = await screen.findByRole('group', { name: '远程工作区' })
    expect(within(group).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(group).getByRole('button', { name: /Server two/ }))
    await waitFor(() => expect(props.onOpenSession).toHaveBeenCalledWith(b))
  })
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
