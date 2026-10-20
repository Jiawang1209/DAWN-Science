import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ConversationSearch } from "../../src/ui/conversation-search.js"
import { ConversationView, TranscriptRow } from "../../src/ui/views.js"
import { 还原成条目 } from "../../src/workbench/restored-items.js"
import { 年月日时分 } from "../../src/ui/format.js"
import { SessionTranscripts } from "../../src/workbench/events.js"

describe("当前会话内容搜索", () => {
  it("使用简短计数和图标导航，完整状态仍可读，按钮能循环查找", () => {
    const jump = vi.fn()
    render(<ConversationSearch items={[
      { type: "turn", id: "u1", who: "user", text: "鲸落一", final: true },
      { type: "turn", id: "u2", who: "user", text: "鲸落二", final: true },
    ]} onJump={jump} onClose={vi.fn()} />)
    expect(document.querySelector(".conversation-search-count")?.textContent).toBe("")
    const prev = screen.getByRole("button", { name: "上一条匹配" })
    const next = screen.getByRole("button", { name: "下一条匹配" })
    for (const button of [prev, next, screen.getByRole("button", { name: "收起查找" })]) {
      expect(button.textContent).toBe("")
      expect(button.querySelector("svg")).not.toBeNull()
      expect(document.getElementById(button.getAttribute("aria-describedby")!)).not.toBeNull()
    }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "鲸落" } })
    expect(document.querySelector(".conversation-search-count")?.textContent).toBe("1/2")
    expect(screen.getByRole("status").textContent).toBe("1 / 2 条匹配")
    fireEvent.click(prev)
    expect(jump).toHaveBeenLastCalledWith("u2", ["鲸落"])
    fireEvent.click(next)
    expect(jump).toHaveBeenLastCalledWith("u1", ["鲸落"])
  })
  it.each(["ctrlKey", "metaKey"])("%s+F 切换查找开关；Escape 返回输入框且保留草稿", (modifier) => {
    const session = { sessionId: "find", projectId: "p1", agentId: "ds-chat", kind: "native" as const, pinned: false, sortOrder: 0, state: "alive" as const, createdAt: "2026-10-14T00:00:00Z" }
    const r = render(<ConversationView session={session} items={[]} onSend={vi.fn()} />)
    const composer = r.container.querySelector(".composer-card textarea") as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: "保留草稿" } })
    composer.focus()
    fireEvent.keyDown(composer, { key: "f", [modifier]: true, isComposing: true })
    expect(screen.queryByRole("searchbox")).toBeNull()
    fireEvent.keyDown(composer, { key: "f", [modifier]: true })
    const search = screen.getByRole("searchbox") as HTMLInputElement
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: "鲸落" } })
    fireEvent.keyDown(search, { key: "f", [modifier]: true, repeat: true })
    expect(screen.getByRole("searchbox")).toBe(search)
    fireEvent.keyDown(search, { key: "f", [modifier]: true })
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(document.activeElement).toBe(composer)
    expect(composer.value).toBe("保留草稿")
    fireEvent.keyDown(composer, { key: "f", [modifier]: true })
    expect(document.activeElement).toBe(screen.getByRole("searchbox"))
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" })
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(document.activeElement).toBe(composer)
  })

  it("并排会话只查找焦点所在侧边；外部弹窗不触发主会话查找", () => {
    const session = { sessionId: "main", projectId: "p1", agentId: "ds-chat", kind: "native" as const, pinned: false, sortOrder: 0, state: "alive" as const, createdAt: "2026-10-14T00:00:00Z" }
    const r = render(<><ConversationView session={session} items={[]} onSend={vi.fn()} /><ConversationView session={{ ...session, sessionId: "side" }} 紧凑 items={[]} onSend={vi.fn()} /><div role="dialog"><input aria-label="外部输入" /></div></>)
    const roots = r.container.querySelectorAll(".conversation")
    const composer = roots[1]!.querySelector("textarea")!
    composer.focus()
    fireEvent.keyDown(composer, { key: "f", ctrlKey: true })
    expect(within(roots[0] as HTMLElement).queryByRole("searchbox")).toBeNull()
    const search = within(roots[1] as HTMLElement).getByRole("searchbox")
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: "Escape" })
    fireEvent.keyDown(screen.getByLabelText("外部输入"), { key: "f", metaKey: true })
    expect(screen.queryByRole("searchbox")).toBeNull()
    for (const scope of ["dialog", "menu", "term-host"]) {
      const overlay = document.createElement("div")
      if (scope === "term-host") overlay.className = scope
      else overlay.setAttribute("role", scope)
      const field = document.createElement("input")
      overlay.append(field)
      roots[0]!.append(overlay)
      field.focus()
      fireEvent.keyDown(field, { key: "f", ctrlKey: true })
      expect(screen.queryByRole("searchbox")).toBeNull()
      overlay.remove()
    }
  })

  it("会话内旧历史超预算仍可定位；切换会话收起并清空搜索", async () => {
    const session = { sessionId: "s1", projectId: "p1", agentId: "ds-chat", kind: "native" as const, pinned: false, sortOrder: 0, state: "alive" as const, createdAt: "2026-10-11T00:00:00Z" }
    const items = Array.from({ length: 48 }, (_, i) => ({ type: "turn" as const, id: `u${i}`, who: "user" as const, text: i === 0 ? "旧历史鲸落" : `普通问题${i}`, final: true }))
    const { container, rerender } = render(<ConversationView session={session} items={items} onSend={vi.fn()} />)
    expect(container.querySelector('[data-turn-id="u0"]')).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "查找内容" }))
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "鲸落" } })
    await waitFor(() => expect(container.querySelector('[data-turn-id="u0"]')?.getAttribute("data-search-hit")).toBe("true"))
    rerender(<ConversationView session={{ ...session, sessionId: "s2" }} items={[]} onSend={vi.fn()} />)
    expect(screen.queryByRole("searchbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "查找内容" }))
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("status").textContent).toBe("输入关键词")
  })

  it("只按传入转录匹配，支持一字、大小写和全角，下一条循环，不修改草稿", () => {
    const jump = vi.fn()
    render(<ConversationSearch items={[
      { type: "turn", id: "u", who: "user", text: "R 数据", final: true },
      { type: "turn", id: "a", who: "agent", text: "ｒ 结果", final: true },
      { type: "tool", id: "t", name: "bash", input: { command: "r script" }, status: "ok" },
    ]} onJump={jump} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "R" } })
    expect(screen.getByRole("status").textContent).toBe("1 / 3 条匹配")
    expect(jump).toHaveBeenLastCalledWith("u", ["r"])
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" })
    expect(jump).toHaveBeenLastCalledWith("a", ["r"])
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter", shiftKey: true })
    expect(jump).toHaveBeenLastCalledWith("u", ["r"])
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter", isComposing: true })
    expect(jump).toHaveBeenLastCalledWith("u", ["r"])
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "不存在" } })
    expect(screen.getByRole("status").textContent).toBe("没有匹配内容")
    expect((screen.getByRole("button", { name: "下一条匹配" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("用户消息时间", () => {
  it("实时服务端记录并还原真实历史时间；缺失时不编造日期", () => {
    const at = Date.parse("2026-10-11T04:23:00Z")
    const hub = new SessionTranscripts({ terminalMaxChars: 1000, now: () => at })
    hub.track("s", "native")
    hub.userTurn("s", "问题")
    expect(hub.subscribe("s").items[0]).toMatchObject({ at })
    const item = 还原成条目({ kind: "text", who: "user", text: "历史问题", at }, 0)
    expect(item).toMatchObject({ at })
    const { container, rerender } = render(<TranscriptRow item={item} agentId="DeepSeek" />)
    expect(container.querySelector(".turn-actions time")).not.toBeNull()
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(new Date(at).toISOString())
    expect(container.querySelector("time")?.textContent).toBe(年月日时分(new Date(at).toISOString()))
    rerender(<TranscriptRow item={{ type: "turn", id: "old", who: "user", text: "旧记录", final: true }} agentId="DeepSeek" />)
    expect(screen.getByText("时间不明")).toBeDefined()
    expect(container.querySelector("time")).toBeNull()
  })
})
