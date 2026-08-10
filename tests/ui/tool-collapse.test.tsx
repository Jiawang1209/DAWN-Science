/**
 * 工具调用的折叠规则（2026-08-10）。
 *
 * 作者要「像 codex / claude 那样可折叠」。折叠是为了让对话读得下去——
 * 一次分析可能有几十次工具调用，全摊开就没法看了。
 *
 * **但失败必须出声（规格 7.5）**：一个折叠起来的错误等于没报错，
 * 人要一条条点开才知道哪里出了问题，那正是把「出声」变成「藏着」。
 *
 * 所以这里验的不是「能折叠」，而是**该折的折了、不该折的没折**。
 */
import { describe, expect, it } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TranscriptRow } from "../../src/ui/views.js"

const tool = (over: Record<string, unknown> = {}) =>
  ({
    type: "tool" as const,
    id: "t1",
    name: "bash",
    status: "ok" as const,
    input: { command: "ls -la /很长的路径/analysis" },
    result: "第一行\n第二行",
    ...over,
  }) as never

describe("工具调用的折叠", () => {
  it("**成功的默认折叠** —— 几十次调用全摊开就没法读了", () => {
    const { container } = render(<TranscriptRow item={tool()} agentId="a" />)
    expect(container.querySelector(".tool-body")).toBeNull()
    expect(container.querySelector(".tool-head")?.getAttribute("aria-expanded")).toBe("false")
  })

  it("**折叠时仍看得见它做了什么** —— 一排「bash / 完成」等于把信息藏没了", () => {
    const { container } = render(<TranscriptRow item={tool()} agentId="a" />)
    expect(container.querySelector(".tool-peek")?.textContent).toContain("ls -la")
  })

  it("**报错的默认展开** —— 折叠起来的错误等于没报错", () => {
    const { container } = render(
      <TranscriptRow item={tool({ status: "error", result: "命令找不到" })} agentId="a" />,
    )
    expect(container.querySelector(".tool-body")).not.toBeNull()
    expect(container.querySelector(".tool-head")?.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/命令找不到/)).toBeDefined()
  })

  it("**失败且没有正文时那句话仍在** —— 此前这一支渲染成空白", () => {
    render(<TranscriptRow item={tool({ status: "error", result: undefined })} agentId="a" />)
    expect(screen.getByText(/这次调用失败了，但没有给出原因/)).toBeDefined()
  })

  it("点一下展开，再点收起", () => {
    const { container } = render(<TranscriptRow item={tool()} agentId="a" />)
    const head = container.querySelector(".tool-head")!
    fireEvent.click(head)
    expect(container.querySelector(".tool-body")).not.toBeNull()
    fireEvent.click(head)
    expect(container.querySelector(".tool-body")).toBeNull()
  })

  it("**报错的也收得起来** —— 默认展开不等于锁死", () => {
    const { container } = render(<TranscriptRow item={tool({ status: "error" })} agentId="a" />)
    fireEvent.click(container.querySelector(".tool-head")!)
    expect(container.querySelector(".tool-body")).toBeNull()
  })
})
