/**
 * token 数怎么写（2026-08-11）。
 *
 * 作者：*「token 的消耗，变换一下单位 k tokens，这样方便统计和查看。」*
 * 这条**推翻了我之前写下的**「不缩写成 1.2k」——见 `src/ui/format.ts` 的说明。
 */
import { describe, expect, it } from "vitest"
import { formatDuration, formatTokens } from "../../src/ui/format.js"

describe("token 数", () => {
  it("**1000 以下原样** —— 写成 0.1k 是把已知的精度扔掉", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(96)).toBe("96")
    expect(formatTokens(999)).toBe("999")
  })

  it("1000 起用 k", () => {
    expect(formatTokens(1000)).toBe("1k")
    expect(formatTokens(12_345)).toBe("12.3k")
    expect(formatTokens(128_000)).toBe("128k")
  })

  it("**整千不拖一个没有信息量的小数点**", () => {
    expect(formatTokens(12_000)).toBe("12k")
  })

  it("一百万起用 M", () => {
    expect(formatTokens(1_250_000)).toBe("1.25M")
  })

  it("**分得开才算数**：12.3k 与 12.4k 不能都写成 12k", () => {
    expect(formatTokens(12_300)).not.toBe(formatTokens(12_400))
  })

  it("拿不到数时不编一个", () => {
    expect(formatTokens(Number.NaN)).toBe("—")
  })
})

/**
 * 时长。**它存在的理由是「不设默认超时」**——
 * 没有这个数，「还在跑」与「卡死了」在界面上长得一模一样。
 */
describe("时长", () => {
  it("十秒以内留一位小数 —— 两次运行的差别看得见", () => {
    expect(formatDuration(400)).toBe("0.4 秒")
    expect(formatDuration(8200)).toBe("8.2 秒")
    expect(formatDuration(3000)).toBe("3 秒")
  })

  it("一分钟以内取整秒", () => {
    expect(formatDuration(42_600)).toBe("42 秒")
  })

  it("**秒补零** —— `3 分 5 秒` 与 `3 分 50 秒` 一扫而过太像", () => {
    expect(formatDuration(185_000)).toBe("3 分 05 秒")
    expect(formatDuration(230_000)).toBe("3 分 50 秒")
  })

  it("一小时以上给小时", () => {
    expect(formatDuration(4_320_000)).toBe("1 小时 12 分")
  })

  it("算不出来就说算不出来，不给一个 0", () => {
    expect(formatDuration(Number.NaN)).toBe("—")
    expect(formatDuration(-1)).toBe("—")
  })
})
