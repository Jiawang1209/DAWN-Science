import { describe, expect, it, vi } from "vitest"
import { TerminalStream } from "../../src/session/stream.js"

describe("TerminalStream · scrollback", () => {
  it("保留最近 N 个字符的 scrollback", () => {
    const s = new TerminalStream({ maxChars: 10, flushIntervalMs: 0 })
    s.push("abcdefgh")
    s.push("ijklmn")
    expect(s.snapshot()).toBe("efghijklmn")
    expect(s.snapshot().length).toBe(10)
  })

  it("单块超过上限时也只保留尾部", () => {
    const s = new TerminalStream({ maxChars: 5, flushIntervalMs: 0 })
    s.push("0123456789")
    expect(s.snapshot()).toBe("56789")
  })

  it("按字符计数，多字节字符不会被截半", () => {
    const s = new TerminalStream({ maxChars: 3, flushIntervalMs: 0 })
    s.push("中文测试")
    expect(s.snapshot()).toBe("文测试")
  })
})

describe("TerminalStream · 订阅", () => {
  it("新观察者立即拿到 scrollback 快照", () => {
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 0 })
    s.push("history")
    const seen: string[] = []
    s.subscribe((chunk) => seen.push(chunk))
    expect(seen).toEqual(["history"])
  })

  it("scrollback 为空时不投递空块", () => {
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 0 })
    const seen: string[] = []
    s.subscribe((c) => seen.push(c))
    expect(seen).toEqual([])
  })

  it("多观察者都收到后续数据", () => {
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 0 })
    const a: string[] = []
    const b: string[] = []
    s.subscribe((c) => a.push(c))
    s.subscribe((c) => b.push(c))
    s.push("x")
    expect(a).toEqual(["x"])
    expect(b).toEqual(["x"])
  })

  it("退订后不再收到数据", () => {
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 0 })
    const seen: string[] = []
    const off = s.subscribe((c) => seen.push(c))
    off()
    s.push("x")
    expect(seen).toEqual([])
  })

  it("观察者在回调里退订不会打乱本次投递", () => {
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 0 })
    const a: string[] = []
    const b: string[] = []
    const offA = s.subscribe((c) => {
      a.push(c)
      offA()
    })
    s.subscribe((c) => b.push(c))
    s.push("x")
    expect(a).toEqual(["x"])
    expect(b).toEqual(["x"]) // 第二个观察者必须照常收到
  })
})

describe("TerminalStream · 节流", () => {
  it("开启节流时，间隔内的多次 push 合并为一次投递", () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 16 })
    const seen: string[] = []
    s.subscribe((c) => seen.push(c))
    s.push("a")
    s.push("b")
    s.push("c")
    expect(seen).toEqual([]) // 尚未到期，未投递
    vi.advanceTimersByTime(16)
    expect(seen).toEqual(["abc"]) // 合并为一次
    vi.useRealTimers()
  })

  it("节流下 scrollback 仍然即时更新", () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 16 })
    s.push("abc")
    expect(s.snapshot()).toBe("abc")
    vi.useRealTimers()
  })

  it("在 pending 未投递时订阅，新观察者不会收到重复数据", () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 16 })
    s.push("abc") // 进了 buffer，但还没投递
    const seen: string[] = []
    s.subscribe((c) => seen.push(c))
    vi.advanceTimersByTime(16)
    expect(seen.join("")).toBe("abc") // 恰好一份，不是 "abcabc"
    vi.useRealTimers()
  })

  it("订阅会先冲掉 pending，既有观察者不会因此丢数据", () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 16 })
    const first: string[] = []
    s.subscribe((c) => first.push(c))
    s.push("abc")
    s.subscribe(() => {}) // 触发提前冲刷
    vi.advanceTimersByTime(16)
    expect(first.join("")).toBe("abc")
    vi.useRealTimers()
  })

  it("dispose 后定时器被清理，不再投递", () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxChars: 100, flushIntervalMs: 16 })
    const seen: string[] = []
    s.subscribe((c) => seen.push(c))
    s.push("a")
    s.dispose()
    vi.advanceTimersByTime(100)
    expect(seen).toEqual([])
    vi.useRealTimers()
  })
})
