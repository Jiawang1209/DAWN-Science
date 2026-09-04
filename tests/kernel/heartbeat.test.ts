/**
 * 心跳状态机（远端内核猝死察觉，2026-09-04，规格定案 1/2）。
 * ping 与时钟都注入：这里不碰 zmq，只验「什么时候 ping、沉默之后做什么」。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { 起心跳, type 心跳 } from "../../src/kernel/heartbeat.js"

/** 当前用例起的那颗心：断言半路红了也要停掉它、还回真时钟，别把下一条用例拖下水 */
let 心: 心跳 | undefined

afterEach(() => {
  心?.停()
  心 = undefined
  vi.useRealTimers()
})

function 造(o: { ping: () => Promise<boolean>; 忙着?: () => boolean; 沉默: () => Promise<"活着" | "死了" | "不知道"> }) {
  vi.useFakeTimers()
  心 = 起心跳({
    ping: o.ping,
    忙着: o.忙着 ?? (() => false),
    沉默: o.沉默,
    空闲间隔ms: 10_000,
    忙时间隔ms: 60_000,
    确认最小间隔ms: 60_000,
  })
  return 心
}

describe("心跳 · 间隔", () => {
  it("空闲每 10 秒 ping 一次；忙着每 60 秒一次", async () => {
    const ping = vi.fn(async () => true)
    let 忙 = false
    造({ ping, 忙着: () => 忙, 沉默: async () => "活着" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ping).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ping).toHaveBeenCalledTimes(2)
    忙 = true
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ping).toHaveBeenCalledTimes(2) // 忙着：第三次要等到 60 秒
    await vi.advanceTimersByTimeAsync(50_000)
    expect(ping).toHaveBeenCalledTimes(3)
  })
})

describe("心跳 · 沉默", () => {
  it("没回音 → 调一次确认；确认「活着」→ 不判死，继续 ping", async () => {
    const 沉默 = vi.fn(async () => "活着" as const)
    const 心 = 造({ ping: async () => false, 沉默 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(沉默).toHaveBeenCalledTimes(1)
    expect(心.沉默过几次()).toBe(1)
    // 确认过一次之后 60 秒内再沉默不重复确认（定案 2：确认最多每 60 秒一次）
    await vi.advanceTimersByTimeAsync(10_000)
    expect(沉默).toHaveBeenCalledTimes(1)
    expect(心.沉默过几次()).toBe(2)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(沉默).toHaveBeenCalledTimes(2)
    expect(心.停了()).toBe(false)
  })

  it("确认「死了」→ 停下，不再 ping", async () => {
    const ping = vi.fn(async () => false)
    const 心 = 造({ ping, 沉默: async () => "死了" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(心.停了()).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it("确认「不知道」（链路不通）→ 不判死、不停，下次再说", async () => {
    const 心 = 造({ ping: async () => false, 沉默: async () => "不知道" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(心.停了()).toBe(false)
  })

  it("停了之后 ping 的回音再晚到也不做任何事", async () => {
    let 放行: (v: boolean) => void = () => {}
    const 沉默 = vi.fn(async () => "死了" as const)
    const 心 = 造({ ping: () => new Promise<boolean>((r) => (放行 = r)), 沉默 })
    await vi.advanceTimersByTimeAsync(10_000)
    心.停()
    放行(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(沉默).not.toHaveBeenCalled()
  })

  it("停了之后确认的结论再晚到也不做任何事", async () => {
    let 放行: (v: "活着" | "死了" | "不知道") => void = () => {}
    const ping = vi.fn(async () => false)
    const 沉默 = vi.fn(() => new Promise<"活着" | "死了" | "不知道">((r) => (放行 = r)))
    const 心 = 造({ ping, 沉默 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(沉默).toHaveBeenCalledTimes(1)
    心.停()
    放行("死了")
    await vi.advanceTimersByTimeAsync(60_000)
    expect(心.停了()).toBe(true)
    expect(ping).toHaveBeenCalledTimes(1) // 没再排下一次
    expect(沉默).toHaveBeenCalledTimes(1)
  })
})
