/**
 * 变更 pane（①-B″ · U4）。
 *
 * **不变式 5 第一次有用户可见面。** R3 已经把「哪次工具调用改了哪个文件」
 * 记进账本，此前只是没人显示它。
 *
 * 这个面板最要紧的两件事：
 *   1. **「不知道」与「确认没改」必须看得出区别**——账本里前者是缺省、
 *      后者是空数组，界面上把它们画成同一个样子，等于把区别抹掉了
 *   2. **`mayIncludeUserEdits` 必须显示**，不能指望人记得加脚注
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { mayIncludeUserEdits, ToolChangesPanel } from "../../src/ui/panels.js"
import type { RunSummary } from "../../src/protocol/index.js"

const run = (over: Partial<RunSummary>): RunSummary =>
  ({
    runId: "r1",
    projectId: "p1",
    sessionId: "s1",
    origin: "agent",
    requestType: "tool_call:write",
    status: "completed",
    startedAt: "2026-08-09T00:00:00.000Z",
    finishedAt: "2026-08-09T00:00:01.000Z",
    hasError: false,
    ...over,
  }) as RunSummary

describe("变更 pane · 空态", () => {
  it("一条 Run 都没有时说明情况", () => {
    render(<ToolChangesPanel runs={[]} />)
    expect(screen.getByText(/还没有/)).toBeTruthy()
  })

  it("只有非工具 Run 时也不假装有产出", () => {
    render(<ToolChangesPanel runs={[run({ requestType: "agent_turn" })]} />)
    expect(screen.getByText(/还没有/)).toBeTruthy()
  })
})

describe("变更 pane · 标明是哪个工具改的", () => {
  it("显示工具名，不是匿名序号", () => {
    render(<ToolChangesPanel runs={[run({ filesWritten: ["a.ts"] })]} />)
    // requestType 是 `tool_call:write`，界面要显示 write
    expect(screen.getByText("write")).toBeTruthy()
  })

  it("列出这次调用改的文件", () => {
    render(<ToolChangesPanel runs={[run({ filesWritten: ["src/a.ts", "b.md"] })]} />)
    expect(screen.getByText("src/a.ts")).toBeTruthy()
    expect(screen.getByText("b.md")).toBeTruthy()
  })

  it("拿不到工具名时退回一个诚实的说法，不编", () => {
    render(<ToolChangesPanel runs={[run({ requestType: "tool_call", filesWritten: ["a.ts"] })]} />)
    expect(screen.getByText(/未记录工具名|工具/)).toBeTruthy()
  })
})

describe("变更 pane · 「不知道」不等于「没改」", () => {
  /**
   * 账本里：**缺省 = 不知道**（非 git 仓库、快照失败、只读工具），
   * **空数组 = 确认没改任何文件**。这是 R3 刻意保留的区别，
   * 界面上抹掉它就等于把「不知道」说成了「没改」——那是编造。
   */
  it("缺省时说「不知道」", () => {
    const { container } = render(<ToolChangesPanel runs={[run({ filesWritten: undefined })]} />)
    expect(container.textContent).toMatch(/无法确定|不知道/)
  })

  it("空数组时说「没有改动文件」", () => {
    const { container } = render(<ToolChangesPanel runs={[run({ filesWritten: [] })]} />)
    expect(container.textContent).toMatch(/没有改动|未改动/)
  })

  it("**两者的措辞必须不同** —— 一样就等于抹掉了区别", () => {
    const a = render(<ToolChangesPanel runs={[run({ filesWritten: undefined })]} />).container.textContent
    const b = render(<ToolChangesPanel runs={[run({ filesWritten: [] })]} />).container.textContent
    expect(a).not.toBe(b)
  })
})

describe("变更 pane · 可能混入作者改动要出声", () => {
  /**
   * **2026-08-09：这句告知搬到概览层了。**
   *
   * 它此前同时长在「产出」与「变更」里，于是同一句四十字的橙色警告
   * 在概览上并排出现两次——那是整屏最响的东西，而它说的是同一件事。
   *
   * 现在由 `AttributionCaveat` 说一次，判定走
   * `mayIncludeUserEdits(facts, runs)`（**两个来源合并**，
   * 判定本身的测试在 `panels.test.tsx`）。
   * 这里改为盯住反面：**面板自己不许再说一遍**。
   */
  it("面板自己不再说 —— 重复的警告是这次修掉的缺陷", () => {
    const { container } = render(
      <ToolChangesPanel runs={[run({ filesWritten: ["a.ts"], mayIncludeUserEdits: true })]} />,
    )
    expect(container.textContent).not.toMatch(/可能包含你自己的修改/)
  })

  it("**但那条事实没被丢掉** —— 合并判定仍然说要警示", () => {
    expect(
      mayIncludeUserEdits(undefined, [
        run({ requestType: "tool_call:write", filesWritten: ["a.ts"], mayIncludeUserEdits: true }),
      ]),
    ).toBe(true)
  })
})

describe("变更 pane · 按回合归组", () => {
  it("同一个 parentRunId 下的调用归在一起", () => {
    const { container } = render(
      <ToolChangesPanel
        runs={[
          run({ runId: "t1", parentRunId: "turn1", requestType: "tool_call:write", filesWritten: ["a.ts"] }),
          run({ runId: "t2", parentRunId: "turn1", requestType: "tool_call:edit", filesWritten: ["b.ts"] }),
          run({ runId: "t3", parentRunId: "turn2", requestType: "tool_call:bash", filesWritten: ["c.ts"] }),
        ]}
      />,
    )
    expect(container.querySelectorAll(".turn-group")).toHaveLength(2)
  })

  it("没有 parent 的调用也要显示 —— 丢掉等于让它不留痕迹", () => {
    // RunRecorder 的注释写得很清楚：没有开着的回合也要记，只是没有 parent
    const { container } = render(
      <ToolChangesPanel runs={[run({ parentRunId: undefined, filesWritten: ["a.ts"] })]} />,
    )
    expect(container.textContent).toContain("a.ts")
  })
})
