import { expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RightDock } from "../../src/ui/views.js"
it("三个常用面板直接可见，其他六项通过更多切换且不关闭", () => {
  const onPick = vi.fn(), onClose = vi.fn()
  render(<RightDock tenant="files" width={380} onWidth={vi.fn()} onPick={onPick} onClose={onClose}><div>内容</div></RightDock>)
  for (const name of ["文件", "产物", "笔记本"]) expect(screen.getByRole("tab", { name })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "更多面板" }))
  for (const name of ["审阅", "概览", "网页", "子 agent", "团队", "对话"]) expect(screen.getByRole("menuitem", { name })).toBeTruthy()
  fireEvent.click(screen.getByRole("menuitem", { name: "审阅" }))
  expect(onPick).toHaveBeenCalledWith("review")
  expect(onClose).not.toHaveBeenCalled()
})
it("更多中的当前面板有明确选中标签", () => {
  render(<RightDock tenant="review" width={380} onWidth={vi.fn()} onPick={vi.fn()} onClose={vi.fn()}><div>审阅内容</div></RightDock>)
  expect(screen.getByRole("tab", { name: "审阅" }).getAttribute("aria-selected")).toBe("true")
})
