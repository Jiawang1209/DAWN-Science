/**
 * 变量面板的三态（②-A · K5 · S14）。
 *
 * **这块最容易做错的地方不是列表，是三态。**
 * 「不支持」和「真的没有变量」画成同一个空面板的话，
 * 用户会以为自己的变量丢了——而那正是**把「我们没去问」说成
 * 「这里什么都没有」**。
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { VariablesPanel } from "../../src/ui/panels.js"

describe("三态", () => {
  it("还没取到 → 尚未记录", () => {
    render(<VariablesPanel state={undefined} />)
    expect(screen.getByText(/尚未记录/)).toBeDefined()
  })

  it("**不支持 → 说清为什么**，不是一片空白", () => {
    render(<VariablesPanel state={{ supported: false, reason: "这个内核的语言是 R" }} />)
    expect(screen.getByText(/看不到/)).toBeDefined()
    expect(screen.getByText(/这个内核的语言是 R/)).toBeDefined()
  })

  it("**支持且为空 → 那是真的没有**，措辞与「不支持」不同", () => {
    render(<VariablesPanel state={{ supported: true, variables: [] }} />)
    expect(screen.getByText(/还没有变量/)).toBeDefined()
    // 不能说成「看不到」——那是另一件事
    expect(screen.queryByText(/看不到/)).toBeNull()
  })
})

describe("列表", () => {
  const v = (over = {}) => ({
    name: "df",
    type: "DataFrame",
    preview: "   a  b\n0  1  2",
    previewTruncated: false,
    ...over,
  })

  it("名字、类型、维度都摆出来", () => {
    render(<VariablesPanel state={{ supported: true, variables: [v({ dimensions: "(3, 2)" })] }} />)
    expect(screen.getByText("df")).toBeDefined()
    expect(screen.getByText(/DataFrame/)).toBeDefined()
    expect(screen.getByText(/\(3, 2\)/)).toBeDefined()
  })

  it("拿不到维度时不显示它 —— **缺就是缺**，不写一个「未知」占位", () => {
    render(<VariablesPanel state={{ supported: true, variables: [v()] }} />)
    expect(screen.queryByText(/·\s*未知/)).toBeNull()
  })

  it("**预览被砍过要标出来** —— 砍过的和完整的看起来一模一样", () => {
    render(<VariablesPanel state={{ supported: true, variables: [v({ previewTruncated: true })] }} />)
    expect(screen.getByText(/预览已截断/)).toBeDefined()
  })

  it("没砍过就不标", () => {
    render(<VariablesPanel state={{ supported: true, variables: [v()] }} />)
    expect(screen.queryByText(/预览已截断/)).toBeNull()
  })
})
