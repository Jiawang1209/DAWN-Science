/**
 * 「回到这句之前」那颗按钮（2026-09-27，spec §2.1）。
 *
 * **常驻、带字**：悬停才出现的等于不存在（`opacity` 用 `getComputedStyle` 量，`toBeVisible()` 对 `opacity: 0` 仍算可见），
 * 只画一个箭头又会被读成「没有这个功能」。
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
    // 常驻：不靠悬停才显形
    expect(Number(getComputedStyle(们[0]!).opacity || "1")).toBe(1)
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
  it("会话已退出（disabled）：不画", () => {
    render(<ConversationView session={session} items={[用户("u1", "一"), agent("a1")]} onSend={() => {}} onRewind={() => {}} disabled />)
    expect(screen.queryByRole("button", { name: "回到这句之前" })).toBeNull()
  })
})
