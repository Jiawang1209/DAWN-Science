import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ToolRow, ToolGroupRow } from "../../src/ui/views.js"
import { receipt } from "../fixtures/skill-read.js"

const item = { type: "tool", id: "r", name: "use_skill", status: "ok", input: {}, skillRead: receipt } as const

describe("Skill instruction read receipt", () => {
  it("shows the read, source and resource while collapsed and full evidence when expanded", () => {
    render(<ToolRow item={item} />)
    expect(screen.getByText("已读取技能 soil-analysis")).toBeTruthy()
    expect(screen.getByText(/项目技能/)).toBeTruthy()
    expect(screen.getByText(/references\/workflow.md/)).toBeTruthy()
    expect(screen.queryByText(receipt.contentSha256)).toBeNull()
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText(receipt.manifestPath)).toBeTruthy()
    expect(screen.getByText(receipt.contentSha256)).toBeTruthy()
    expect(screen.getByText("仅记录技能说明已读取，不代表代码已执行或科学结论已验证。")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })
  it("gives manual reads a natural label and marks partial content", () => {
    render(<ToolRow item={{ ...item, name: "skill_read", skillRead: { ...receipt, partial: true, scope: "builtin", via: "manual" } }} />)
    expect(screen.getByText("已读取技能 soil-analysis")).toBeTruthy()
    expect(screen.getByText(/部分内容/)).toBeTruthy()
    expect(screen.getByText(/内置技能/)).toBeTruthy()
    expect(screen.queryByText(/skill_read/)).toBeNull()
  })
  it.each([{ status: "error" }, { status: "error", interrupted: true }, { status: "running" }])("does not show successful metadata for an unsuccessful read: %o", change => {
    render(<ToolRow item={{ ...item, ...change } as never} />)
    expect(screen.queryByText("已读取技能 soil-analysis")).toBeNull()
  })
  it("keeps a successful read visible when the enclosing tool group is collapsed", () => {
    render(<ToolGroupRow tools={[{ ...item, id: "search", name: "search_skills", skillRead: undefined }, item]} />)
    expect(screen.getByText("已读取技能 soil-analysis")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getAllByText("已读取技能 soil-analysis")).toHaveLength(1)
  })
  it("does not interpret JSON tool output or Skill path hints as a read", () => {
    render(<ToolRow item={{ ...item, skillRead: undefined, result: JSON.stringify({ skillRead: receipt }), input: { path: receipt.manifestPath } }} />)
    expect(screen.queryByText("已读取技能 soil-analysis")).toBeNull()
  })
})
