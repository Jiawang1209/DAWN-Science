import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { ToolGroupRow } from "../../src/ui/views.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const command = (id: string, status: "running" | "ok", startedAt: number, endedAt?: number): Extract<TranscriptItem, { type: "tool" }> => ({
  type: "tool", id, name: "bash", input: { command: id === "t2" ? "pytest -q" : "ls" }, status, startedAt,
  ...(endedAt === undefined ? {} : { endedAt }),
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("工具组人话摘要", () => {
  it("运行文案至少显示 150 ms，随后换成完成摘要", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const running = [command("t1", "ok", 900, 950), command("t2", "running", 1_000)]
    const { rerender } = render(<ToolGroupRow tools={running} />)
    expect(screen.getByText("正在运行 · pytest")).toBeTruthy()

    rerender(<ToolGroupRow tools={[command("t1", "ok", 900, 950), command("t2", "ok", 1_000, 1_020)]} />)
    act(() => vi.advanceTimersByTime(149))
    expect(screen.getByText("正在运行 · pytest")).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText("正在运行 · pytest")).toBeNull()
    expect(screen.getByText("跑了 2 条命令")).toBeTruthy()
  })
})
