import { describe, expect, it } from "vitest"
import {
  SessionEventSchema,
  SubscribeResultSchema,
  type SessionEvent,
} from "../../src/protocol/events.js"
import { OPERATIONS, operationNames } from "../../src/protocol/operations.js"
import { WORKBENCH_PROTOCOL_VERSION, isCompatible } from "../../src/protocol/version.js"

/**
 * 只含信封公共字段。载荷由各用例自己拼——`.strict()` 下多带一个
 * `who: undefined` 也算多余字段，**不能靠覆盖为 undefined 来「去掉」它**。
 * （初稿就是这么写的，两条用例因此假红。）
 */
const head = (over: Record<string, unknown> = {}) => ({
  workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
  sessionId: "s1",
  seq: 1,
  ...over,
})

const turn = (over: Record<string, unknown> = {}) => ({
  ...head(),
  kind: "turn",
  who: "agent",
  text: "在",
  turnId: "t1",
  final: false,
  ...over,
})

const ANSI_RED = "[31mred"

describe("事件信封", () => {
  it("接受一条正常的 turn 事件", () => {
    expect(SessionEventSchema.parse(turn()).kind).toBe("turn")
  })

  it("seq 从 1 起，0 与负数与小数一律拒绝 —— seq 是连续性判断的唯一依据", () => {
    expect(SessionEventSchema.safeParse(turn({ seq: 0 })).success).toBe(false)
    expect(SessionEventSchema.safeParse(turn({ seq: -1 })).success).toBe(false)
    expect(SessionEventSchema.safeParse(turn({ seq: 1.5 })).success).toBe(false)
  })

  it("未知 kind 拒绝，不当作可忽略的扩展放行", () => {
    expect(SessionEventSchema.safeParse(turn({ kind: "whatever" })).success).toBe(false)
  })

  it("多余字段拒绝 —— 信封是契约，不是自由字典", () => {
    expect(SessionEventSchema.safeParse(turn({ extra: 1 })).success).toBe(false)
  })

  it("turn 必须说明是谁在说 —— 分不清人和 agent 的对话没有意义", () => {
    const { who: _drop, ...noWho } = turn()
    expect(SessionEventSchema.safeParse(noWho).success).toBe(false)
  })

  it("turn 必须带 turnId 与 final —— 轮次边界是语义，不能靠正文里的换行去猜", () => {
    const { turnId: _a, ...noId } = turn()
    const { final: _b, ...noFinal } = turn()
    expect(SessionEventSchema.safeParse(noId).success).toBe(false)
    expect(SessionEventSchema.safeParse(noFinal).success).toBe(false)
  })

  it("bytes 事件原样带 ANSI 控制序列 —— 解析是 xterm 的事，协议不插手", () => {
    const e = SessionEventSchema.parse({ ...head(), kind: "bytes", data: ANSI_RED })
    expect(e.kind === "bytes" && e.data).toBe(ANSI_RED)
  })

  it("state 事件带会话状态", () => {
    const e = SessionEventSchema.parse({ ...head(), kind: "state", state: "exited", exitCode: 0 })
    expect(e.kind === "state" && e.state).toBe("exited")
  })
})

describe("dropped 事件 · 丢弃必须说清丢了多少", () => {
  it("dropped 必须带丢弃字符数", () => {
    const base = { ...head(), kind: "dropped" }
    expect(SessionEventSchema.safeParse(base).success).toBe(false)
    expect(SessionEventSchema.safeParse({ ...base, droppedChars: 4096 }).success).toBe(true)
  })

  it("丢弃量必须为正 —— 「丢了 0 个字符」不是丢弃事件，是噪音", () => {
    const base = { ...head(), kind: "dropped", droppedChars: 0 }
    expect(SessionEventSchema.safeParse(base).success).toBe(false)
  })
})

describe("订阅结果 · 截断必须可定位", () => {
  const ok = {
    sessionId: "s1",
    events: [] as SessionEvent[],
    latestSeq: 0,
    truncated: false,
  }

  it("未截断时不需要 earliestSeq", () => {
    expect(SubscribeResultSchema.safeParse(ok).success).toBe(true)
  })

  it("truncated 为真却不给最早可用 seq —— 拒绝", () => {
    // 界面要显示「更早的输出已丢失」，但必须能说清「从哪起还在」。
    // 只说「丢了」而不说「从哪起还有」，等于让界面去猜。
    expect(SubscribeResultSchema.safeParse({ ...ok, truncated: true }).success).toBe(false)
  })

  it("truncated 为真且给了 earliestSeq —— 通过", () => {
    expect(
      SubscribeResultSchema.safeParse({ ...ok, truncated: true, earliestSeq: 120 }).success,
    ).toBe(true)
  })
})

describe("协议操作 · 订阅进入操作清单", () => {
  it("新增 subscribeSession / unsubscribeSession", () => {
    expect(operationNames()).toContain("subscribeSession")
    expect(operationNames()).toContain("unsubscribeSession")
  })

  it("订阅是只读的 —— 它不改变会话，只是开始看", () => {
    expect(OPERATIONS.subscribeSession.mutating).toBe(false)
    expect(OPERATIONS.unsubscribeSession.mutating).toBe(false)
  })

  it("fromSeq 可省略；给了就必须是正整数", () => {
    expect(OPERATIONS.subscribeSession.request.safeParse({ sessionId: "s1" }).success).toBe(true)
    expect(
      OPERATIONS.subscribeSession.request.safeParse({ sessionId: "s1", fromSeq: 0 }).success,
    ).toBe(false)
  })
})

describe("协议版本 · 1.3", () => {
  it("升到 1.3", () => {
    expect(WORKBENCH_PROTOCOL_VERSION).toBe("1.3")
  })

  it("既有兼容规则不变：UI 比服务端新即不兼容", () => {
    expect(isCompatible("1.3", "1.2")).toBe(false)
    expect(isCompatible("1.2", "1.3")).toBe(true)
  })
})
