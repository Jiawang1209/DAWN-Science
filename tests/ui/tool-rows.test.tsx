/**
 * 工具调用行（Task 3.1 · R5，返工 R 的收尾）。
 *
 * **数据通路在 R4 就建好了，但一条测试都没有。**
 * `grep -rn "tool" tests/ui/*.tsx` 在写这份文件之前返回空——
 * 也就是说「界面能不能让人看见 agent 在干什么」从来没被验证过。
 * 这与本项目已经犯过五次的那类缺陷同源：**内部模型完整，用户可见的那一端没人看。**
 *
 * 这里验四件事，后三件当前实现都做不到：
 *   1. 名称与 running/ok/error 状态可见
 *   2. **长结果默认折叠** —— 否则一次 `bash` 的输出能把整个对话区淹掉
 *   3. **截断必须出声，且说清省了多少** —— 规格 7.5，且 Rho 的每个预览字段
 *      都配一个 `*_truncated` 布尔，不靠一个省略号暗示
 *   4. **error 即使没有 result 也必须说明失败了** —— 失败静默是最坏的一种
 */
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  state: "alive",
  createdAt: "2026-08-08T00:00:00Z",
}

const tool = (over: Partial<Extract<TranscriptItem, { type: "tool" }>> = {}) =>
  ({
    type: "tool",
    id: "t1",
    name: "bash",
    input: { command: "ls -la" },
    status: "ok",
    ...over,
  }) as TranscriptItem

const show = (items: TranscriptItem[]) =>
  render(<ConversationView session={session} items={items} onSend={() => {}} />)

describe("工具调用行 · 名称与状态", () => {
  it("显示工具名", () => {
    show([tool()])
    expect(screen.getByText(/bash/)).toBeTruthy()
  })

  it("显示入参摘要", () => {
    show([tool()])
    expect(screen.getByText("ls -la")).toBeTruthy()
  })

  it("running 时不显示结果区 —— 还没有结果就别造一个空框", () => {
    const { container } = show([tool({ status: "running", result: undefined })])
    expect(container.querySelector(".tool-result")).toBeNull()
  })

  it("三种状态各自可辨识 —— 不能只靠颜色（DESIGN.md：no meaning by color alone）", () => {
    for (const status of ["running", "ok", "error"] as const) {
      const { container, unmount } = show([tool({ status, result: "x" })])
      const row = container.querySelector(".tool")
      // 状态必须以文本形式出现在无障碍树里，而不只是一个 class
      expect(row?.getAttribute("data-status")).toBe(status)
      expect(row?.textContent).toMatch(/执行中|成功|失败/)
      unmount()
    }
  })
})

describe("工具调用行 · 长结果默认折叠", () => {
  const long = "行\n".repeat(400)

  it("长结果默认不整个铺开", () => {
    const { container } = show([tool({ result: long })])
    const shown = container.querySelector(".tool-result")?.textContent ?? ""
    // 全量铺开会把对话区淹掉。折叠后展示的内容必须显著短于原文
    expect(shown.length).toBeLessThan(long.length / 2)
  })

  it("有展开入口，展开后能看到全文", () => {
    const { container } = show([tool({ result: long })])
    const toggle = screen.getByRole("button", { name: /展开|全部/ })
    fireEvent.click(toggle)
    const shown = container.querySelector(".tool-result")?.textContent ?? ""
    expect(shown.length).toBe(long.length)
  })

  it("短结果不加折叠控件 —— 不给不需要的东西加仪式", () => {
    show([tool({ result: "ok" })])
    expect(screen.queryByRole("button", { name: /展开|全部/ })).toBeNull()
  })
})

describe("工具调用行 · 截断必须出声", () => {
  it("折叠时说清还有多少没显示，而不只是一个省略号", () => {
    const { container } = show([tool({ result: "行\n".repeat(400) })])
    // 规格 7.5：不许静默截断。省略号不构成说明——要给出数量
    expect(container.textContent).toMatch(/还有\s*\d+/)
  })

  it("超长入参摘要同样出声", () => {
    const input = { note: "长".repeat(5000) }
    const { container } = show([tool({ input })])
    expect(container.querySelector(".tool-input")?.textContent ?? "").toMatch(/…$/)
    expect(container.textContent).toMatch(/入参已截断|已截断/)
  })
})

describe("工具调用行 · 失败不许静默", () => {
  it("error 且没有 result 时，仍然说明它失败了", () => {
    const { container } = show([tool({ status: "error", result: undefined })])
    // 当前实现在这种情况下什么都不渲染 —— 界面上看不出发生过失败
    expect(container.textContent).toMatch(/失败/)
    expect(container.textContent).toMatch(/没有给出原因|未提供原因/)
  })

  it("error 带 result 时把原因显示出来", () => {
    const { container } = show([tool({ status: "error", result: "command not found: qq" })])
    expect(container.textContent).toContain("command not found: qq")
  })
})
