import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDialog, type ProjectDialogProps } from '../../src/ui/project-dialog.js'
import type { ProjectSummary } from '../../src/protocol/index.js'

const project: ProjectSummary = { projectId: 'p', name: '研究', workspace: '/research/研究', createdAt: '2026-11-16T00:00:00Z', totalRunCount: 0, totalSessionCount: 0, unresolvedProblemCount: 0 }
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
  })
})
function setup(extra: Partial<ProjectDialogProps> = {}) {
  const get = vi.fn().mockResolvedValue(project), pickDirectory = vi.fn().mockResolvedValue('/research')
  const props: ProjectDialogProps = { client: { get, pickDirectory }, onSaved: vi.fn(), onClose: vi.fn(), ...extra }
  render(<ProjectDialog {...props} />)
  return { get, pickDirectory, props }
}
describe('project dialog', () => {
  it('chooses a native parent directory and sends layout/context separately from display text', async () => {
    const { get, props } = setup()
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.click(screen.getByRole('button', { name: '浏览目录' }))
    await waitFor(() => expect(screen.getByLabelText('父目录').getAttribute('value')).toBe('/research'))
    fireEvent.change(screen.getByLabelText('项目说明（可选）'), { target: { value: 'Display' } })
    fireEvent.click(screen.getByText('科研目录与 AI 约定'))
    fireEvent.click(screen.getByRole('checkbox', { name: '建立标准科研目录' }))
    fireEvent.change(screen.getByLabelText('Agent 上下文（可选）'), { target: { value: 'Use R' } })
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(project))
    expect(get).toHaveBeenCalledWith('createProject', { name: '研究', parentDirectory: '/research', description: 'Display', scienceLayout: true, agentContext: 'Use R' })
  })
  it('keeps a pasted parent on chooser cancellation and preserves all fields after save failure', async () => {
    const { get, pickDirectory, props } = setup()
    pickDirectory.mockResolvedValue(null)
    get.mockRejectedValueOnce(new Error('目标目录已存在'))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.change(screen.getByLabelText('父目录'), { target: { value: '/existing' } })
    fireEvent.click(screen.getByRole('button', { name: '浏览目录' }))
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledWith('/existing'))
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    expect((await screen.findByRole('alert')).textContent).toContain('目标目录已存在')
    expect((screen.getByLabelText('父目录') as HTMLInputElement).value).toBe('/existing')
    expect(props.onSaved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce())
  })
  it('prevents repeated saves and dismissal until the pending save completes', async () => {
    const { get, props } = setup()
    let complete!: (project: ProjectSummary) => void
    get.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.change(screen.getByLabelText('父目录'), { target: { value: '/research' } })
    const save = screen.getByRole('button', { name: '创建项目' })
    fireEvent.click(save); fireEvent.click(save)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
    expect(get).toHaveBeenCalledOnce(); expect(props.onClose).not.toHaveBeenCalled()
    await act(async () => complete(project))
    expect(props.onSaved).toHaveBeenCalledOnce()
  })
  it('edits display metadata without renaming the directory or rewriting AGENTS.md', async () => {
    const { get } = setup({ project })
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '新名称' } })
    expect(screen.queryByRole('button', { name: '浏览目录' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('updateProject', { projectId: 'p', name: '新名称', description: '' }))
  })
})
