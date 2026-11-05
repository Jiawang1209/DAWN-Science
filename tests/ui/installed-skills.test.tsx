import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AgentSkillsView, type SkillActions } from '../../src/ui/skills.js'
import type { InstalledSkillFile } from '../../src/protocol/skill-management.js'
import { $lang } from '../../src/ui/i18n/index.js'

const row = (name: string, tags: string[] = []) => ({ name, tags, tagsOverridden: false, description: `About ${name}`, filePath: `/skills/${name}/SKILL.md`, from: 'global' as const, manualOnly: false, invocation: 'model' as const, mutable: true })
function fixture() {
  let rows = [row('alpha', ['科研']), row('beta', ['绘图'])]
  const load = vi.fn(async () => ({ skills: rows, dirs: { global: '/skills' }, problems: [] }))
  const actions: SkillActions = {
    hasProject: false, setInvocation: vi.fn(async () => ({})), importSkill: vi.fn(), deleteSkill: vi.fn(), pickDirectory: vi.fn(), 问: vi.fn(),
    listFiles: vi.fn(async () => ({ files: [{ path: 'SKILL.md', bytes: 60 }, { path: 'references/method.md', bytes: 20 }], notices: [] })),
    readFile: vi.fn(async (_filePath, path) => ({ path, bytes: 60, text: path === 'SKILL.md' ? '---\nname: alpha\n---\n# Alpha method\n\n![remote](https://example.com/tracker.png)\n<script>alert(1)</script>' : '# Reference method' })),
    setTags: vi.fn(async (filePath, tags, reset) => { rows = rows.map(row => row.filePath === filePath ? { ...row, tags: reset ? ['科研'] : tags ?? [], tagsOverridden: !reset } : row); return {} }),
    setBulkInvocation: vi.fn(async filePaths => ({ updated: filePaths, failed: [] })),
    refreshSession: vi.fn(async () => ({ count: 2, problems: [] })),
  }
  return { load, actions }
}
it('preserves authored Chinese tag facets and their filters while fixed controls remain English', async () => {
  const previous = $lang.get()
  $lang.set('en')
  try {
    const load = async () => ({ skills: [row('custom', ['技能']), { ...row('bundled', ['科研']), from: 'builtin' as const, mutable: false }], dirs: {}, problems: [] })
    render(<AgentSkillsView load={load} />)
    const group = await screen.findByRole('group', { name: 'Filter by tag' })
    const custom = within(group).getByRole('button', { name: '技能' })
    const bundled = within(group).getByRole('button', { name: '科研' })
    expect(custom.hasAttribute('data-authored')).toBe(true)
    expect(bundled.hasAttribute('data-authored')).toBe(true)
    expect(group.closest('[data-authored]')).toBeNull()
    expect(within(group).getByRole('button', { name: 'Any tag' }).closest('[data-authored]')).toBeNull()
    fireEvent.click(custom)
    expect(screen.getByText('About custom')).toBeTruthy()
    expect(screen.queryByText('About bundled')).toBeNull()
    fireEvent.click(bundled)
    expect(screen.queryByText('About custom')).toBeNull()
    expect(screen.getByText('About bundled')).toBeTruthy()
  } finally { act(() => $lang.set(previous)) }
})
it('opens disabled/bundled-capable package detail, browses resources and safely renders Markdown/source', async () => {
  const { load, actions } = fixture(); const { container } = render(<AgentSkillsView load={load} actions={actions} />)
  fireEvent.click(await screen.findByRole('button', { name: '查看技能 alpha' }))
  await screen.findByRole('heading', { name: 'Alpha method' })
  expect(container.querySelector('script')).toBeNull(); expect(container.querySelector('img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '源码' }))
  expect(screen.getByText(/name: alpha/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'references/method.md' }))
  fireEvent.click(screen.getByRole('button', { name: '文档视图：references/method.md' }))
  await screen.findByRole('heading', { name: 'Reference method' })
  fireEvent.click(screen.getByRole('button', { name: '技能目录' }))
  expect(screen.getByRole('button', { name: '查看技能 beta' })).toBeTruthy()
})
it('filters by tags and applies bulk modes only to explicit selected rows', async () => {
  const { load, actions } = fixture(); render(<AgentSkillsView load={load} actions={actions} />)
  fireEvent.click(await screen.findByRole('button', { name: '科研' }))
  expect(screen.queryByRole('button', { name: '查看技能 beta' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '选择筛选结果' }))
  fireEvent.click(screen.getByRole('button', { name: '批量只手动' }))
  await waitFor(() => expect(actions.setBulkInvocation).toHaveBeenCalledWith(['/skills/alpha/SKILL.md'], 'manual'))
})
it('clears a vanished tag filter after personal tags are changed', async () => {
  const { load, actions } = fixture(); render(<AgentSkillsView load={load} actions={actions} />)
  fireEvent.click(await screen.findByRole('button', { name: '科研' }))
  fireEvent.click(screen.getByRole('button', { name: '查看技能 alpha' }))
  fireEvent.change(screen.getByRole('textbox', { name: '个人标签' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '应用标签：alpha' }))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: '技能目录' }))
  expect(await screen.findByRole('button', { name: '查看技能 beta' })).toBeTruthy()
})
it('saves and resets personal tags and refreshes the active session explicitly', async () => {
  const { load, actions } = fixture(); render(<AgentSkillsView load={load} actions={actions} />)
  fireEvent.click(await screen.findByRole('button', { name: '刷新当前会话技能' }))
  await waitFor(() => expect(actions.refreshSession).toHaveBeenCalledTimes(1))
  expect(actions.setInvocation).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '查看技能 alpha' }))
  fireEvent.change(screen.getByRole('textbox', { name: '个人标签' }), { target: { value: '土壤, 统计' } })
  fireEvent.click(screen.getByRole('button', { name: '应用标签：alpha' }))
  await waitFor(() => expect(actions.setTags).toHaveBeenCalledWith('/skills/alpha/SKILL.md', ['土壤', '统计'], false))
  fireEvent.click(screen.getByRole('button', { name: '恢复原有标签' }))
  await waitFor(() => expect(actions.setTags).toHaveBeenCalledWith('/skills/alpha/SKILL.md', undefined, true))
})
it('ignores a late resource response after switching files and shows read failures', async () => {
  const { load, actions } = fixture()
  let resolve!: (file: InstalledSkillFile) => void
  actions.readFile = vi.fn((_manifest: string, path: string): Promise<InstalledSkillFile> => path === 'SKILL.md' ? new Promise(yes => { resolve = yes }) : Promise.resolve({ path, bytes: 9, text: '# Current' }))
  render(<AgentSkillsView load={load} actions={actions} />)
  fireEvent.click(await screen.findByRole('button', { name: '查看技能 alpha' }))
  fireEvent.click(await screen.findByRole('button', { name: 'references/method.md' }))
  await screen.findByRole('heading', { name: 'Current' })
  await act(async () => resolve({ path: 'SKILL.md', bytes: 6, text: '# Stale' }))
  expect(screen.queryByRole('heading', { name: 'Stale' })).toBeNull()
})
