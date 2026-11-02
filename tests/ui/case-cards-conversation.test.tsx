import { describe, expect, it, vi } from "vitest"
import { render, within } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s", projectId: "p", agentId: "ds-chat", kind: "native", pinned: false,
  sortOrder: 1, state: "alive", createdAt: "2026-11-02T00:00:00Z",
}
const user = (id: string): TranscriptItem => ({ type: "turn", id, who: "user", text: "展示案例卡片", final: true })
const answer = (text: string): TranscriptItem => ({ type: "turn", id: "answer", who: "agent", text, final: true })
const tool = (id: string, title = "网络布局浅览"): TranscriptItem => ({
  type: "tool", id, name: "mlai-science__search_cases", input: {}, status: "ok",
  result: "截断正文", caseResults: [{ case_id: id, title, language: "r" }],
})
function show(items: TranscriptItem[]) {
  const result = render(<ConversationView session={session} items={items} onSend={vi.fn()} onOpenWeb={vi.fn()} />)
  return result.container.querySelector('[data-turn-id="answer"]')!
}
const cards = (row: Element) => [...row.querySelectorAll(".case-title")].map(x => x.textContent)

describe("会话后续轮次的案例卡片", () => {
  it.each([false, true])("不重新搜索也能展示之前明确提及的案例（本轮取图=%s）", withAsset => {
    const row = show([
      user("u1"), tool("20251016-layout"), user("u2"),
      ...(withAsset ? [{ type: "tool" as const, id: "asset", name: "mlai-science__get_asset", input: {}, status: "ok" as const, result: "图片元数据" }] : []),
      answer("网络布局浅览"),
    ])
    expect(cards(row)).toEqual(["网络布局浅览"])
    expect(within(row as HTMLElement).getByRole("button", { name: "照这篇做" })).toBeDefined()
  })

  it("本轮查询结果优先，不被历史同名案例干扰", () => {
    const row = show([user("u1"), tool("old-layout"), user("u2"), tool("new-layout"), answer("网络布局浅览")])
    expect(cards(row)).toEqual(["网络布局浅览"])
  })

  it("历史同名标题不猜，完整 ID 可以消歧", () => {
    const row = show([user("u1"), tool("layout-a"), tool("layout-b"), user("u2"), answer("网络布局浅览；case_id: layout-b")])
    expect(cards(row)).toEqual(["网络布局浅览"])
  })

  it("没有明确 ID 的历史同名标题不出卡", () => {
    const row = show([user("u1"), tool("layout-a"), tool("layout-b"), user("u2"), answer("网络布局浅览")])
    expect(cards(row)).toEqual([])
  })

  it("没有提到、仅来自模型文字或后续检索的案例不出卡", () => {
    const row = show([
      user("u1"), tool("known-layout"),
      { type: "turn", id: "prior", who: "agent", text: "编造的案例标题", final: true },
      user("u2"), answer("编造的案例标题；未来案例标题"), tool("future-layout", "未来案例标题"),
    ])
    expect(cards(row)).toEqual([])
  })

  it("新会话无法复用其他会话的结果", () => {
    const row = show([user("u1"), answer("网络布局浅览；20251016-layout")])
    expect(cards(row)).toEqual([])
  })
})
