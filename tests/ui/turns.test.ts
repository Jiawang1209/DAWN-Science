import { describe, expect, it } from "vitest"
import { applyEvent, bytesFromEvents, turnsFromEvents } from "../../src/ui/turns.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"
import type { SessionEvent } from "../../src/protocol/index.js"

let seq = 0
const turn = (text: string, over: Partial<Record<string, unknown>> = {}): SessionEvent =>
  ({
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    sessionId: "s1",
    seq: ++seq,
    kind: "turn",
    who: "agent",
    text,
    turnId: "a1",
    final: false,
    ...over,
  }) as SessionEvent

const bytes = (data: string): SessionEvent =>
  ({
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    sessionId: "s1",
    seq: ++seq,
    kind: "bytes",
    data,
  }) as SessionEvent

const other = (kind: "state" | "dropped"): SessionEvent =>
  ({
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    sessionId: "s1",
    seq: ++seq,
    ...(kind === "state" ? { kind: "state", state: "alive" } : { kind: "dropped", droppedChars: 9 }),
  }) as SessionEvent

describe("事件 → 对话气泡", () => {
  it("同一 turnId 的增量拼成一段", () => {
    const t = turnsFromEvents([turn("你"), turn("好"), turn("", { final: true })])
    expect(t).toHaveLength(1)
    expect(t[0]?.text).toBe("你好")
    expect(t[0]?.final).toBe(true)
  })

  it("不同 turnId 分成两段 —— 否则两轮发言会挤进同一个气泡", () => {
    const t = turnsFromEvents([
      turn("一", { turnId: "a1" }),
      turn("二", { turnId: "a2" }),
    ])
    expect(t.map((x) => x.text)).toEqual(["一", "二"])
  })

  it("人和 agent 分开", () => {
    const t = turnsFromEvents([
      turn("跑测试", { who: "user", turnId: "u1", final: true }),
      turn("好的", { who: "agent", turnId: "a1" }),
    ])
    expect(t.map((x) => x.who)).toEqual(["user", "agent"])
  })

  it("bytes / state / dropped 不产生气泡 —— 它们不是对话", () => {
    expect(turnsFromEvents([bytes("x"), other("state"), other("dropped")])).toEqual([])
  })

  it("增量到达顺序即渲染顺序，不重排", () => {
    const t = turnsFromEvents([turn("A", { turnId: "a1" }), turn("B", { turnId: "a2" }), turn("C", { turnId: "a1" })])
    expect(t.map((x) => x.text)).toEqual(["AC", "B"])
  })
})

describe("增量应用 · 不整份重算", () => {
  it("applyEvent 在已有气泡上追加", () => {
    const first = applyEvent([], turn("你"))
    const second = applyEvent(first, turn("好"))
    expect(second).toHaveLength(1)
    expect(second[0]?.text).toBe("你好")
  })

  it("applyEvent 返回新数组 —— React 靠引用变化判断要不要重绘", () => {
    const before = applyEvent([], turn("你"))
    const after = applyEvent(before, turn("好"))
    expect(after).not.toBe(before)
    expect(after[0]).not.toBe(before[0])
  })

  it("非对话事件原样返回同一个数组 —— 不触发无谓的重绘", () => {
    const before = applyEvent([], turn("你"))
    expect(applyEvent(before, bytes("noise"))).toBe(before)
  })
})

describe("事件 → 终端字节", () => {
  it("按顺序拼接 bytes", () => {
    expect(bytesFromEvents([bytes("a"), bytes("b")])).toEqual(["a", "b"])
  })

  it("turn 事件不进终端 —— native 会话没有字节流", () => {
    expect(bytesFromEvents([turn("你好")])).toEqual([])
  })
})
