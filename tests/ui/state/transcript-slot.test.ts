/**
 * 转录槽工厂（2026-09-24，侧边对话）。主区一槽、坞里一槽——
 * 要钉的是**两槽互不串**、**攒的逻辑每槽各一份**、快照与清空照旧。
 */
import { describe, it, expect, vi } from "vitest"
import { 创建转录槽 } from "../../../src/ui/state/transcript-slot.js"
import type { TranscriptItem } from "../../../src/protocol/index.js"

const 说 = (id: string, text: string, final = false) => ({ type: "turn", id, who: "agent", text, final }) as TranscriptItem

describe("创建转录槽", () => {
  it("两个槽互不串", () => {
    const a = 创建转录槽(), b = 创建转录槽()
    a.upsertItem(说("1", "甲"))
    expect(a.$items.get()).toHaveLength(1)
    expect(b.$items.get()).toHaveLength(0)
  })
  it("说到一半的更新 33ms 攒一次，flush 立刻落", () => {
    vi.useFakeTimers()
    const a = 创建转录槽()
    a.upsertItem(说("1", "甲"))
    a.upsertItem(说("1", "甲乙"))
    expect((a.$items.get()[0] as { text: string }).text).toBe("甲")
    a.flush()
    expect((a.$items.get()[0] as { text: string }).text).toBe("甲乙")
    vi.useRealTimers()
  })
  it("攒的是每槽各一份：一槽 flush 不替另一槽落", () => {
    vi.useFakeTimers()
    const a = 创建转录槽(), b = 创建转录槽()
    a.upsertItem(说("1", "甲"))
    b.upsertItem(说("1", "丙"))
    a.upsertItem(说("1", "甲乙"))
    b.upsertItem(说("1", "丙丁"))
    a.flush()
    expect((a.$items.get()[0] as { text: string }).text).toBe("甲乙")
    expect((b.$items.get()[0] as { text: string }).text).toBe("丙")
    vi.advanceTimersByTime(40)
    expect((b.$items.get()[0] as { text: string }).text).toBe("丙丁")
    vi.useRealTimers()
  })
  it("快照整份换；reset 清空待发与权限", () => {
    const a = 创建转录槽()
    a.applySnapshot({ items: [说("1", "x", true)], queued: [{ id: "q", text: "t", behavior: "followUp" }], pendingPermission: { requestId: "r", title: "?", options: [] } })
    expect(a.$待发.get()).toHaveLength(1)
    expect(a.$待答权限.get()?.requestId).toBe("r")
    a.reset()
    expect(a.$items.get()).toHaveLength(0)
    expect(a.$待发.get()).toHaveLength(0)
    expect(a.$待答权限.get()).toBeUndefined()
  })
})
