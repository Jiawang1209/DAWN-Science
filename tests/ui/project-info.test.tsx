import { beforeEach, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { SessionSidebar } from "../../src/ui/views.js"
import type { SessionSummary, TaskSummary } from "../../src/protocol/index.js"

const tasks: TaskSummary[] = Array.from({ length: 7 }, (_, i) => ({
  taskId: `t${i}`, sessionId: `s${i}`, title: `旧标题${i}`, workspace: "/research/soil",
  pinned: false, sortOrder: i, createdAt: `2026-11-0${i + 1}T00:00:00Z`,
}))
const sessionOf = (id: string): SessionSummary => ({
  sessionId: id, projectId: "p1", title: `会话${id.slice(1)}`, agentId: "native", kind: "native",
  state: "alive", pinned: false, sortOrder: 0, createdAt: "2026-11-01T00:00:00Z",
  lastActiveAt: `2026-11-0${Number(id.slice(1)) + 1}T00:00:00Z`,
})
const base = { projects: [], agents: ["native"], 排序全集: [], activeProjectId: "p1", activeSessionId: undefined, view: "conversation" as const,
  onPickProject: vi.fn(), onPickSession: vi.fn(), onOpenProject: vi.fn(), onNewSession: vi.fn(), onShowPanel: vi.fn(),
}
beforeEach(() => localStorage.clear())
function open() {
  fireEvent.click(screen.getByRole("button", { name: "项目操作：soil" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "项目信息" }))
  return screen.getByRole("dialog", { name: "项目信息：soil" })
}
it("搜索时仍显示完整项目计数与最近五段，并通过原任务打开会话", () => {
  const pick = vi.fn()
  render(<SessionSidebar {...base} tasks={[...tasks, { ...tasks[0]!, taskId: "remote", connectionId: "server" }]}
    sessionOf={sessionOf} onPickTask={pick} search={{ mode: "名字", onMode: vi.fn(), value: "会话0", onChange: vi.fn(), onClose: vi.fn() }} />)
  const card = open()
  expect(within(card).getByText("7 段对话")).toBeTruthy()
  expect(within(card).getByText("/research/soil")).toBeTruthy()
  const items = within(card).getAllByRole("button", { name: /打开会话：/ })
  expect(items.map(x => x.getAttribute("aria-label"))).toEqual([6, 5, 4, 3, 2].map(i => `打开会话：会话${i}`))
  fireEvent.click(items[0]!)
  expect(pick).toHaveBeenCalledExactlyOnceWith(tasks[6])
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("摘要未加载时使用任务标题，Escape回到项目入口，外部点击关闭", () => {
  render(<SessionSidebar {...base} tasks={tasks.slice(0, 1)} onPickTask={vi.fn()} />)
  const card = open()
  expect(within(card).getByRole("button", { name: "打开会话：旧标题0" })).toBeTruthy()
  fireEvent.keyDown(card, { key: "Escape" })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "项目操作：soil" }))
  open()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("新加入的空项目仍可查看信息，不显示编辑项目", () => {
  render(<SessionSidebar {...base} tasks={[]} workspaceFolders={["/research/soil"]} />)
  const card = open()
  expect(within(card).getByText("0 段对话")).toBeTruthy()
  expect(within(card).getByText("还没有会话")).toBeTruthy()
  expect(screen.queryByText("编辑项目")).toBeNull()
})
it("悬停延迟打开，跨入卡片可操作，离开后关闭", () => {
  vi.useFakeTimers()
  try {
    const view = render(<SessionSidebar {...base} tasks={tasks} sessionOf={sessionOf} onPickTask={vi.fn()} />)
    fireEvent.mouseEnter(view.container.querySelector(".proj-head")!)
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => vi.advanceTimersByTime(420))
    const card = screen.getByRole("dialog", { name: "项目信息：soil" })
    fireEvent.mouseLeave(view.container.querySelector(".proj-head")!)
    fireEvent.mouseEnter(card)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole("dialog")).toBeTruthy()
    fireEvent.mouseLeave(card)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole("dialog")).toBeNull()
  } finally { vi.useRealTimers() }
})
it("固定查看一个项目时，其他项目的悬停不会叠加卡片或夺走焦点", () => {
  vi.useFakeTimers()
  try {
    const view = render(<SessionSidebar {...base} tasks={[tasks[0]!, { ...tasks[1]!, workspace: "/research/other" }]} />)
    const card = open()
    expect(document.activeElement).toBe(card)
    const other = [...view.container.querySelectorAll(".proj-head")].find(x => x.textContent?.includes("other"))!
    fireEvent.mouseEnter(other)
    act(() => vi.advanceTimersByTime(420))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(document.activeElement).toBe(card)
  } finally { vi.useRealTimers() }
})
it("会话标题更新变长后仍将信息卡限制在窗口内", () => {
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("project-info-card") ? (this.textContent?.includes("很长的标题") ? 400 : 220) : 32
    return { x: 0, y: 500, left: 0, top: 500, right: 360, bottom: 500 + height, width: 360, height, toJSON: () => ({}) }
  })
  try {
    const view = render(<SessionSidebar {...base} tasks={tasks.slice(0, 1)} sessionOf={sessionOf} />)
    const card = open()
    expect(Number.parseFloat(card.style.top) + 220).toBeLessThanOrEqual(innerHeight - 8)
    view.rerender(<SessionSidebar {...base} tasks={tasks.slice(0, 1)} sessionOf={id => ({ ...sessionOf(id), title: "很长的标题".repeat(20) })} />)
    expect(Number.parseFloat(card.style.top) + 400).toBeLessThanOrEqual(innerHeight - 8)
  } finally { rect.mockRestore() }
})
it("会话数量更新不会夺走卡片内的键盘焦点", () => {
  const view = render(<SessionSidebar {...base} tasks={tasks.slice(0, 1)} sessionOf={sessionOf} onPickTask={vi.fn()} />)
  const card = open()
  const recent = within(card).getByRole("button", { name: "打开会话：会话0" })
  act(() => recent.focus())
  view.rerender(<SessionSidebar {...base} tasks={tasks.slice(0, 2)} sessionOf={sessionOf} onPickTask={vi.fn()} />)
  expect(document.activeElement).toBe(recent)
})
it("操作菜单打开时取消尚未弹出的悬停信息卡", () => {
  vi.useFakeTimers()
  try {
    const view = render(<SessionSidebar {...base} tasks={tasks} sessionOf={sessionOf} />)
    fireEvent.mouseEnter(view.container.querySelector(".proj-head")!)
    fireEvent.click(screen.getByRole("button", { name: "项目操作：soil" }))
    expect(screen.getByRole("menu")).toBeTruthy()
    act(() => vi.advanceTimersByTime(420))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("menu")).toBeTruthy()
    fireEvent.mouseLeave(view.container.querySelector(".proj-head")!)
    fireEvent.mouseEnter(view.container.querySelector(".proj-head")!)
    act(() => vi.advanceTimersByTime(420))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("menu")).toBeTruthy()
  } finally { vi.useRealTimers() }
})
