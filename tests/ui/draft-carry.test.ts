/**
 * 建会话期间打的字跟着谁走（2026-08-10）。
 *
 * **这是一个竞态，但规则是确定的。** 用 e2e 去撞那个窗口只会得到一条不稳的
 * 用例（`window.dawn` 是 contextBridge 暴露的，测试里也拦不住它），
 * 所以把判断抽成纯函数，在这里逐条钉死。
 */
import { describe, expect, it } from "vitest"
import { carryDraft } from "../../src/ui/state/view.js"

describe("草稿的去向", () => {
  it("**按下之后新打的，跟着新会话走** —— 否则它落进人已经不看的那个会话", () => {
    const r = carryDraft("A", "", "这句是给新会话的", "B")
    expect(r).toEqual({ moveTo: "B", text: "这句是给新会话的", restoreTo: "A", restored: "" })
  })

  it("**按下之前写了一半的，仍归旧会话** —— 那正是草稿分家要保的东西", () => {
    const r = carryDraft("A", "A 的半句话", "A 的半句话这句是新打的", "B")
    expect(r!.moveTo).toBe("B")
    expect(r!.text).toBe("A 的半句话这句是新打的")
    // 旧会话恢复成按下那一刻的样子，而不是被清空
    expect(r!.restoreTo).toBe("A")
    expect(r!.restored).toBe("A 的半句话")
  })

  it("这段时间里什么都没打 ⇒ **什么都不动**", () => {
    expect(carryDraft("A", "原样", "原样", "B")).toBeUndefined()
    expect(carryDraft("A", "", "", "B")).toBeUndefined()
  })

  it("本来就没有会话（第一个会话）⇒ 没有来源，什么都不动", () => {
    expect(carryDraft(undefined, "", "随便", "B")).toBeUndefined()
  })

  it("**新旧是同一个会话 ⇒ 不搬** —— 搬了会把快照倒灌回去，等于吞掉刚打的字", () => {
    expect(carryDraft("A", "旧的", "刚打的", "A")).toBeUndefined()
  })

  it("把字删光也算「变了」—— 人清空了输入框，那个意图同样该跟过去", () => {
    const r = carryDraft("A", "本来有字", "", "B")
    expect(r).toEqual({ moveTo: "B", text: "", restoreTo: "A", restored: "本来有字" })
  })
})
