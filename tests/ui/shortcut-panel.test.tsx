import { expect, it, vi } from "vitest"
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react"
import { ShortcutPanel } from "../../src/ui/shortcut-panel.js"

it.each([
  ["MacIntel", "⌘ K", "⌘ P", "⌃ ⇧ G", "⌘ Enter", "⌘⇧E"],
  ["Win32", "Ctrl K", "Ctrl P", "Ctrl Shift G", "Ctrl Enter", "Ctrl+Shift+E"],
  ["Linux x86_64", "Ctrl K", "Ctrl P", "Ctrl Shift G", "Ctrl Enter", "Ctrl+Shift+E"],
])("%s 显示对应键位；终端中断始终保留 Ctrl+C", async (platform, command, files, review, enter, enhance) => {
  const platformGetter = vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
  vi.resetModules()
  try {
    // 优化输入的共享文案在模块加载时读取平台，也必须按实际启动环境验证。
    const { ShortcutPanel: PlatformPanel } = await import("../../src/ui/shortcut-panel.js")
    const { unmount } = render(<PlatformPanel onClose={vi.fn()} />)
    const keys = Array.from(screen.getByRole("dialog").querySelectorAll("kbd"), k => k.textContent)
    expect(keys).toEqual([command, files, review, "Enter", "Shift Enter", enter, enhance, "Esc", "Tab", "↑ ↓", enter, "Ctrl C"])
    unmount()
  } finally {
    platformGetter.mockRestore()
    vi.resetModules()
  }
})

it("只读速查按功能分组，显示真实键位和生效条件", () => {
  const { container } = render(<ShortcutPanel onClose={vi.fn()} />)
  expect(container.querySelector(".shortcut-panel")).toBeNull()
  const dialog = screen.getByRole("dialog", { name: "快捷键速查" })
  expect(within(dialog).getByText("通用导航")).toBeTruthy()
  expect(within(dialog).getByText("对话输入")).toBeTruthy()
  expect(within(dialog).getByText("笔记本与终端")).toBeTruthy()
  expect(within(dialog).getByText("运行中调整方向")).toBeTruthy()
  expect(within(dialog).getByText("仅在对话输入框中生效")).toBeTruthy()
  expect(within(dialog).getAllByRole("button")).toHaveLength(1)
  expect(dialog.querySelectorAll("kbd").length).toBeGreaterThan(8)
})

it("自动聚焦关闭键，Tab 不离开，Esc 和外部关闭；点击内容不关闭", () => {
  const onClose = vi.fn()
  render(<ShortcutPanel onClose={onClose} />)
  const dialog = screen.getByRole("dialog", { name: "快捷键速查" })
  const close = within(dialog).getByRole("button")
  expect(document.activeElement).toBe(close)
  const tab = createEvent.keyDown(close, { key: "Tab", cancelable: true })
  fireEvent(close, tab)
  expect(tab.defaultPrevented).toBe(true)
  fireEvent.mouseDown(screen.getByText("通用导航"))
  expect(onClose).not.toHaveBeenCalled()
  const outside = createEvent.mouseDown(dialog, { cancelable: true })
  fireEvent(dialog, outside)
  expect(outside.defaultPrevented).toBe(true)
  expect(onClose).toHaveBeenCalledOnce()
  fireEvent.keyDown(close, { key: "Escape" })
  expect(onClose).toHaveBeenCalledTimes(2)
})

it("打开命令面板等新浮层时，关闭速查不抢走新输入框的焦点", () => {
  const trigger = document.createElement("button")
  const nextInput = document.createElement("input")
  document.body.append(trigger, nextInput)
  trigger.focus()
  const { unmount } = render(<ShortcutPanel onClose={vi.fn()} />)
  nextInput.focus()
  unmount()
  expect(document.activeElement).toBe(nextInput)
  trigger.remove()
  nextInput.remove()
})
