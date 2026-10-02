import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type React from "react"
import { AtMenu, 接管粘贴, use艾特候选 } from "../../src/ui/at-menu.js"
import { 请求内核语言 } from "../../src/files/mentions.js"

function Menu() {
  const state = use艾特候选("Py", undefined)
  return <AtMenu 态={state} selected={0} 有源={false} onPick={() => {}} onHover={() => {}} />
}

describe("没有文件源时的内核入口", () => {
  it("没有工作目录也能选择 @Py", () => {
    render(<Menu />)
    expect(screen.getByRole("option", { name: /^@Py/ })).toBeTruthy()
  })
  it("粘贴保护独立于文件源，也能尊重关闭设置", () => {
    const preventDefault = vi.fn()
    const write = vi.fn()
    const event = {
      clipboardData: { getData: () => "@R 分析" }, preventDefault,
      currentTarget: { value: "", selectionStart: 0, selectionEnd: 0 },
    } as unknown as React.ClipboardEvent<HTMLTextAreaElement>
    expect(接管粘贴(event, undefined, write, true)).toBe(true)
    expect(请求内核语言(write.mock.calls[0]![0])).toEqual([])
    write.mockClear()
    expect(接管粘贴(event, undefined, write, false)).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})
