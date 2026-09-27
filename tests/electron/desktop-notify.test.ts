/**
 * 桌面通知的出口（2026-09-27）。真出口用一个假的 `Notification` 类验：Windows 闪、macOS/Linux 数字、
 * `failed` 出声、活着的通知有人拿着（被回收之后 click 就不来了）；假出口验记录、点、前台。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { 真通知出口, 假通知出口, 待回的段, 译 } from "../../src/electron/desktop-notify.js"

class 假Notification {
  static 支持 = true
  static 造过: 假Notification[] = []
  static isSupported() {
    return 假Notification.支持
  }
  readonly 听: Record<string, ((...a: unknown[]) => void)[]> = {}
  显示了 = false
  constructor(readonly o: { title: string; body: string }) {
    假Notification.造过.push(this)
  }
  // `never[]`：真出口按事件给回调标了不同的参数（`failed` 的第二个是 string），这里只管收下
  on(ev: string, cb: (...a: never[]) => void) {
    ;(this.听[ev] ??= []).push(cb as (...a: unknown[]) => void)
    return this
  }
  show() {
    this.显示了 = true
  }
  发(ev: string, ...a: unknown[]) {
    for (const f of this.听[ev] ?? []) f(...a)
  }
}

function 造(平台: string) {
  const 窗 = { 闪: [] as boolean[], 聚焦: false, isDestroyed: () => false, isFocused: () => 窗.聚焦, flashFrame: (b: boolean) => void 窗.闪.push(b) }
  const app = { 数: [] as number[], 听: [] as (() => void)[], setBadgeCount: (n: number) => (app.数.push(n), true), on: (_: string, cb: () => void) => void app.听.push(cb), off: () => {} }
  const 点了 = vi.fn()
  const log = vi.fn()
  const 出口 = 真通知出口({ Notification: 假Notification, app, 窗口: () => 窗, 平台, 缺省语言: () => "zh", 点了, log })
  return { 出口, 窗, app, 点了, log }
}

afterEach(() => {
  假Notification.造过 = []
  假Notification.支持 = true
})

describe("译", () => {
  it("zh 原样替换；en 查表，查不到原样；{0} 透传", () => {
    expect(译({ msgid: "「{0}」做完了", args: ["画图"] }, "zh")).toBe("「画图」做完了")
    expect(译({ msgid: "「{0}」做完了", args: ["画图"] }, "en")).toBe("“画图” is done")
    expect(译({ msgid: "{0}", args: ["原话"] }, "en")).toBe("原话")
  })
})

describe("真出口", () => {
  it("弹：按语言译好标题正文、show；点它 → 点了(那段)", () => {
    const c = 造("darwin")
    c.出口.弹({ kind: "done", sessionId: "s1", title: { msgid: "「{0}」做完了", args: ["画图"] }, body: { msgid: "{0}", args: ["好了"] }, lang: "en" })
    const n = 假Notification.造过[0]!
    expect(n.o).toEqual({ title: "“画图” is done", body: "好了" })
    expect(n.显示了).toBe(true)
    n.发("click")
    expect(c.点了).toHaveBeenCalledWith("s1")
  })
  it("没给 lang → 用缺省语言", () => {
    const c = 造("darwin")
    c.出口.弹({ kind: "test", title: { msgid: "桌面通知是通的", args: [] }, body: { msgid: "点这一条会回到 DAWN。", args: [] } })
    expect(假Notification.造过[0]!.o.title).toBe("桌面通知是通的")
  })
  it("系统不支持：不造、出声；支持() 如实", () => {
    假Notification.支持 = false
    const c = 造("linux")
    expect(c.出口.支持()).toBe(false)
    c.出口.弹({ kind: "test", title: { msgid: "x", args: [] }, body: { msgid: "y", args: [] } })
    expect(假Notification.造过).toEqual([])
    expect(c.log).toHaveBeenCalled()
  })
  it("failed（Windows 上 toast 没出来）→ 出声", () => {
    const c = 造("win32")
    c.出口.弹({ kind: "test", title: { msgid: "x", args: [] }, body: { msgid: "y", args: [] } })
    假Notification.造过[0]!.发("failed", {}, "no AUMID")
    expect(c.log.mock.calls.flat().join("")).toContain("no AUMID")
  })
  it("macOS / Linux：角标 = 数字", () => {
    const c = 造("darwin")
    c.出口.角标(2)
    c.出口.角标(0)
    expect(c.app.数).toEqual([2, 0])
    expect(c.窗.闪).toEqual([])
  })
  it("Windows：没有数字，窗口不在前台时闪，清零停；回到前台也停", () => {
    const c = 造("win32")
    c.出口.角标(1)
    c.出口.角标(0)
    expect(c.窗.闪).toEqual([true, false])
    expect(c.app.数).toEqual([])
    const 回 = vi.fn()
    c.出口.前台变了(回)
    c.app.听[0]!()
    expect(c.窗.闪.at(-1)).toBe(false)
    expect(回).toHaveBeenCalled()
  })
})

describe("假出口（DAWN_FAKE_NOTIFY=1，e2e 与 dev:mock 共用）", () => {
  it("记进 globalThis.__dawn桌面通知；点(i) 走同一个 点了；设前台 叫回到前台的人", () => {
    const 点了 = vi.fn()
    const 出口 = 假通知出口({ 点了 })
    const 台 = (globalThis as unknown as { __dawn桌面通知: { 发过: unknown[]; 角标: number; 点(i: number): void; 设前台(v?: boolean): void } }).__dawn桌面通知
    出口.弹({ kind: "done", sessionId: "s1", title: { msgid: "「{0}」做完了", args: ["画图"] }, body: { msgid: "{0}", args: ["好了"] } })
    出口.角标(1)
    expect(台.发过).toEqual([{ kind: "done", sessionId: "s1", title: "「画图」做完了", body: "好了" }])
    expect(台.角标).toBe(1)
    台.点(0)
    expect(点了).toHaveBeenCalledWith("s1")
    expect(() => 台.点(5)).toThrow(/没有第 5 条/)
    const 回 = vi.fn()
    出口.前台变了(回)
    expect(出口.前台()).toBeUndefined()
    台.设前台(true)
    expect(出口.前台()).toBe(true)
    expect(回).toHaveBeenCalledTimes(1)
    台.设前台(undefined)
    expect(出口.前台(), "undefined = 交还给真窗口去判").toBeUndefined()
  })
})

describe("待回的段（2026-09-28：点通知时窗口没有 / 界面没在听，推送会丢，界面起来后来拉）", () => {
  it("读了就清；只留最后点的那段；没带会话的那一下不动它", () => {
    const 段 = 待回的段()
    expect(段.取()).toBeUndefined()
    段.记("s1")
    段.记("s2")
    段.记(undefined)
    expect(段.取()).toBe("s2")
    expect(段.取(), "取走即清：推醒来拉一次、启动再拉一次，不会各切一次").toBeUndefined()
  })
  it("假出口的「点」走同一个 `点了`——e2e / dev:mock 里点一下也会记下", () => {
    const 段 = 待回的段()
    const 出口 = 假通知出口({ 点了: (id) => 段.记(id) })
    出口.弹({ kind: "done", sessionId: "s9", title: { msgid: "t", args: [] }, body: { msgid: "b", args: [] } })
    ;(globalThis as unknown as { __dawn桌面通知: { 点(i: number): void } }).__dawn桌面通知.点(0)
    expect(段.取()).toBe("s9")
  })
})
