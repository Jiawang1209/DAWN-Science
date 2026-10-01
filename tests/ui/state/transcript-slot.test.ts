/**
 * 转录槽工厂（2026-09-24，侧边对话）。主区一槽、坞里一槽——
 * 要钉的是**两槽互不串**、**攒的逻辑每槽各一份**、快照与清空照旧。
 */
import { describe, it, expect, vi } from "vitest"
import { 创建转录槽, 是回显 } from "../../../src/ui/state/transcript-slot.js"
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
  it("按字段追加到已落地或正攒着的 agent turn，找不到目标就明确失败", () => {
    vi.useFakeTimers()
    const a = 创建转录槽()
    a.upsertItem(说("1", "甲"))
    expect(a.appendItem("1", "text", "乙")).toBe(true)
    expect(a.appendItem("missing", "text", "不该复活")).toBe(false)
    a.upsertItem(说("1", "甲乙丙")) // 已攒着的完整 item 要保留后续 append
    expect(a.appendItem("1", "text", "丁")).toBe(true)
    a.flush()
    expect(a.$items.get()[0]).toMatchObject({ text: "甲乙丙丁", final: false })
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

/**
 * 回显（2026-09-29，A1）：按下发送那一帧先画出这句；真的那条落地时**同一次 set** 里顶掉它。
 * 要钉的是「屏幕上从来没有两条一样的气泡」——每一次 `$items` 变化都数一遍。
 */
describe("回显", () => {
  const 人 = (id: string, text: string) => ({ type: "turn", id, who: "user", text, final: true }) as TranscriptItem
  const 人话数 = (xs: readonly TranscriptItem[]) => xs.filter((x) => x.type === "turn" && x.who === "user").length

  it("按下就有一条带 echo: 前缀的人话", () => {
    const a = 创建转录槽()
    a.回显("你好")
    const xs = a.$items.get()
    expect(xs).toHaveLength(1)
    expect(xs[0]).toMatchObject({ type: "turn", who: "user", text: "你好", final: true })
    expect(是回显(xs[0]!.id)).toBe(true)
  })

  it("真的那条到了：在回显的位置上顶掉它，任何一刻都不出现两条", () => {
    const a = 创建转录槽()
    a.upsertItem(说("a0", "上一轮", true))
    const 见过: number[] = []
    const 退订 = a.$items.listen((xs) => 见过.push(人话数(xs)))
    a.回显("你好")
    a.upsertItem(人("u1", "你好"))
    退订()
    expect(见过).toEqual([1, 1])
    expect(a.$items.get().map((x) => x.id)).toEqual(["a0", "u1"])
  })

  it("别的新条目排在回显前面；随后真的人话仍顶在回显那一格", () => {
    const a = 创建转录槽()
    a.回显("你好")
    a.upsertItem({ type: "notice", id: "n1", text: "已切到方案期" } as TranscriptItem)
    expect(a.$items.get().map((x) => x.id)[0]).toBe("n1")
    a.upsertItem(人("u1", "你好"))
    a.upsertItem(说("a1", "嗨"))
    expect(a.$items.get().map((x) => x.id)).toEqual(["n1", "u1", "a1"])
  })

  it("发送失败：撤掉；真的已经顶掉之后再撤是空操作", () => {
    const a = 创建转录槽()
    const 撤 = a.回显("会失败")
    撤()
    expect(a.$items.get()).toHaveLength(0)
    const 撤2 = a.回显("会成功")
    a.upsertItem(人("u1", "会成功"))
    撤2()
    expect(a.$items.get().map((x) => x.id)).toEqual(["u1"])
  })

  it("快照 / 清空 / 整份替换都把回显冲掉", () => {
    const a = 创建转录槽()
    a.回显("甲")
    a.applySnapshot({ items: [人("u1", "甲")] })
    expect(a.$items.get().map((x) => x.id)).toEqual(["u1"])
    a.回显("乙")
    a.reset()
    expect(a.$items.get()).toHaveLength(0)
  })

  it("那句其实进了待发单（运行时晚一拍还在忙）：回显撤掉，只留待发条上那一份", () => {
    const a = 创建转录槽()
    a.回显("排着的")
    a.setQueued([{ id: "q1", text: "排着的", behavior: "followUp" }])
    expect(a.$items.get()).toHaveLength(0)
  })

  it("两槽互不串：一槽的回显不被另一槽的人话顶掉", () => {
    const a = 创建转录槽(), b = 创建转录槽()
    a.回显("甲")
    b.upsertItem(人("u1", "甲"))
    expect(是回显(a.$items.get()[0]!.id)).toBe(true)
    expect(b.$items.get().map((x) => x.id)).toEqual(["u1"])
  })

  it("空态第一句：带归属的回显，切到那一段时 reset(那一段) 留下它，切到别段清掉", () => {
    const a = 创建转录槽()
    a.回显("第一句", undefined, "s-new")
    a.reset("s-new")
    expect(a.$items.get()).toHaveLength(1)
    expect(是回显(a.$items.get()[0]!.id)).toBe(true)
    // 随后的快照带着真的那条：整份替换，始终一条
    a.applySnapshot({ items: [人("u1", "第一句")] })
    expect(a.$items.get().map((x) => x.id)).toEqual(["u1"])
    a.回显("另一句", undefined, "s-new")
    a.reset("s-other")
    expect(a.$items.get()).toHaveLength(0)
  })

  it("不带归属的回显（普通发送）切会话一律清掉，哪怕 reset 给了 id", () => {
    const a = 创建转录槽()
    a.回显("甲")
    a.reset("s1")
    expect(a.$items.get()).toHaveLength(0)
  })

  it("带图的回显把缩略图一起画", () => {
    const a = 创建转录槽()
    a.回显("", ["data:image/png;base64,AAAA"])
    expect(a.$items.get()[0]).toMatchObject({ images: ["data:image/png;base64,AAAA"] })
  })
})
