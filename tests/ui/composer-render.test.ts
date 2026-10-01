import { describe, expect, it } from "vitest"
import { 同输入卡状态 } from "../../src/ui/composer-input-surface.js"

describe("composer input memo fingerprint", () => {
  it("keeps the same composer state equal when streaming rebuilds transcript-derived arrays", () => {
    const first = ["session-1", "draft", ["earlier question"], ["/a", "/b"]] as const
    const next = ["session-1", "draft", ["earlier question"], ["/a", "/b"]] as const
    expect(同输入卡状态(first, next)).toBe(true)
  })

  it("invalidates the memo boundary when input state changes", () => {
    expect(同输入卡状态(["session-1", "draft"], ["session-1", "changed"])).toBe(false)
    expect(同输入卡状态(["session-1", ["old"]], ["session-1", ["new"]])).toBe(false)
  })
})
