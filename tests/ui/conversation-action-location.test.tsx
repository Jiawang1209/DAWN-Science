import { fireEvent, render, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ConversationView } from "../../src/ui/views.js"

it("主会话标题留在顶栏，当前会话按钮在内容区，查找与Esc焦点回到本地入口", () => {
  const headerTarget = document.createElement("div")
  document.body.append(headerTarget)
  const session = { sessionId: "local-menu", projectId: "p1", agentId: "ds-chat", kind: "native" as const, pinned: false, sortOrder: 0, state: "alive" as const, createdAt: "2026-10-20T00:00:00Z", title: "监测分析" }
  const result = render(<ConversationView session={session} headerTarget={headerTarget} items={[]} onSend={vi.fn()} />)
  try {
    expect(headerTarget.querySelector(".conv-title")?.textContent).toBe("监测分析")
    expect(headerTarget.querySelector(".conv-actions")).toBeNull()
    const button = within(result.container).getByRole("button", { name: "查找当前对话" })
    button.focus()
    fireEvent.click(button)
    const search = within(result.container).getByRole("searchbox")
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: "Escape" })
    expect(document.activeElement).toBe(button)
  } finally {
    result.unmount()
    headerTarget.remove()
  }
})
