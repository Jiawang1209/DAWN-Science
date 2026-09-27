/** chip 上那一句（2026-09-27，spec D5）：工具名 + 最能说明它在干什么的那个参数，一行、≤ 120 字 */
import { describe, expect, it } from "vitest"
import { 活动一句 } from "../../src/subagent/activity.js"

describe("活动一句", () => {
  it("bash 取命令第一行；read / edit 取路径；grep 取模式", () => {
    expect(活动一句("bash", { command: "python -m pytest -q\necho done" })).toBe("bash python -m pytest -q")
    expect(活动一句("read", { path: "README.md" })).toBe("read README.md")
    expect(活动一句("grep", { pattern: "TODO" })).toBe("grep TODO")
  })
  it("认不出参数就只写工具名；太长截到 120 字并带省略号", () => {
    expect(活动一句("ls", {})).toBe("ls")
    expect(活动一句("ls", undefined)).toBe("ls")
    const s = 活动一句("bash", { command: "x".repeat(300) })
    expect(s.length).toBe(120)
    expect(s.endsWith("…")).toBe(true)
  })
})
