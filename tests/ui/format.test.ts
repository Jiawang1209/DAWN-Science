/**
 * token 数怎么写（2026-08-11）。
 *
 * 作者：*「token 的消耗，变换一下单位 k tokens，这样方便统计和查看。」*
 * 这条**推翻了我之前写下的**「不缩写成 1.2k」——见 `src/ui/format.ts` 的说明。
 */
import { describe, expect, it } from "vitest"
import { formatTokens } from "../../src/ui/format.js"

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
