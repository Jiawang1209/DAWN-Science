import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { recentWorkspacePaths } from '../../src/ui/workspace-menu.js'
import { ConversationView, EmptyConversation } from '../../src/ui/views.js'
import { resetAllState } from '../../src/ui/state/index.js'
import type { SessionSummary } from '../../src/protocol/index.js'

const session: SessionSummary = { sessionId: 'workspace-menu', projectId: 'p', agentId: 'ds-chat', kind: 'native', pinned: false, sortOrder: 1, state: 'alive', createdAt: '2026-10-28T00:00:00Z' }
const menu = { defaultPath: '/research/默认目录', recentPaths: ['/research/soil', '/other/soil'] }
beforeEach(resetAllState)
afterEach(cleanup)

it('搜索按完整路径区分同名目录，默认工作目录始终固定在最下面', async () => {
  const select = vi.fn(), send = vi.fn()
  render(<ConversationView session={session} items={[]} workspace='/research/soil' onSend={send}
    onPickWorkspace={vi.fn()} workspaceMenu={menu} onSelectWorkspace={select} />)
  const input = screen.getByPlaceholderText(/输入问题/)
  fireEvent.change(input, { target: { value: '保留我的草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '工作目录：/research/soil' }))
  const dialog = screen.getByRole('dialog', { name: '工作目录' })
  expect(dialog.textContent).not.toContain('/research/')
  expect(dialog.textContent).not.toContain('/other/')
  expect(within(dialog).getAllByText('soil')).toHaveLength(2)
  fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: '/other/' } })
  expect(within(dialog).queryByRole('menuitemradio', { name: '/research/soil' })).toBeNull()
  expect(within(dialog).getByRole('menuitemradio', { name: '/other/soil' })).toBeTruthy()
  const options = within(dialog).getAllByRole('menuitemradio')
  expect(options.at(-1)?.textContent).toContain('默认工作目录')
  await act(async () => fireEvent.click(options.at(-1)!))
  expect(select).toHaveBeenCalledExactlyOnceWith(undefined)
  expect((input as HTMLTextAreaElement).value).toBe('保留我的草稿')
  expect(send).not.toHaveBeenCalled()
})

it('首页选默认目录清除待选项目但保留草稿，发送前不建会话', async () => {
  const start = vi.fn(), pick = vi.fn(async (path?: string) => path ?? null)
  render(<EmptyConversation agents={['ds-chat']} onStart={start} onOpenSettings={vi.fn()}
    onPickDirectory={pick} workspaceMenu={menu} />)
  const input = screen.getByPlaceholderText(/输入问题/)
  fireEvent.change(input, { target: { value: '分析土壤数据' } })
  fireEvent.click(screen.getByRole('button', { name: '工作目录：默认工作目录' }))
  await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: '/research/soil' })))
  expect(pick).toHaveBeenCalledWith('/research/soil')
  fireEvent.click(screen.getByRole('button', { name: '工作目录：/research/soil' }))
  await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: /默认工作目录/ })))
  expect(start).not.toHaveBeenCalled()
  expect((input as HTMLTextAreaElement).value).toBe('分析土壤数据')
  await act(async () => fireEvent.submit(input.closest('form')!))
  expect(start.mock.calls[0]?.slice(0, 3)).toEqual(['ds-chat', '分析土壤数据', undefined])
})

it('键盘可选择最近目录，Escape返回入口，不提交表单', () => {
  render(<ConversationView session={session} items={[]} onSend={vi.fn()} onPickWorkspace={vi.fn()}
    workspaceMenu={menu} onSelectWorkspace={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: '工作目录：默认工作目录' })
  fireEvent.click(trigger)
  const search = screen.getByRole('searchbox')
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '/research/soil' }))
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(document.activeElement?.textContent).toContain('默认工作目录')
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('默认路径读取失败时显示错误并禁用默认项，不猜一个落盘位置', () => {
  render(<EmptyConversation agents={['ds-chat']} onStart={vi.fn()} onOpenSettings={vi.fn()}
    onPickDirectory={vi.fn()} workspaceMenu={{ recentPaths: [], error: '无法读取设置' }} />)
  fireEvent.click(screen.getByRole('button', { name: '工作目录：默认工作目录' }))
  expect(screen.getByRole('menuitemradio', { name: /默认工作目录/ })).toHaveProperty('disabled', true)
  expect(screen.getByRole('alert').textContent).toContain('无法读取设置')
})

it('最近列表排除远端和临时目录，去重后按最近会话排序', () => {
  const task = { taskId: 'one', pinned: false, sortOrder: 1, createdAt: '2026-10-27T00:00:00Z' }
  expect(recentWorkspacePaths([
    { ...task, workspace: '/old' },
    { ...task, taskId: 'two', workspace: '/new', createdAt: '2026-10-28T00:00:00Z' },
    { ...task, taskId: 'three', workspace: '/old' },
    { ...task, taskId: 'four', workspace: '/remote', connectionId: 'ssh' },
    { ...task, taskId: 'five', scratchWorkspace: '/scratch/private' },
  ])).toEqual(['/new', '/old'])
})
