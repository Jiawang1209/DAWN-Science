import { createEvent, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SessionTabs } from "../../src/ui/session-tabs.js"
import { SessionRow } from "../../src/ui/views.js"
import type { SessionSummary } from "../../src/protocol/index.js"

const tabs = [{ sessionId: "a", title: "甲" }, { sessionId: "b", title: "乙", pinned: true, canDock: false }]
const empty = () => {}
const actions = () => ({ onPin: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onMove: vi.fn(), onExtra: vi.fn(), onDelete: vi.fn() })
const summary = { sessionId: "b", projectId: "p", agentId: "a", kind: "native", state: "alive", createdAt: "2026-10-18T00:00:00Z", sortOrder: 0, title: "乙", pinned: true } as SessionSummary

it("侧栏会话右键与更多菜单可放进坞，动作只触发目标回调", () => {
  const dock = vi.fn(), pick = vi.fn()
  const { container } = render(<SessionRow session={summary} active={false} current={false} onPick={pick} onPutInDock={dock} />)
  fireEvent.contextMenu(container.querySelector('li')!)
  fireEvent.click(screen.getByRole('menuitem', { name: '放进坞里' }))
  expect(dock).toHaveBeenCalledOnce()
  expect(pick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '会话操作：乙' }))
  expect(screen.getByRole('menuitem', { name: '放进坞里' })).toBeTruthy()
})

it("侧栏终端仍不提供放进坞入口", () => {
  const { container } = render(<SessionRow session={{ ...summary, kind: 'pty' }} active={false} current={false} onPick={empty} onPutInDock={empty} onPin={empty} />)
  fireEvent.contextMenu(container.querySelector('li')!)
  expect(screen.queryByRole('menuitem', { name: '放进坞里' })).toBeNull()
})

it("顶部菜单与侧栏动作一致，非当前且不可入坞的页签仍有菜单", () => {
  const target = actions()
  const getActions = vi.fn(() => target)
  const row = render(<SessionRow session={summary} active={false} current={false} onPick={empty} {...target} />)
  fireEvent.contextMenu(row.container.querySelector("li")!)
  const sidebarLabels = screen.getAllByRole("menuitem").map(x => x.textContent)
  row.unmount()
  render(<SessionTabs tabs={tabs} current="a" onPick={empty} onSessionActions={getActions} onPutInDock={empty} />)
  fireEvent.contextMenu(screen.getByRole("tab", { name: "乙" }))
  expect(screen.getAllByRole("menuitem").map(x => x.textContent)).toEqual(sidebarLabels)
  expect(getActions).toHaveBeenCalledWith("b")
  fireEvent.click(screen.getByRole("menuitem", { name: "删除" }))
  expect(target.onDelete).toHaveBeenCalledOnce()
})

it.each(["取消置顶", "上移", "下移", "收进归档", "标为未读", "在新会话中继续", "在访达中打开工作目录", "复制工作目录", "复制标题", "复制会话 ID"])("非当前页签操作 %s 只调用目标动作", label => {
  const a = actions(), b = actions(), onPick = vi.fn()
  render(<SessionTabs tabs={tabs} current="a" onPick={onPick} onSessionActions={id => id === "a" ? a : b} />)
  fireEvent.contextMenu(screen.getByRole("tab", { name: "乙" }))
  fireEvent.click(screen.getByRole("menuitem", { name: label }))
  expect(Object.values(a).every(fn => fn.mock.calls.length === 0)).toBe(true)
  expect(Object.values(b).reduce((n, fn) => n + fn.mock.calls.length, 0)).toBe(1)
  expect(onPick).not.toHaveBeenCalled()
})

it("保留可入坞页签的额外入口，未读时省略标为未读", () => {
  const dock = vi.fn(), b = actions()
  render(<SessionTabs tabs={[{ sessionId: "a", title: "甲", unread: true }]} current="a" onPick={empty} onPutInDock={dock} onSessionActions={() => b} />)
  fireEvent.contextMenu(screen.getByRole("tab", { name: "甲" }))
  expect(screen.queryByRole("menuitem", { name: "标为未读" })).toBeNull()
  fireEvent.click(screen.getByRole("menuitem", { name: "放进坞里" }))
  expect(dock).toHaveBeenCalledWith("a")
})

it("按实际菜单尺寸收进视口，方向键与首尾键导航，Escape 返回目标页签", () => {
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "menu" ? { width: 220, height: 410, top: 0, left: 0, bottom: 410, right: 220, x: 0, y: 0, toJSON: empty } : original.call(this)
  })
  render(<SessionTabs tabs={tabs} current="a" onPick={empty} onSessionActions={() => actions()} />)
  const tab = screen.getByRole("tab", { name: "乙" })
  fireEvent.contextMenu(tab, { clientX: innerWidth - 1, clientY: innerHeight - 1 })
  const menu = screen.getByRole("menu")
  expect(parseFloat(menu.style.left)).toBe(innerWidth - 228)
  expect(parseFloat(menu.style.top)).toBe(innerHeight - 418)
  const items = within(menu).getAllByRole("menuitem")
  expect(document.activeElement).toBe(items[0])
  fireEvent.keyDown(menu, { key: "End" }); expect(document.activeElement).toBe(items.at(-1))
  fireEvent.keyDown(menu, { key: "ArrowDown" }); expect(document.activeElement).toBe(items[0])
  fireEvent.keyDown(menu, { key: "ArrowDown" }); expect(document.activeElement).toBe(items[1])
  fireEvent.keyDown(menu, { key: "Home" }); expect(document.activeElement).toBe(items[0])
  fireEvent.keyDown(menu, { key: "ArrowUp" }); expect(document.activeElement).toBe(items.at(-1))
  fireEvent.keyDown(document, { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(tab)
  vi.restoreAllMocks()
})

it("顶部重命名支持输入法回车、取消及 Enter 保存目标标题", () => {
  const rename = vi.fn()
  render(<SessionTabs tabs={tabs} current="a" onPick={empty} onSessionActions={() => ({ onRename: rename })} />)
  const open = () => {
    fireEvent.contextMenu(screen.getByRole("tab", { name: "乙" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }))
    return screen.getByRole("textbox", { name: "重命名会话：乙" })
  }
  let input = open()
  fireEvent.change(input, { target: { value: "草稿" } })
  const composingEnter = createEvent.keyDown(input, { key: "Enter", isComposing: true })
  fireEvent(input, composingEnter)
  expect(rename).not.toHaveBeenCalled(); expect(screen.getByRole("textbox")).toBe(input)
  fireEvent.keyDown(input, { key: "Escape" })
  fireEvent.blur(input)
  expect(rename).not.toHaveBeenCalled()
  input = open()
  fireEvent.change(input, { target: { value: "新标题" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(rename).toHaveBeenCalledExactlyOnceWith("新标题")
  expect(screen.queryByRole("textbox")).toBeNull()
})

it("没有目标任务上下文时不展示依赖它的额外动作", () => {
  render(<SessionTabs tabs={tabs} current="a" onPick={empty} onSessionActions={() => ({ onPin: empty, onRename: empty, onDelete: empty })} />)
  fireEvent.contextMenu(screen.getByRole("tab", { name: "乙" }))
  expect(screen.getAllByRole("menuitem").map(x => x.textContent)).toEqual(["取消置顶", "重命名", "删除"])
})

it("侧栏重命名也能取消和保存，切入编辑时不改变 Hook 顺序", () => {
  const rename = vi.fn()
  const { container } = render(<SessionRow session={summary} active={false} current={false} onPick={empty} onRename={rename} />)
  const open = () => {
    fireEvent.contextMenu(container.querySelector("li")!)
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }))
    return screen.getByRole("textbox")
  }
  let input = open()
  fireEvent.change(input, { target: { value: "取消的标题" } })
  fireEvent.keyDown(input, { key: "Escape" })
  expect(rename).not.toHaveBeenCalled()
  input = open()
  fireEvent.change(input, { target: { value: "保存的标题" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(rename).toHaveBeenCalledExactlyOnceWith("保存的标题")
})
