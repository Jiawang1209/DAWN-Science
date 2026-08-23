/**
 * 主题色（2026-08-23）：颜色算术与「默认值只有一个家」。
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_ACCENT, ACCENT_PRESETS, 暗色变体, 按钮字色, 相对亮度, isHex, applyAccent } from "../../src/ui/state/accent.js"

describe("主题色", () => {
  it("默认绿与 tokens.css 里写的种子是同一个值——两处都写了，就得互相对得上", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/tokens.css"), "utf8")
    expect(css).toMatch(new RegExp(`--theme-user-accent:\\s*${DEFAULT_ACCENT};`))
  })

  it("暗色变体比原色亮，且对任何色相都成立", () => {
    for (const { hex } of ACCENT_PRESETS) {
      const 暗 = 暗色变体(hex)
      expect(isHex(暗)).toBe(true)
      expect(相对亮度(暗)).toBeGreaterThan(相对亮度(hex))
    }
  })

  it("预置色全是深色：按钮上配白字", () => {
    for (const { hex } of ACCENT_PRESETS) expect(按钮字色(hex)).toBe("#ffffff")
  })

  it("浅色主题色配深字——白字在浅黄上读不出来", () => {
    expect(按钮字色("#ffd240")).toBe("#0d0d0d")
    expect(按钮字色("#ffffff")).toBe("#0d0d0d")
    expect(按钮字色("#000000")).toBe("#ffffff")
  })

  it("applyAccent 只写四个 --theme-user-* 变量到行内样式；默认绿则把它们抹掉，让 tokens.css 的手调值生效", () => {
    const set: Record<string, string> = {}
    const removed: string[] = []
    const el = { style: { setProperty: (k: string, v: string) => void (set[k] = v), removeProperty: (k: string) => void removed.push(k) } } as unknown as HTMLElement
    applyAccent(DEFAULT_ACCENT, el)
    expect(Object.keys(set)).toEqual([])
    expect(removed).toHaveLength(4)
    applyAccent("#2f6feb", el)
    expect(Object.keys(set).sort()).toEqual(["--theme-user-accent", "--theme-user-accent-dark", "--theme-user-on-accent", "--theme-user-on-accent-dark"])
    expect(set["--theme-user-accent"]).toBe("#2f6feb")
  })
})
