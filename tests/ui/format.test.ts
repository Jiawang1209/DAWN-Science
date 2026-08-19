/**
 * token 数怎么写（2026-08-11）。
 *
 * 作者：*「token 的消耗，变换一下单位 k tokens，这样方便统计和查看。」*
 * 这条**推翻了我之前写下的**「不缩写成 1.2k」——见 `src/ui/format.ts` 的说明。
 */
import { describe, expect, it } from "vitest"
import { formatDuration, formatTokens, 多久之前 } from "../../src/ui/format.js"

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

/**
 * **距离上一次多久了**（2026-08-19，作者要的，形状取自 Hermes）。
 *
 * 这份用例的重心是**边界**：进位在哪、取整往哪边倒、认不出来怎么办。
 * 中间那些值不用一个个列——`90 分钟 → 1h` 这一条已经把取整方向钉死了。
 */
describe("多久之前", () => {
  const 现在 = Date.parse("2026-08-19T12:00:00Z")
  const 之前 = (毫秒: number) => 多久之前(new Date(现在 - 毫秒).toISOString(), 现在)
  const 秒 = 1000, 分 = 60 * 秒, 时 = 60 * 分, 天 = 24 * 时

  it("不到一分钟写「刚刚」——不是 `0m`", () => {
    expect(之前(0)).toBe("刚刚")
    expect(之前(59 * 秒)).toBe("刚刚")
  })

  it("满一分钟才进 m", () => {
    expect(之前(60 * 秒)).toBe("1m")
    expect(之前(59 * 分)).toBe("59m")
  })

  it("满 60 分才进 h", () => {
    expect(之前(60 * 分)).toBe("1h")
    expect(之前(23 * 时 + 59 * 分)).toBe("23h")
  })

  it("满 24 时才进 d", () => {
    expect(之前(24 * 时)).toBe("1d")
    expect(之前(9 * 天)).toBe("9d")
  })

  /**
   * **向下取整，不是四舍五入。**
   *
   * 90 分钟写 `1h`。往上取会让「刚过一小时」显示成两小时——
   * 那是往大了说，而这一列往大了说就等于劝人放弃这段对话。
   */
  it("**向下取整**：90 分钟是 1h，不是 2h", () => {
    expect(之前(90 * 分)).toBe("1h")
    expect(之前(47 * 时)).toBe("1d")
  })

  /** 超过 99 天不静默截断——那个 `+` 就是「还不止」 */
  it("超过 99 天写 `99d+`", () => {
    expect(之前(99 * 天)).toBe("99d")
    expect(之前(100 * 天)).toBe("99d+")
    expect(之前(3650 * 天)).toBe("99d+")
  })

  /**
   * **未来的时刻写「刚刚」**，不写负数。它只可能来自时钟回拨，
   * 而 `-3h` 除了让人怀疑程序坏了之外没有任何用。
   */
  it("未来的时刻不写负数", () => {
    expect(之前(-3 * 时)).toBe("刚刚")
  })

  /** **认不出来要说出来**，不是显示成「刚刚」——那是编造 */
  it("认不出的时间说「时间不明」", () => {
    expect(多久之前("不是时间", 现在)).toBe("时间不明")
    expect(多久之前("", 现在)).toBe("时间不明")
  })
})
