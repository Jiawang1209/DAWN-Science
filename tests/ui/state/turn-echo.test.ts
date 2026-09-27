/**
 * 「正在等回话」什么时候收（`有回音了`，2026-09-28 回归）。
 *
 * 没配 key 时 native 的 `prompt()` 直接 reject：这一轮只有一句带 `failed` 的 notice，没有 agent 发言。
 * 它不算回音的话「在等」永远不收——停止键不消失、模型菜单锁在「这一轮还没说完」（`e2e/turn-closes-on-failure.spec.ts`）。
 */
import { describe, it, expect } from "vitest"
import { 有回音了, 在压缩 } from "../../../src/ui/state/transcript.js"
import type { TranscriptItem } from "../../../src/protocol/index.js"

const 人 = { type: "turn", id: "u1", who: "user", text: "你好", final: true } as TranscriptItem

describe("有回音了", () => {
  it("只有人那句：还在等", () => {
    expect(有回音了([人], 0)).toBe(false)
  })
  it("这一轮没做成的那句报错（failed notice）算回音——一轮只以它收尾时「在等」要收", () => {
    const items = [人, { type: "notice", id: "n1", text: "[native runtime 错误] No API key", failed: true }] as TranscriptItem[]
    expect(有回音了(items, 0)).toBe(true)
    // 它也不开一条「在跑」的 agent 发言：压缩判据与 agent 未收尾判据都为假
    expect(items.some((i) => i.type === "turn" && i.who === "agent" && !i.final) || 在压缩(items)).toBe(false)
  })
  it("普通系统提示不算——它是过程，不是这一轮的结果", () => {
    const items = [人, { type: "notice", id: "n1", text: "已归入项目 ~/x" }] as TranscriptItem[]
    expect(有回音了(items, 0)).toBe(false)
  })
  it("agent 说出了字算；只有思考不算", () => {
    const 想 = { type: "turn", id: "a1", who: "agent", text: "", thinking: "嗯", final: false } as TranscriptItem
    const 说 = { type: "turn", id: "a1", who: "agent", text: "你好", final: false } as TranscriptItem
    expect(有回音了([人, 想], 0)).toBe(false)
    expect(有回音了([人, 说], 0)).toBe(true)
  })
  it("只看 `从` 之后：更早那一轮的报错不替这一轮收", () => {
    const items = [{ type: "notice", id: "n0", text: "旧的报错", failed: true }, 人] as TranscriptItem[]
    expect(有回音了(items, 1)).toBe(false)
  })
})
