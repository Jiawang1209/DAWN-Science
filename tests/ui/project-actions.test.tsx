import { expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProjectActions } from "../../src/ui/project-actions.js"

it("项目写字入口直接新建，菜单仅保留项目管理", () => {
  const onNew = vi.fn(), onDelete = vi.fn()
  render(<ProjectActions name="土壤微生物分析" onNew={onNew} onDelete={onDelete} />)
  expect(screen.getAllByRole("button")).toHaveLength(2)
  fireEvent.click(screen.getByRole("button", { name: "在「土壤微生物分析」里开一段新对话" }))
  expect(onNew).toHaveBeenCalledOnce()
  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.queryByRole("menu")).toBeNull()
})

it("删除只转交原确认流程，关闭菜单", () => {
  const onDelete = vi.fn()
  render(<ProjectActions name="土壤" onDelete={onDelete} />)
  fireEvent.click(screen.getByRole("button"))
  fireEvent.click(screen.getByRole("menuitem", { name: "删除项目：土壤" }))
  expect(onDelete).toHaveBeenCalledOnce()
  expect(screen.queryByRole("menu")).toBeNull()
})

it("键盘进入菜单，方向键切换，Esc回到项目操作入口", () => {
  render(<ProjectActions name="土壤" onNew={vi.fn()} onDelete={vi.fn()} />)
  const trigger = screen.getByRole("button", { name: "项目操作：土壤" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  expect(screen.queryByRole("menuitem", { name: /里开一段/ })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "删除项目：土壤" }))
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "删除项目：土壤" }))
  fireEvent.keyDown(document.activeElement!, { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it("点菜单外关闭，没有操作权限的项目不显示空菜单", () => {
  const { unmount } = render(<ProjectActions name="土壤" onDelete={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "项目操作：土壤" }))
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole("menu")).toBeNull()
  unmount()
  render(<ProjectActions name="土壤" />)
  expect(screen.queryByRole("button")).toBeNull()
})
