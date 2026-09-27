/**
 * 转录里的压缩标记（2026-09-27，spec §2.3）：四种状态各有说法；摘要能展开；失败是 alert。
 */
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CompactionRow } from "../../src/ui/compaction-row.js"

describe("CompactionRow", () => {
  it("正在压：写原因", () => {
    const { container } = render(<CompactionRow item={{ type: "compaction", id: "c", status: "running", reason: "threshold" }} />)
    expect(container.textContent).toContain("正在压缩上下文…（自动：快到上限了）")
    expect(container.querySelector(".compaction-mark")?.getAttribute("data-status")).toBe("running")
  })
  it("压完：原因、前后用量、说清「记录都还在」、压缩本身花了多少；摘要默认收着，点开才有", () => {
    render(
      <CompactionRow
        item={{ type: "compaction", id: "c", status: "done", reason: "manual", tokensBefore: 112_000, tokensAfter: 9_400, summary: "## Goal\n假摘要", usage: { input: 98_100, output: 1_100 } }}
      />,
    )
    expect(screen.getByText("已压缩上下文")).toBeTruthy()
    expect(screen.getByText("你让压的")).toBeTruthy()
    expect(screen.getByText("112k → 约 9.4k tokens")).toBeTruthy()
    expect(screen.getByText(/上面的记录都还在/)).toBeTruthy()
    expect(screen.getByText("压缩本身用了 输入 98.1k · 输出 1.1k")).toBeTruthy()
    expect(screen.queryByText(/假摘要/)).toBeNull()
    const 钮 = screen.getByRole("button", { name: "这次的摘要" })
    expect(钮.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(钮)
    expect(screen.getByText(/假摘要/)).toBeTruthy()
  })
  it("从记录恢复的（没有原因）：不写原因", () => {
    const { container } = render(<CompactionRow item={{ type: "compaction", id: "c", status: "done" }} />)
    expect(container.textContent).not.toMatch(/你让压的|自动：/)
  })
  it("没压成：alert，写原因", () => {
    render(<CompactionRow item={{ type: "compaction", id: "c", status: "failed", error: "对话还太短，没有可压缩的" }} />)
    expect(screen.getByRole("alert").textContent).toContain("上下文没压缩成：对话还太短，没有可压缩的")
  })
  it("停下了：说没有改动", () => {
    const { container } = render(<CompactionRow item={{ type: "compaction", id: "c", status: "cancelled", reason: "manual" }} />)
    expect(container.textContent).toContain("上下文压缩停下了，没有改动")
  })
})
