/**
 * 「回到这句之前」那颗按钮（2026-09-27，spec §2.1）。
 *
 * **常驻、带字**：悬停才出现的等于不存在，只画一个箭头又会被读成「没有这个功能」。
 * 「常驻」量的是真样式表下的 `opacity`——jsdom 不加载 `styles.css`，在这里量永远是 1、什么也证明不了，
 * 所以那一半交给 e2e（真构建产物里 `getComputedStyle`）。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1", projectId: "p1", agentId: "ds-chat", kind: "native", pinned: false, sortOrder: 1, state: "alive", createdAt: "2026-08-08T00:00:00Z",
}
const 用户 = (id: string, text: string) => ({ type: "turn", id, who: "user", text, final: true }) as TranscriptItem
const agent = (id: string, final = true) => ({ type: "turn", id, who: "agent", text: "好的", final }) as TranscriptItem

describe("「回到这句之前」（spec §2.1）", () => {
  it("给了 onRewind：每句自己说的话下面都有、带字；agent 的话下面没有；点了带回那条 id", () => {
    const onRewind = vi.fn()
    // 以 agent 说完收尾：最后一条是自己的话时界面在「等回话」，那是忙着（见下一条）
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1"), 用户("u2", "二"), agent("a2")]} onSend={() => {}} onRewind={onRewind} />)
    const 们 = screen.getAllByRole("button", { name: "回到这句之前" })
    expect(们).toHaveLength(2)
    // 带字：文字本身在按钮里，不是只有 aria-label
    expect(们[0]!.textContent).toContain("回到这句之前")
    fireEvent.click(们[1]!)
    expect(onRewind).toHaveBeenCalledWith("u2")
  })
  it("不给 onRewind：一颗都不画", () => {
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1")]} onSend={() => {}} />)
    expect(screen.queryByRole("button", { name: "回到这句之前" })).toBeNull()
  })
  it("agent 还在说：灰着，理由读屏读得到（aria-description，名字不变）；点了不回调", () => {
    const onRewind = vi.fn()
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1", false)]} onSend={() => {}} onRewind={onRewind} />)
    const 它 = screen.getByRole("button", { name: "回到这句之前" }) as HTMLButtonElement
    expect(它.disabled).toBe(true)
    expect(它.getAttribute("aria-description")).toBe("agent 还在跑，停下之后才能回退")
    fireEvent.click(它)
    expect(onRewind).not.toHaveBeenCalled()
  })
  it("刚发出去、还没回音（等回话）也算忙：灰着", () => {
    render(<ConversationView session={session} items={[用户("u1", "一")]} onSend={() => {}} onRewind={() => {}} />)
    expect((screen.getByRole("button", { name: "回到这句之前" }) as HTMLButtonElement).disabled).toBe(true)
  })
  it("正在压缩上下文也算忙：灰着（与停止键同一个判据）", () => {
    const 压缩 = { type: "compaction", id: "c1", status: "running" } as TranscriptItem
    const onRewind = vi.fn()
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1"), 压缩]} onSend={() => {}} onRewind={onRewind} />)
    const 它 = screen.getByRole("button", { name: "回到这句之前" }) as HTMLButtonElement
    expect(它.disabled).toBe(true)
    expect(它.getAttribute("aria-description")).toBe("agent 还在跑，停下之后才能回退")
    fireEvent.click(它)
    expect(onRewind).not.toHaveBeenCalled()
  })
  it("这段正在回退：灰着，理由是「正在回退，等它做完」；名字不变", () => {
    const onRewind = vi.fn()
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1")]} onSend={() => {}} onRewind={onRewind} rewinding />)
    const 它 = screen.getByRole("button", { name: "回到这句之前" }) as HTMLButtonElement
    expect(它.disabled).toBe(true)
    expect(它.getAttribute("aria-description")).toBe("正在回退，等它做完")
    fireEvent.click(它)
    expect(onRewind).not.toHaveBeenCalled()
  })
  it("会话已退出（disabled）：不画", () => {
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1")]} onSend={() => {}} onRewind={() => {}} disabled />)
    expect(screen.queryByRole("button", { name: "回到这句之前" })).toBeNull()
  })
})
