import { describe, it, expect } from "vitest"
import { 侧边对照, 主对话摘要 } from "../../src/workbench/side-session.js"
import type { TranscriptItem, QueuedMessage } from "../../src/protocol/index.js"

describe("侧边对照", () => {
  it("设一对、查得到；换主区只改主；拿下后查不到", () => {
    const t = new 侧边对照()
    expect(t.设({ side: "s", main: "m1" })).toEqual({ 进: "s", 出: undefined })
    expect(t.主对话of("s")).toBe("m1")
    expect(t.设({ side: "s", main: "m2" })).toEqual({ 进: undefined, 出: undefined })
    expect(t.主对话of("s")).toBe("m2")
    expect(t.设({ side: undefined, main: "m2" })).toEqual({ 进: undefined, 出: "s" })
    expect(t.主对话of("s")).toBeUndefined()
  })
  it("换一段侧边：旧的出、新的进", () => {
    const t = new 侧边对照()
    t.设({ side: "a", main: "m" })
    expect(t.设({ side: "b", main: "m" })).toEqual({ 进: "b", 出: "a" })
  })
  it("侧边与主是同一段 → 当作没有侧边（同一段只在一处）", () => {
    const t = new 侧边对照()
    t.设({ side: "a", main: "m" })
    expect(t.设({ side: "m", main: "m" })).toEqual({ 进: undefined, 出: "a" })
    expect(t.主对话of("m")).toBeUndefined()
  })
  it("会话没了：它是侧边就出；它是主就只清主", () => {
    const t = new 侧边对照()
    t.设({ side: "s", main: "m" })
    expect(t.忘掉("m")).toEqual({ 出: undefined })
    expect(t.主对话of("s")).toBeUndefined()
    expect(t.当前侧边()).toBe("s")
    expect(t.忘掉("s")).toEqual({ 出: "s" })
    expect(t.当前侧边()).toBeUndefined()
  })

  it("当前主()：报了主区就记着；主区那段没了清掉（桌面通知判「在屏上」用，2026-09-27）", () => {
    const d = new 侧边对照()
    d.设({ side: undefined, main: "m" })
    expect(d.当前主()).toBe("m")
    d.忘掉("m")
    expect(d.当前主()).toBeUndefined()
  })
})

const 说 = (id: string, who: "user" | "agent", text: string, final = true): TranscriptItem =>
  ({ type: "turn", id, who, text, final }) as TranscriptItem

describe("主对话摘要", () => {
  it("最近几轮问与答、正在跑的工具与时长、待发、产出", () => {
    const items: TranscriptItem[] = [
      说("u1", "user", "清洗数据"),
      说("a1", "agent", "好的，先看目录"),
      { type: "tool", id: "t1", name: "bash", input: { command: "python clean.py" }, status: "running", startedAt: 1_000 } as TranscriptItem,
    ]
    const queued: QueuedMessage[] = [{ id: "q1", text: "顺便画个图", behavior: "followUp" }]
    const s = 主对话摘要({ title: "清洗", items, queued, 产出: ["data/clean.csv"], 现在: 61_000 })
    expect(s).toContain("清洗")
    expect(s).toContain("你：清洗数据")
    expect(s).toContain("agent：好的，先看目录")
    expect(s).toContain("正在跑：bash")
    expect(s).toContain("60 秒")
    expect(s).toContain("顺便画个图")
    expect(s).toContain("data/clean.csv")
  })
  it("没在跑就说没在跑；说到一半的标出来", () => {
    const s = 主对话摘要({ items: [说("u1", "user", "hi"), 说("a1", "agent", "正在想", false)], queued: [], 产出: [], 现在: 0 })
    expect(s).toContain("没有工具在跑")
    expect(s).toContain("（还在说）")
  })
  it("截断要出声：轮数与字数", () => {
    const items: TranscriptItem[] = []
    for (let i = 0; i < 20; i++) items.push(说(`u${i}`, "user", `第${i}问`), 说(`a${i}`, "agent", "长".repeat(2000)))
    const s = 主对话摘要({ items, queued: [], 产出: [], 现在: 0 })
    expect(s).toContain("更早的 14 轮没有列出")
    expect(s).toMatch(/省了 \d+ 字/)
    expect(s).not.toContain("第0问")
  })
  it("产出最多列 30 个，多的说清省了几个；没记下的次数单独一行", () => {
    const 产出 = Array.from({ length: 35 }, (_, i) => `out/f${i}.csv`)
    const s = 主对话摘要({ items: [], queued: [], 产出, 未记录: 2, 现在: 0 })
    expect(s).toContain("out/f29.csv")
    expect(s).not.toContain("out/f30.csv")
    expect(s).toContain("（另有 5 个没有列出）")
    expect(s).toContain("另有 2 次工具调用没有记下它写了哪些文件")
    const 少 = 主对话摘要({ items: [], queued: [], 产出: ["a.csv"], 未记录: 0, 现在: 0 })
    expect(少).not.toContain("没有列出")
    expect(少).not.toContain("没有记下")
  })
  it("空转录如实说", () => {
    expect(主对话摘要({ items: [], queued: [], 产出: [], 现在: 0 })).toContain("主对话还没有任何发言")
  })
})
