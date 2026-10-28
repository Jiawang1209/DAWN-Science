import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppStatusBar, type AppStatusBarProps } from '../../src/ui/app-statusbar.js'

const candidate = { path: '/env/python', source: 'settings' as const, kernelPackage: 'present' as const, version: '3.12' }
const props = (): AppStatusBarProps => ({
  model: { name: 'Analysis Model', provider: 'Research', kind: 'API' },
  environment: { scopeId: 'local', label: '本机', paths: { python: candidate.path }, probe: vi.fn(async () => ({ python: [candidate], r: [] })), configure: vi.fn() },
  counts: { plugins: 0, skills: 12, mcp: 2, subagents: 4 },
  scopeLabel: '项目甲', version: '0.0.38', onOpenSettings: vi.fn(),
})

describe('App 底部状态栏', () => {
  it('左侧模型、R、Python，右侧真实 0、数量、版本；未知不冒充 0', () => {
    const p = props(); p.counts.mcp = undefined
    render(<AppStatusBar {...p} />)
    expect(screen.getByRole('button', { name: '当前模型：Analysis Model' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'R：未配置' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Python：已配置待检测' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '插件 0' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'MCP —' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skills 12' }))
    expect(p.onOpenSettings).toHaveBeenCalledWith('skills')
    fireEvent.click(screen.getByRole('button', { name: '版本 v0.0.38' }))
    expect(p.onOpenSettings).toHaveBeenLastCalledWith('about')
    expect(p.environment.probe).not.toHaveBeenCalled()
  })

  it('打开详情不自动扫描，主动检测才显示就绪及版本；Escape 返回入口', async () => {
    const p = props(); render(<AppStatusBar {...p} />)
    const trigger = screen.getByRole('button', { name: 'Python：已配置待检测' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Python 解释器状态' }).textContent).toContain(candidate.path)
    expect(p.environment.probe).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    await screen.findByRole('button', { name: 'Python：已就绪' })
    expect(screen.getByRole('dialog').textContent).toContain('3.12')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('缺少内核包和检测失败显示异常，未配置时仍可进入配置', async () => {
    const p = props(); p.environment.probe = vi.fn(async () => ({ python: [{ ...candidate, kernelPackage: 'missing' as const }], r: [] }))
    render(<AppStatusBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Python：已配置待检测' }))
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    await screen.findByRole('button', { name: 'Python：异常' })
    expect(screen.getByRole('dialog').textContent).toContain('ipykernel')
    fireEvent.click(screen.getByRole('button', { name: '配置解释器' }))
    expect(p.environment.configure).toHaveBeenCalledOnce()
  })

  it('远端切换及路径修改后丢弃旧检测，不能显示本机就绪', async () => {
    const p = props()
    let resolve!: (value: { python: typeof candidate[]; r: never[] }) => void
    p.environment.probe = () => new Promise(r => { resolve = r })
    const { rerender } = render(<AppStatusBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Python：已配置待检测' }))
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    const remote = { ...p, environment: { ...p.environment, scopeId: 'remote-1', label: '服务器甲', paths: { python: '/remote/python' } } }
    rerender(<AppStatusBar {...remote} />)
    await act(async () => resolve({ python: [candidate], r: [] }))
    expect(screen.queryByRole('button', { name: 'Python：已就绪' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Python：已配置待检测' }))
    expect(screen.getByRole('dialog').textContent).toContain('服务器甲')
    expect(screen.getByRole('dialog').textContent).not.toContain('/env/python')
    rerender(<AppStatusBar {...remote} environment={{ ...remote.environment, paths: undefined, error: '远端配置读取失败' }} />)
    expect(screen.getByRole('button', { name: 'Python：异常' })).toBeTruthy()
  })

  it('检测请求失败可重试，不把网络错误显示为未配置', async () => {
    const p = props(); p.environment.probe = vi.fn().mockRejectedValueOnce(new Error('检测连接失败')).mockResolvedValue({ python: [candidate], r: [] })
    render(<AppStatusBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Python：已配置待检测' }))
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    await screen.findByRole('button', { name: 'Python：异常' })
    expect(screen.getByRole('dialog').textContent).toContain('检测连接失败')
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    await screen.findByRole('button', { name: 'Python：已就绪' })
  })

  it('同一连接修改路径也必须重新检测；旧请求返回不能覆盖新路径', async () => {
    const p = props()
    let finish!: (value: { python: typeof candidate[]; r: never[] }) => void
    p.environment.probe = () => new Promise(resolve => { finish = resolve })
    const { rerender } = render(<AppStatusBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Python：已配置待检测' }))
    fireEvent.click(screen.getByRole('button', { name: '检测解释器' }))
    rerender(<AppStatusBar {...p} environment={{ ...p.environment, paths: { python: '/changed/python' } }} />)
    await act(async () => finish({ python: [candidate], r: [] }))
    expect(screen.getByRole('button', { name: 'Python：已配置待检测' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Python：已就绪' })).toBeNull()
  })

  it('未读取配置不会冒充未配置；连接错误优先于旧内核运行状态', () => {
    const p = props()
    const { rerender } = render(<AppStatusBar {...p} environment={{ ...p.environment, paths: undefined }} />)
    expect(screen.getByRole('button', { name: 'Python：读取中' })).toBeTruthy()
    rerender(<AppStatusBar {...p} environment={{ ...p.environment, error: '链路已断开', kernels: [{ language: 'python', state: 'busy' }] }} />)
    expect(screen.getByRole('button', { name: 'Python：异常' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Python：异常' }))
    expect(screen.getByRole('dialog').textContent).toContain('链路已断开')
    expect((screen.getByRole('button', { name: '检测解释器' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('内核 busy/starting/detached 如实显示，退出后回到配置检测状态', () => {
    const p = props(); const { rerender } = render(<AppStatusBar {...p} />)
    for (const [state, text] of [['busy', '运行中'], ['starting', '启动中'], ['detached', '连接中断'], ['exited', '已配置待检测']] as const) {
      rerender(<AppStatusBar {...p} environment={{ ...p.environment, kernels: [{ language: 'python', state }] }} />)
      expect(screen.getByRole('button', { name: `Python：${text}` })).toBeTruthy()
    }
  })

  it('模型详情保留完整名称，扩展菜单入口可通过键盘关闭', async () => {
    const p = props(); render(<AppStatusBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: '当前模型：Analysis Model' }))
    expect(screen.getByRole('dialog').textContent).toContain('Research')
    fireEvent.click(screen.getByRole('button', { name: '模型与服务设置' }))
    expect(p.onOpenSettings).toHaveBeenCalledWith('models')
    const trigger = screen.getByRole('button', { name: '扩展数量' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: '子 Agent 4' }))
    expect(p.onOpenSettings).toHaveBeenCalledWith('subagents')
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})
