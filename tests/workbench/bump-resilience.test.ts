/**
 * 一条畸形更新不该掐死整条事件流（2026-08-10）。
 *
 * ## 它是怎么被发现的
 *
 * 给回合接 token 用量时，`e2e/session-switch.spec.ts` 的「切会话不丢历史」
 * **确定性变红**，症状是**回复再也不出现**——看起来与用量毫无关系。
 *
 * 二分下来：协议里 `usage` 是 `.strict()` 的，而 pi 给的对象还带着
 * `cacheWrite` / `reasoning` / `totalTokens` / `cost`。原样转发让
 * `SessionUpdateSchema.parse` 抛出，**而 `bump` 是被 runtime 的事件回调
 * 同步调到的——那一抛顺着 `emit` 窜回 pi 的事件循环，把后面的文本增量全掐掉。**
 *
 * 真正的修复是「只发我们声明过的字段」。这份测试守的是第二道：
 * **即使又有人塞进一个不合协议的字段，也只该丢掉那一条，不该掀翻整个会话。**
 */
import { describe, expect, it, vi } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"

describe("畸形更新", () => {
  it("**不把异常抛回调用方** —— 抛出去会窜回 runtime 的事件循环", () => {
    const t = new SessionTranscripts({ terminalMaxChars: 1000 })
    t.track("s1", "native")
    t.subscribe("s1")

    // 一条字段不合协议的用量（多出 pi 的那几个键）
    const 坏事件 = {
      kind: "turn_usage" as const,
      sessionId: "s1",
      usage: { input: 1, output: 2, totalTokens: 3, cost: { input: 0 } } as never,
    }
    // **先造一条 agent 发言**：用量要落在它上面，没有它连校验都走不到
    t.ingest("s1", { kind: "output", sessionId: "s1", data: "回复的一部分" })
    expect(() => t.ingest("s1", 坏事件)).not.toThrow()
    t.dispose()
  })

  it("**丢掉了要出声**，不静静吞掉（规格 7.5）", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const t = new SessionTranscripts({ terminalMaxChars: 1000 })
    t.track("s1", "native")
    t.subscribe("s1")
    t.ingest("s1", { kind: "output", sessionId: "s1", data: "回复的一部分" })
    t.ingest("s1", {
      kind: "turn_usage" as const,
      sessionId: "s1",
      usage: { input: 1, 乱七八糟: true } as never,
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    t.dispose()
  })

  it("**坏的那条之后，好的还能继续流** —— 这正是回归里丢掉的东西", () => {
    const t = new SessionTranscripts({ terminalMaxChars: 1000 })
    t.track("s1", "native")
    t.subscribe("s1")
    const 收到: unknown[] = []
    t.onUpdate((u) => 收到.push(u))

    t.ingest("s1", { kind: "output", sessionId: "s1", data: "回复的一部分" })
    const 坏 = 收到.length
    t.ingest("s1", {
      kind: "turn_usage" as const,
      sessionId: "s1",
      usage: { 不认识: 1 } as never,
    })
    t.userTurn("s1", "第二句")
    // 坏的那条没推出去，但后面那条推出去了
    expect(收到.length).toBe(坏 + 1)
    t.dispose()
  })
})
