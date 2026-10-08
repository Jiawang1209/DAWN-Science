import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionTabs } from "../../src/ui/session-tabs.js"

const tabs = [
  { sessionId: "a", title: "会话甲" },
  { sessionId: "b", title: "会话乙" },
  { sessionId: "c", title: "会话丙" },
]

function transfer() {
  const data = new Map<string, string>()
  return {
    effectAllowed: "all",
    dropEffect: "none",
    files: [],
    items: [],
    types: [] as string[],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  }
}

describe("主区会话页签排序", () => {
  it("拖动页签到另一格后提交新的完整顺序", () => {
    const onReorder = vi.fn()
    render(<SessionTabs tabs={tabs} current="a" onPick={() => {}} onReorder={onReorder} />)
    const a = screen.getByRole("tab", { name: "会话甲" }).closest(".session-tab-wrap")!
    const c = screen.getByRole("tab", { name: "会话丙" }).closest(".session-tab-wrap")!
    const dataTransfer = transfer()

    fireEvent.dragStart(c, { dataTransfer })
    fireEvent.dragOver(a, { dataTransfer })
    fireEvent.drop(a, { dataTransfer })

    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b"])
  })
})
