import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ConversationActions } from "../../src/ui/conversation-actions.js"

it("菜单键盘导航可到导出，选择后关闭、导出并回到触发按钮", () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onFind = vi.fn(), onExport = vi.fn()
  render(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={onFind} onExport={onExport} />)
  fireEvent.click(triggerRef.current!)
  const find = screen.getByRole("menuitem", { name: /查找当前对话/ })
  const download = screen.getByRole("menuitem", { name: "导出对话" })
  expect(document.activeElement).toBe(find)
  fireEvent.keyDown(find, { key: "ArrowDown" })
  expect(document.activeElement).toBe(download)
  fireEvent.keyDown(download, { key: "ArrowUp" })
  expect(document.activeElement).toBe(find)
  fireEvent.keyDown(find, { key: "End" })
  expect(document.activeElement).toBe(download)
  fireEvent.click(download)
  expect(onExport).toHaveBeenCalledOnce()
  expect(onFind).not.toHaveBeenCalled()
  expect(screen.queryByRole("menu")).toBeNull()
  expect(document.activeElement).toBe(triggerRef.current)
})

it("导出中禁止再次导出，键盘跳过禁用项；没有导出回调时不提供该项", () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onExport = vi.fn()
  const r = render(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={vi.fn()} onExport={onExport} exporting />)
  fireEvent.click(triggerRef.current!)
  const find = screen.getByRole("menuitem", { name: /查找当前对话/ })
  const download = screen.getByRole("menuitem", { name: "导出对话" }) as HTMLButtonElement
  expect(download.disabled).toBe(true)
  fireEvent.keyDown(find, { key: "ArrowDown" })
  expect(document.activeElement).toBe(find)
  fireEvent.click(download)
  expect(onExport).not.toHaveBeenCalled()
  fireEvent.keyDown(find, { key: "Escape" })
  r.rerender(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={vi.fn()} />)
  fireEvent.click(triggerRef.current!)
  expect(screen.queryByRole("menuitem", { name: "导出对话" })).toBeNull()
})
