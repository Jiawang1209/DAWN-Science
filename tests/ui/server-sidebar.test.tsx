import { expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ServerSidebar, type ServerSidebarProps } from "../../src/ui/server-sidebar.js"
import type { RemoteConnection } from "../../src/protocol/index.js"
const connection: RemoteConnection = { id: "s1", label: "生态服务器", host: "example.org", port: 22,
  username: "researcher", hasSecret: false, sortOrder: 0, createdAt: "2026-10-11T00:00:00.000Z", state: { kind: "ready" } }
const props = (): ServerSidebarProps => ({ groups: [], folded: () => false, onToggle: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn(),
  onConnect: vi.fn(), onDisconnect: vi.fn(), onNewTask: vi.fn(), renderTask: () => null, renderSelection: () => null })
it("空目录提供常驻且有无障碍名称的添加入口", () => {
  const p = props(); render(<ServerSidebar {...p} />)
  fireEvent.click(screen.getByRole("button", { name: "添加服务器" }))
  expect(p.onAdd).toHaveBeenCalledOnce()
  expect(screen.getByText("还没有服务器")).toBeTruthy()
})
it("没有会话的已连接服务器可直接新建远端任务", () => {
  const p = props(); render(<ServerSidebar {...p} groups={[{ id: connection.id, connection, tasks: [] }]} />)
  expect(screen.getByRole("img", { name: "已连接" })).toBeTruthy()
  expect(screen.queryByText("已连接")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "新建远端任务" }))
  expect(p.onNewTask).toHaveBeenCalledWith(connection)
})
it("忙碌只禁用操作，不误报真实连接状态", () => {
  render(<ServerSidebar {...props()} busyId="s1" groups={[{ id: "s1", connection, tasks: [] }]} />)
  expect(screen.getByRole("img", { name: "已连接" })).toBeTruthy()
  expect(screen.queryByText("已连接")).toBeNull()
  expect((screen.getByRole("button", { name: "新建远端任务" }) as HTMLButtonElement).disabled).toBe(true)
})
it("被移除连接的历史组仍显示，但不能创建远端任务", () => {
  render(<ServerSidebar {...props()} groups={[{ id: "removed", tasks: [] }]} />)
  expect(screen.getByText("连接已移除")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "新建远端任务" })).toBeNull()
})

it("服务器菜单支持键盘进入与Esc回到触发按钮", () => {
  render(<ServerSidebar {...props()} groups={[{ id: "s1", connection, tasks: [] }]} />)
  const trigger = screen.getByRole("button", { name: "管理服务器：生态服务器" })
  fireEvent.click(trigger)
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "断开" }))
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  expect(document.activeElement).toBe(trigger)
})


it("多选与添加入口在标题行内，批量工具仍独立显示", () => {
  const { container } = render(<ServerSidebar {...props()} headerActions={<button>多选</button>} toolbar={<div>已选 0</div>} />)
  expect(container.querySelector('.side-section')?.contains(screen.getByRole('button', { name: '多选' }))).toBe(true)
  expect(screen.getByRole('button', { name: '添加服务器' }).textContent).toBe('')
  expect(container.querySelector('.side-section')?.contains(screen.getByText('已选 0'))).toBe(false)
})

it("未连接状态与失败原因仍显示文字", () => {
  const disconnected = { ...connection, state: { kind: 'disconnected' as const, reason: '连接已断开' } }
  render(<ServerSidebar {...props()} groups={[{ id: 's1', connection: disconnected, tasks: [] }]} />)
  expect(screen.getByText('未连接')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('连接已断开')
})


it("新建远端任务在服务器行内，折叠时也能新建并展开该机器", () => {
  const p = props()
  const { container } = render(<ServerSidebar {...p} folded={id => id === 's1'} groups={[{ id: 's1', connection, tasks: [] }]} />)
  const add = screen.getByRole('button', { name: /^新建远端任务$/ })
  expect(container.querySelector('.side-subhead-row')?.contains(add)).toBe(true)
  expect(add.textContent).toBe('')
  fireEvent.click(add)
  expect(p.onToggle).toHaveBeenCalledWith('s1')
  expect(p.onNewTask).toHaveBeenCalledWith(connection)
})
