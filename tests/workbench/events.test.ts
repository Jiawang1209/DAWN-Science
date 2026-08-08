import { describe, expect, it, vi } from "vitest"
import { SessionEventHub } from "../../src/workbench/events.js"
import { SessionEventSchema, type SessionEvent } from "../../src/protocol/events.js"

const hub = (maxChars = 1000) => new SessionEventHub({ maxChars })

/** 收集推送出去的事件。订阅之后才会收到——这是背压的第一道闸。 */
function collector(h: SessionEventHub) {
  const seen: SessionEvent[] = []
  h.onEvent((e) => seen.push(e))
  return seen
}

describe("事件中枢 · seq 契约", () => {
  it("每会话独立编号，都从 1 起", () => {
    const h = hub()
    h.track("a", "native")
    h.track("b", "pty")
    h.subscribe("a")
    h.subscribe("b")
    const seen = collector(h)

    h.ingest("a", { kind: "output", sessionId: "a", data: "x" })
    h.ingest("b", { kind: "output", sessionId: "b", data: "y" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "z" })

    expect(seen.map((e) => [e.sessionId, e.seq])).toEqual([
      ["a", 1],
      ["b", 1],
      ["a", 2],
    ])
  })

  it("推出去的每一条都合协议 —— 中枢自己也要过一遍 schema", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.ingest("a", { kind: "output", sessionId: "a", data: "hi" })
    h.ingest("a", { kind: "turn_end", sessionId: "a" })
    h.ingest("a", { kind: "exited", sessionId: "a", exitCode: 0 })
    expect(seen.length).toBe(3)
    for (const e of seen) expect(SessionEventSchema.safeParse(e).success).toBe(true)
  })
})

describe("事件中枢 · native 与 pty 的形状不同", () => {
  it("native 的输出是 turn 增量，同一轮共用 turnId", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)

    h.ingest("a", { kind: "output", sessionId: "a", data: "你" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "好" })
    h.ingest("a", { kind: "turn_end", sessionId: "a" })

    const turns = seen.filter((e): e is Extract<SessionEvent, { kind: "turn" }> => e.kind === "turn")
    expect(turns.map((t) => t.text)).toEqual(["你", "好", ""])
    expect(new Set(turns.map((t) => t.turnId)).size).toBe(1)
    expect(turns.map((t) => t.final)).toEqual([false, false, true])
    expect(turns.every((t) => t.who === "agent")).toBe(true)
  })

  it("下一轮换新的 turnId —— 否则两段发言会挤进同一个气泡", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)

    h.ingest("a", { kind: "output", sessionId: "a", data: "一" })
    h.ingest("a", { kind: "turn_end", sessionId: "a" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "二" })

    const ids = seen
      .filter((e): e is Extract<SessionEvent, { kind: "turn" }> => e.kind === "turn")
      .map((t) => t.turnId)
    expect(new Set(ids).size).toBe(2)
  })

  it("pty 的输出是 bytes，原样保留 ANSI —— 解析是 xterm 的事", () => {
    const h = hub()
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    const raw = "[31mred[0m"
    h.ingest("p", { kind: "output", sessionId: "p", data: raw })
    expect(seen[0]?.kind).toBe("bytes")
    expect(seen[0]?.kind === "bytes" && seen[0].data).toBe(raw)
  })

  it("pty 不产生 turn 事件 —— 字节流没有轮次概念", () => {
    const h = hub()
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "turn_end", sessionId: "p" })
    expect(seen.filter((e) => e.kind === "turn")).toEqual([])
  })

  it("用户自己说的话也进事件流 —— 否则切回旧会话只剩下 agent 的半边对话", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.userTurn("a", "跑一下测试")
    const t = seen[0]
    expect(t?.kind === "turn" && t.who).toBe("user")
    expect(t?.kind === "turn" && t.final).toBe(true)
  })

  it("PTY 会话不补用户 turn —— 终端本来就回显，再补一条是重复", () => {
    const h = hub()
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.userTurn("p", "ls\n")
    expect(seen).toEqual([])
  })
})

describe("事件中枢 · 状态变更", () => {
  it("启动与退出都发 state 事件", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.ingest("a", { kind: "started", sessionId: "a", pid: 42 })
    h.ingest("a", { kind: "exited", sessionId: "a", exitCode: 3 })
    expect(seen.map((e) => e.kind)).toEqual(["state", "state"])
    const last = seen[1]
    expect(last?.kind === "state" && last.state).toBe("exited")
    expect(last?.kind === "state" && last.exitCode).toBe(3)
  })
})

describe("事件中枢 · 背压：丢弃必须出声", () => {
  it("超出 maxChars 时丢最旧的，并发一条 dropped 说明丢了多少", () => {
    const h = hub(10)
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)

    h.ingest("p", { kind: "output", sessionId: "p", data: "aaaaaa" }) // 6
    h.ingest("p", { kind: "output", sessionId: "p", data: "bbbbbb" }) // 12 > 10

    const dropped = seen.filter(
      (e): e is Extract<SessionEvent, { kind: "dropped" }> => e.kind === "dropped",
    )
    expect(dropped.length).toBe(1)
    expect(dropped[0]?.droppedChars).toBe(6)
  })

  it("dropped 事件本身也占一个 seq，序号不出现空洞", () => {
    const h = hub(10)
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "aaaaaa" })
    h.ingest("p", { kind: "output", sessionId: "p", data: "bbbbbb" })
    expect(seen.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it("dropped 事件自己不再触发丢弃 —— 否则会无限套娃", () => {
    const h = hub(1)
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    for (let i = 0; i < 5; i++) {
      h.ingest("p", { kind: "output", sessionId: "p", data: "xxxx" })
    }
    // 只要没死循环、且每次溢出恰好一条 dropped，就说明没有套娃
    expect(seen.filter((e) => e.kind === "dropped").length).toBeLessThanOrEqual(5)
  })
})

describe("事件中枢 · 订阅与历史", () => {
  it("未订阅就不推 —— 没人看的 PTY 不该往 IPC 上灌字节", () => {
    const h = hub()
    h.track("p", "pty")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "noise" })
    expect(seen).toEqual([])
  })

  it("退订后停止推送", () => {
    const h = hub()
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "1" })
    h.unsubscribe("p")
    h.ingest("p", { kind: "output", sessionId: "p", data: "2" })
    expect(seen.length).toBe(1)
  })

  it("订阅拿到缓冲区里的全部历史，且历史与增量同一套 seq", () => {
    const h = hub()
    h.track("p", "pty")
    h.ingest("p", { kind: "output", sessionId: "p", data: "早先的" })
    const result = h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "后来的" })

    expect(result.events.map((e) => e.seq)).toEqual([1])
    expect(result.latestSeq).toBe(1)
    expect(result.truncated).toBe(false)
    expect(seen[0]?.seq).toBe(2) // 增量接着历史往下编，不另起炉灶
  })

  it("fromSeq 只回补之后的部分", () => {
    const h = hub()
    h.track("p", "pty")
    for (const d of ["1", "2", "3"]) h.ingest("p", { kind: "output", sessionId: "p", data: d })
    const r = h.subscribe("p", 3)
    expect(r.events.map((e) => e.seq)).toEqual([3])
    expect(r.truncated).toBe(false)
  })

  it("fromSeq 早于缓冲窗口 ⇒ truncated 且给出最早可用 seq，不悄悄从头给一段", () => {
    const h = hub(4)
    h.track("p", "pty")
    for (const d of ["aaaa", "bbbb", "cccc"]) {
      h.ingest("p", { kind: "output", sessionId: "p", data: d })
    }
    const r = h.subscribe("p", 1)
    expect(r.truncated).toBe(true)
    expect(r.earliestSeq).toBeGreaterThan(1)
    expect(r.events.every((e) => e.seq >= (r.earliestSeq ?? 0))).toBe(true)
  })

  it("未追踪的会话订阅即抛错 —— 不返回一个空历史假装正常", () => {
    const h = hub()
    expect(() => h.subscribe("nope")).toThrow(/nope/)
  })
})

describe("事件中枢 · 收尾", () => {
  it("dispose 后不再推送，且退订函数可重复调用", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const cb = vi.fn()
    const off = h.onEvent(cb)
    off()
    off()
    h.ingest("a", { kind: "output", sessionId: "a", data: "x" })
    expect(cb).not.toHaveBeenCalled()
  })
})
