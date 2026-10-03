import { describe, expect, it, vi } from "vitest"
import { render, screen, renderHook, waitFor, act } from "@testing-library/react"
import type React from "react"
import { AtMenu, 接管粘贴, use艾特候选, type 引用文件源 } from "../../src/ui/at-menu.js"
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


describe("候选来源切换", () => {
  it("切换目录时立即清除旧候选，迟到的旧请求不能覆盖新目录", async () => {
    const listing = (name: string) => ({ path: "", entries: [{ name, kind: "file" as const, modifiedAt: "2026-10-03" }], ignored: 0, omitted: 0 })
    let finish!: (x: ReturnType<typeof listing>) => void
    const old: 引用文件源 = { 根: "", loadDir: vi.fn().mockResolvedValueOnce(listing("old.txt")).mockImplementationOnce(() => new Promise(r => { finish = r })), search: vi.fn() }
    const fresh: 引用文件源 = { 根: "", loadDir: vi.fn().mockResolvedValue(listing("new.txt")), search: vi.fn() }
    const { result, rerender } = renderHook(({ source, query }) => use艾特候选(query, source), { initialProps: { source: old, query: "" } })
    await waitFor(() => expect(result.current.行.some(x => x.path === "old.txt")).toBe(true))
    rerender({ source: old, query: "folder/" })
    expect(result.current.行.some(x => x.path === "old.txt")).toBe(false)
    rerender({ source: fresh, query: "" })
    await waitFor(() => expect(result.current.行.some(x => x.path === "new.txt")).toBe(true))
    await act(async () => finish(listing("late-old.txt")))
    expect(result.current.行.some(x => x.path === "late-old.txt")).toBe(false)
    expect(result.current.行.some(x => x.path === "new.txt")).toBe(true)
  })
})
