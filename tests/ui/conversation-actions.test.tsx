import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ConversationActions } from "../../src/ui/conversation-actions.js"

it("直接显示查找和导出，点一次执行，不经过更多菜单", () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onFind = vi.fn(), onExport = vi.fn()
  render(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={onFind} onExport={onExport} />)
  expect(screen.queryByRole("menu")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "查找当前对话" }))
  expect(onFind).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "导出对话" }))
  expect(onExport).toHaveBeenCalledOnce()
  expect(triggerRef.current).toBe(screen.getByRole("button", { name: "查找当前对话" }))
})

it("导出中禁止重复执行；没有导出回调时不提供该项", () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onExport = vi.fn()
  const r = render(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={vi.fn()} onExport={onExport} exporting />)
  const download = screen.getByRole("button", { name: "导出对话" }) as HTMLButtonElement
  expect(download.disabled).toBe(true)
  fireEvent.click(download)
  expect(onExport).not.toHaveBeenCalled()
  r.rerender(<ConversationActions title="监测分析" triggerRef={triggerRef} onFind={vi.fn()} />)
  expect(screen.queryByRole("button", { name: "导出对话" })).toBeNull()
})

it("两个动作使用图标按钮，并关联各自的文字提示", () => {
  render(<ConversationActions title="监测分析" triggerRef={createRef<HTMLButtonElement>()} onFind={vi.fn()} onExport={vi.fn()} />)
  for (const name of ["查找当前对话", "导出对话"]) {
    const button = screen.getByRole("button", { name })
    expect(button.querySelector("svg")).not.toBeNull()
    expect(button.textContent).toBe("")
    expect(button.hasAttribute("title")).toBe(false)
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)
    expect(tip?.getAttribute("role")).toBe("tooltip")
    expect(tip?.textContent).toBe(name)
  }
})
