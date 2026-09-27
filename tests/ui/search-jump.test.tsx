/**
 * 从全文搜索点进来（会话全文搜索，2026-09-27，spec §2.3 / §7）。
 * 最要紧的一条：**那一条在「只渲染最近 40 块」之外时也跳得到**——点了没反应是最坏的一种。
 */
import { describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import { 默认转录预算 } from "../../src/ui/transcript-budget.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "exited",
  createdAt: "2026-08-08T00:00:00Z",
}
const 话 = (i: number, who: "user" | "agent", text: string): TranscriptItem => ({ type: "turn", id: `r${i}`, who, text, final: true })

/** 第一句带暗号，后面垫到超过预算 */
const 长对话 = (): TranscriptItem[] => [
  话(0, "user", "鲸落 Cox 回归"),
  ...Array.from({ length: 默认转录预算 + 4 }, (_, k) => 话(k + 1, k % 2 ? "user" : "agent", `垫话 ${k}`)),
]

describe("跳到那一处", () => {
  it("**预算之外的那一条**：先放出来，再标上 data-search-hit", async () => {
    const items = 长对话()
    const { container } = render(
      <ConversationView session={session} items={items} onSend={() => {}} 搜索跳到={{ sessionId: "s1", itemId: "r0", nth: 0, 词们: ["鲸落"], 起: Date.now() }} />,
    )
    await waitFor(() => expect(container.querySelector('[data-turn-id="r0"]')?.getAttribute("data-search-hit")).toBe("true"))
  })

  it("工具：所在的工具组展开、那一行展开，外壳带 data-item-id", async () => {
    const 工具 = (id: string, command: string): TranscriptItem => ({ type: "tool", id, name: "bash", input: { command }, status: "ok", result: "ok" })
    const items = [话(0, "user", "跑"), 工具("t1", "ls"), 工具("t2", "echo coxph"), 工具("t3", "pwd")]
    const { container } = render(
      <ConversationView session={session} items={items} onSend={() => {}} 搜索跳到={{ sessionId: "s1", itemId: "t2", nth: 0, 词们: ["coxph"], 起: Date.now() }} />,
    )
    await waitFor(() => expect(container.querySelector('[data-item-id="t2"]')?.className).toMatch(/\bopen\b/))
    expect(container.querySelector(".tool-group")?.className).toMatch(/\bopen\b/)
  })

  it("找不到：到点出声一次（不假装跳到了）", async () => {
    vi.useFakeTimers()
    const 跳空 = vi.fn()
    render(
      <ConversationView session={session} items={[话(0, "user", "别的")]} onSend={() => {}} 搜索跳到={{ sessionId: "s1", itemId: "r9", nth: 0, 词们: ["鲸落"], 起: Date.now() }} on跳空={跳空} />,
    )
    await vi.advanceTimersByTimeAsync(3_100)
    expect(跳空).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("**转录里夹着压缩记号、子 agent 那组、回退说明**：id 对不上时按第 nth 处找，预算之外也跳得到", async () => {
    const items: TranscriptItem[] = [
      话(0, "user", "先说一句鲸落"),
      { type: "compaction", id: "k1", status: "done" },
      { type: "subagents", id: "sa1", agents: [{ index: 0, agent: "reviewer", task: "看看鲸落", status: "ok" }] },
      { type: "notice", id: "n1", text: "回到了这句之前" },
      话(1, "agent", "第二处鲸落在这里"),
      ...Array.from({ length: 默认转录预算 + 4 }, (_, k) => 话(k + 2, k % 2 ? "user" : "agent", `垫话 ${k}`)),
    ]
    const { container } = render(
      // 活会话里 id 是实时事件长出来的，与搜索那一侧不同：给一个对不上的 id，只靠 nth
      <ConversationView session={session} items={items} onSend={() => {}} 搜索跳到={{ sessionId: "s1", itemId: "别的id", nth: 1, 词们: ["鲸落"], 起: Date.now() }} />,
    )
    await waitFor(() => expect(container.querySelector('[data-turn-id="r1"]')?.getAttribute("data-search-hit")).toBe("true"))
    expect(container.querySelector('[data-turn-id="r0"]')?.getAttribute("data-search-hit")).not.toBe("true")
  })

  it("别的会话的目标不理", async () => {
    const { container } = render(
      <ConversationView session={session} items={长对话()} onSend={() => {}} 搜索跳到={{ sessionId: "别的", itemId: "r0", nth: 0, 词们: ["鲸落"], 起: Date.now() }} />,
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('[data-turn-id="r0"]')).toBeNull()
  })
})
