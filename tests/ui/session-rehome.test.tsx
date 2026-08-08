/**
 * 切会话是**换个家，不是重启**（Task 3.8 · S5）。
 *
 * Hermes `AGENTS.md`：
 * > *"Changing profile, connection, or mode is a workspace switch, not a cold
 * > start. The shell and whatever the user was doing stay put; only the
 * > gateway-bound view is cleared and repopulated, and **the previous context
 * > must not leak into the next one**."*
 *
 * 最后半句是这份测试的重点。上一个会话的东西**渗进下一个**，比整个重启更糟——
 * 重启至少是可见的，渗漏是隐形的。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import {
  $items,
  applySnapshot,
  resetAllState,
  resetTranscript,
  upsertItem,
} from "../../src/ui/state/index.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session = (id: string, over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: id,
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  state: "alive",
  createdAt: "2026-08-09T00:00:00Z",
  ...over,
})

const turn = (id: string, text: string, final = true): TranscriptItem => ({
  type: "turn",
  id,
  who: "agent",
  text,
  final,
})

beforeEach(resetAllState)

describe("草稿不许渗进另一个会话", () => {
  it("切会话后输入框是空的 —— 上一个会话没说完的话不该跟着走", () => {
    const { rerender } = render(
      <ConversationView session={session("A")} items={[]} onSend={() => {}} />,
    )
    const box = () => screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box(), { target: { value: "这句话是给 A 的" } })
    expect(box().value).toBe("这句话是给 A 的")

    rerender(<ConversationView session={session("B")} items={[]} onSend={() => {}} />)
    // 组件位置没变、实例没卸载，`useState` 的草稿会原样留着——**那就是渗漏**
    expect(box().value, "上一个会话的草稿跟着切过来了").toBe("")
  })

  it("切回来时草稿仍在 —— re-home 不是重启，各自的东西各自留着", () => {
    const { rerender } = render(
      <ConversationView session={session("A")} items={[]} onSend={() => {}} />,
    )
    const box = () => screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box(), { target: { value: "A 的半句话" } })

    rerender(<ConversationView session={session("B")} items={[]} onSend={() => {}} />)
    fireEvent.change(box(), { target: { value: "B 的半句话" } })

    rerender(<ConversationView session={session("A")} items={[]} onSend={() => {}} />)
    expect(box().value).toBe("A 的半句话")
  })

  it("发送后清空的是**当前会话**的草稿", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session("A")} items={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "发出去" } })
    fireEvent.submit(box.form!)
    expect(onSend).toHaveBeenCalledWith("发出去")
    expect(box.value).toBe("")
  })
})

describe("流式输出中途切走再切回", () => {
  it("A 的历史完整，B 的迟到响应没有污染 A", () => {
    // A 正在流式输出，说到一半
    applySnapshot({ items: [turn("a1", "A 说了一半", false)], terminal: "", trimmed: false })
    upsertItem(turn("a1", "A 说完了", true))
    expect($items.get()).toHaveLength(1)

    // 切到 B：清空并作废飞行中的请求
    resetTranscript()
    applySnapshot({ items: [turn("b1", "B 的内容")], terminal: "", trimmed: false })
    expect($items.get().map((i) => i.id)).toEqual(["b1"])

    // 切回 A：后端仍持有 A 的完整 transcript，重取即可
    resetTranscript()
    applySnapshot({ items: [turn("a1", "A 说完了", true)], terminal: "", trimmed: false })

    const ids = $items.get().map((i) => i.id)
    expect(ids).toEqual(["a1"])
    // **B 的内容一条都不许留下**
    expect(ids).not.toContain("b1")
  })

  it("切走时终端字节一并清掉 —— 两个会话的输出混在一起没有任何意义", () => {
    applySnapshot({ items: [], terminal: "A 的输出", trimmed: false })
    resetTranscript()
    applySnapshot({ items: [], terminal: "B 的输出", trimmed: false })
    // 拼接会让人读到一段根本不存在的历史
    expect($items.get()).toHaveLength(0)
  })
})

describe("shell 不被重启", () => {
  it("切会话不重挂对话容器 —— 是同一个 DOM 节点", () => {
    const { container, rerender } = render(
      <ConversationView session={session("A")} items={[]} onSend={() => {}} />,
    )
    const first = container.querySelector(".conversation")
    rerender(<ConversationView session={session("B")} items={[]} onSend={() => {}} />)
    expect(container.querySelector(".conversation")).toBe(first)
  })

  it("会话头部跟着切换的会话走", () => {
    const { rerender } = render(
      <ConversationView session={session("A", { agentId: "claude" })} items={[]} onSend={() => {}} />,
    )
    expect(screen.getByText("claude")).toBeDefined()
    rerender(
      <ConversationView session={session("B", { agentId: "codex" })} items={[]} onSend={() => {}} />,
    )
    expect(screen.getByText("codex")).toBeDefined()
  })
})

describe("act 兼容", () => {
  it("状态写入包在 act 里不报警", async () => {
    await act(async () => {
      resetTranscript()
    })
    expect($items.get()).toEqual([])
  })
})
