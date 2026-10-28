import { beforeEach, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionSidebar } from "../../src/ui/views.js"
import type { SessionSummary, TaskSummary } from "../../src/protocol/index.js"
import { SIDEBAR_FOLDED_KEY, SIDEBAR_PROJECTS_OPEN_KEY } from "../../src/ui/state/sidebar.js"

const tasks: TaskSummary[] = [
  { taskId: "ta", sessionId: "a", title: "会话甲", workspace: "/project-a", pinned: false, sortOrder: 0, createdAt: "2026-10-28T00:00:00Z" },
  { taskId: "tb", sessionId: "b", title: "会话乙", workspace: "/project-b", pinned: false, sortOrder: 1, createdAt: "2026-10-28T00:00:00Z" },
]
const summary = (id: string): SessionSummary => ({ sessionId: id, projectId: id, title: id === "a" ? "会话甲" : "会话乙", agentId: "native", kind: "native", pinned: false, sortOrder: 0, state: "alive", createdAt: "2026-10-28T00:00:00Z" })
const base = { projects: [], agents: ["native"], 排序全集: [], activeProjectId: "a", activeSessionId: "a", view: "conversation" as const,
  onPickProject: vi.fn(), onPickSession: vi.fn(), onOpenProject: vi.fn(), onNewSession: vi.fn(), onShowPanel: vi.fn(),
}
beforeEach(() => { localStorage.removeItem(SIDEBAR_FOLDED_KEY); localStorage.removeItem(SIDEBAR_PROJECTS_OPEN_KEY) })
function expand(container: HTMLElement) {
  for (const item of container.querySelectorAll(".proj-item")) if (!item.querySelector(".sess-item")) fireEvent.click(item.querySelector(".proj-head .row")!)
}

it("切换当前项目及摘要加载范围后，所有会话仍是省略号；菜单删除绑定原任务", () => {
  const remove = vi.fn(), pick = vi.fn()
  const view = render(<SessionSidebar {...base} tasks={tasks} sessionOf={id => id === "a" ? summary(id) : undefined}
    onDeleteTask={remove} onDeleteSession={vi.fn()} onPickTask={pick} />)
  expand(view.container)
  for (const name of ["会话甲", "会话乙"]) expect(screen.getByRole("button", { name: `会话操作：${name}` }).textContent).toBe("⋯")
  expect(screen.queryByRole("button", { name: /^删除会话：/ })).toBeNull()
  view.rerender(<SessionSidebar {...base} activeSessionId="b" activeProjectId="b" tasks={tasks}
    sessionOf={id => id === "b" ? summary(id) : undefined} onDeleteTask={remove} onDeleteSession={vi.fn()} onPickTask={pick} />)
  for (const name of ["会话甲", "会话乙"]) expect(screen.getByRole("button", { name: `会话操作：${name}` }).textContent).toBe("⋯")
  fireEvent.click(screen.getByRole("button", { name: "会话操作：会话甲" }))
  expect(remove).not.toHaveBeenCalled()
  expect(pick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("menuitem", { name: "删除" }))
  expect(remove).toHaveBeenCalledExactlyOnceWith(tasks[0])
  expect(screen.queryByRole("menu")).toBeNull()
})

it("未加载摘要的会话菜单支持Escape恢复焦点，点击外部关闭不会删除", () => {
  const remove = vi.fn()
  const view = render(<SessionSidebar {...base} tasks={tasks} sessionOf={() => undefined} onDeleteTask={remove} />)
  expand(view.container)
  const trigger = screen.getByRole("button", { name: "会话操作：会话乙" })
  fireEvent.click(trigger)
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "删除" }))
  fireEvent.keyDown(document, { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  fireEvent.click(document.querySelector(".menu-scrim")!)
  expect(screen.queryByRole("menu")).toBeNull()
  expect(remove).not.toHaveBeenCalled()
})
