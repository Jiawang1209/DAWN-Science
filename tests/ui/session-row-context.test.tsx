import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionRow } from "../../src/ui/views.js"

describe("侧栏会话右键菜单", () => {
  it("在会话行右键时打开与“…”相同的归档菜单", () => {
    render(
      <SessionRow
        session={{ sessionId: "s1", projectId: "p1", title: "分析会话", kind: "native", state: "idle", createdAt: Date.now() } as never}
        active={false}
        current={false}
        onPick={vi.fn()}
        onArchive={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByText("分析会话"), { clientX: 100, clientY: 80 })

    expect(screen.getByRole("menuitem", { name: "收进归档" })).toBeTruthy()
  })
})
