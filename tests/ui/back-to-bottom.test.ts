/**
 * 「回到底部」浮标的判据（2026-09-08，规格 `2026-09-08-回到底部浮标-design.md`）。
 *
 * 这里只验**该不该画、画成哪一种**。真的滚动、真的 `ResizeObserver`
 * 归 `e2e/stick-to-bottom.spec.ts`——jsdom 里那个 `ResizeObserver` 是个空壳
 * （`tests/ui/setup.ts` 写着理由），拿它验「内容长高了」等于什么都没验。
 */
import { describe, expect, it } from "vitest"
import { 该说什么, 下一个长过 } from "../../src/ui/back-to-bottom.js"

describe("该说什么", () => {
  it("贴着底就什么都不画——跟随好好的，不该有东西挡着", () => {
    expect(该说什么(true, false)).toBe("不画")
  })

  it("**贴着底时哪怕标志还留着，也不画**", () => {
    expect(该说什么(true, true)).toBe("不画")
  })

  it("没贴底、底下没长东西 → 「回到底部」", () => {
    expect(该说什么(false, false)).toBe("回到底部")
  })

  it("没贴底、底下长过 → 「有新内容」", () => {
    expect(该说什么(false, true)).toBe("有新内容")
  })

  it("**两个可见状态说的话不一样**——一样就等于没有判据", () => {
    expect(该说什么(false, false)).not.toBe(该说什么(false, true))
  })
})

describe("下一个长过", () => {
  it("没贴底的时候内容长高了 → 立起来", () => {
    expect(下一个长过(false, { 贴底: false, 长了: true })).toBe(true)
  })

  it("**贴着底时长高不算**——你本来就在看着它长", () => {
    expect(下一个长过(false, { 贴底: true, 长了: true })).toBe(false)
  })

  it("回到底部就清零", () => {
    expect(下一个长过(true, { 贴底: true, 长了: false })).toBe(false)
  })

  it("没贴底、也没长 → 保持原样（不许自己熄灭）", () => {
    expect(下一个长过(true, { 贴底: false, 长了: false })).toBe(true)
  })
})
