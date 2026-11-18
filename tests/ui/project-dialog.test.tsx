import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDialog, type ProjectDialogProps } from '../../src/ui/project-dialog.js'
import { 科研目录 } from '../../src/policy/science-layout.js'
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
  it('chooses a native location and submits research folders without custom Agent Context', async () => {
    const { get, props } = setup()
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.click(screen.getByRole('button', { name: '选择文件夹' }))
    await waitFor(() => expect(screen.getByLabelText('保存位置').getAttribute('value')).toBe('/research'))
    fireEvent.change(screen.getByLabelText('项目说明（可选）'), { target: { value: 'Display' } })
    expect(screen.queryByLabelText(/Agent/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '初始化科研目录' }))
    expect(get).not.toHaveBeenCalled()
    expect([...screen.getByRole('region', { name: '科研目录预览' }).querySelectorAll('[data-path]')].map(e=>e.getAttribute('data-path')).sort()).toEqual([...科研目录].sort())
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(project))
    expect(get).toHaveBeenCalledWith('createProject', { name: '研究', parentDirectory: '/research', description: 'Display', scienceLayout: true })
  })
  it('collapses without clearing selection and creates plain projects after removing it', async () => {
    const { get } = setup({ defaultParent: '/research' })
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    const trigger=screen.getByRole('button',{name:'初始化科研目录'})
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('region',{name:'科研目录预览'})).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button',{name:'取消添加'}))
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('region',{name:'科研目录预览'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'创建项目'}))
    await waitFor(()=>expect(get).toHaveBeenCalledWith('createProject',{name:'研究',parentDirectory:'/research',description:'',scienceLayout:false}))
  })
  it('keeps research selection after create failure and retries with no custom context', async () => {
    const { get } = setup({ defaultParent: '/research' })
    get.mockRejectedValueOnce(new Error('保存失败'))
    fireEvent.change(screen.getByLabelText('项目名称'), {target:{value:'研究'}})
    fireEvent.click(screen.getByRole('button',{name:'初始化科研目录'}))
    fireEvent.click(screen.getByRole('button',{name:'创建项目'}))
    await screen.findByRole('alert')
    expect(screen.getByRole('button',{name:'已选择科研目录'}).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button',{name:'创建项目'}))
    await waitFor(()=>expect(get).toHaveBeenCalledTimes(2))
    expect(get.mock.calls.every(([,req])=>req.scienceLayout===true&&!('agentContext' in req))).toBe(true)
  })
  it('keeps a pasted parent on chooser cancellation and preserves all fields after save failure', async () => {
    const { get, pickDirectory, props } = setup()
    pickDirectory.mockResolvedValue(null)
    get.mockRejectedValueOnce(new Error('目标目录已存在'))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.change(screen.getByLabelText('保存位置'), { target: { value: '/existing' } })
    fireEvent.click(screen.getByRole('button', { name: '选择文件夹' }))
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledWith('/existing'))
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    expect((await screen.findByRole('alert')).textContent).toContain('目标目录已存在')
    expect((screen.getByLabelText('保存位置') as HTMLInputElement).value).toBe('/existing')
    expect(props.onSaved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce())
  })
  it('prevents repeated saves and dismissal until the pending save completes', async () => {
    const { get, props } = setup()
    let complete!: (project: ProjectSummary) => void
    get.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '研究' } })
    fireEvent.change(screen.getByLabelText('保存位置'), { target: { value: '/research' } })
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
    expect(screen.queryByRole('button', { name: '选择文件夹' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('updateProject', { projectId: 'p', name: '新名称', description: '' }))
  })
})
