import { beforeEach, describe, expect, it, vi } from "vitest"
import { $background, BACKGROUND_STORAGE_KEY, applyBackground, backgroundVariants, loadBackground, setBackground } from "../../src/ui/state/background.js"
import { 相对亮度, isHex } from "../../src/ui/state/accent.js"

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute("style")
  $background.set(null)
  vi.restoreAllMocks()
})

describe("独立背景色", () => {
  it("默认不覆盖现有明暗背景", () => {
    expect(loadBackground()).toBeNull()
    expect(document.documentElement.style.length).toBe(0)
  })
  it.each(["#000000", "#ffffff", "#2f6feb", "#d6336c", "#f1ebe0"])("%s生成可阅读的亮暗两支", (hex) => {
    const result = backgroundVariants(hex)
    expect(isHex(result.light)).toBe(true)
    expect(isHex(result.dark)).toBe(true)
    expect(相对亮度(result.light)).toBeGreaterThanOrEqual(0.6)
    expect(相对亮度(result.dark)).toBeLessThanOrEqual(0.045)
  })
  it("仅写背景种子，不改主题色或文字语义", () => {
    applyBackground("#abcdef")
    expect([...document.documentElement.style].sort()).toEqual(["--theme-user-background-dark", "--theme-user-background-light"])
  })
  it("独立保存并可重新加载，小写归一", () => {
    setBackground("#ABCDEF")
    expect(localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe("#abcdef")
    $background.set(null)
    expect(loadBackground()).toBe("#abcdef")
    expect($background.get()).toBe("#abcdef")
  })
  it("恢复默认同时清掉持久化与行内覆盖", () => {
    setBackground("#abcdef")
    setBackground(null)
    expect(localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBeNull()
    expect($background.get()).toBeNull()
    expect(document.documentElement.style.length).toBe(0)
  })
  it("非法输入不污染已有值，坏存储回落默认并出声", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    setBackground("#abcdef")
    setBackground("no-color")
    expect($background.get()).toBe("#abcdef")
    localStorage.setItem(BACKGROUND_STORAGE_KEY, "broken")
    expect(loadBackground()).toBeNull()
    expect(document.documentElement.style.length).toBe(0)
    expect(error).toHaveBeenCalled()
  })
  it("存储写失败仍即时生效", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    setBackground("#abcdef")
    expect($background.get()).toBe("#abcdef")
    expect(document.documentElement.style.getPropertyValue("--theme-user-background-light")).not.toBe("")
  })
})
