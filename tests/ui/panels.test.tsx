/**
 * 项目面板的组件测试。
 *
 * **这是本阶段最有价值的一组测试**：计划 §Part 3 的三条硬要求验的都是
 * 「显示了什么」，而那恰恰是作者能一眼判断、我却看不见的部分。
 * 把它们钉成测试，UI 怎么改都不会把这三条改丢。
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  AttributionCaveat,
  mayIncludeUserEdits,
  ChangesPanel,
  CostPanel,
  ProvenanceBadge,
  RunsPanel,
} from "../../src/ui/panels.js"
import type { Cost, FileChangeFacts, RunSummary, SessionSummary } from "../../src/protocol/index.js"

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  runId: "r1",
  projectId: "p1",
  sessionId: "s1",
  origin: "agent",
  requestType: "agent_turn",
  status: "completed",
  startedAt: "2026-08-08T00:00:00Z",
  finishedAt: "2026-08-08T00:01:00Z",
  hasError: false,
  ...over,
})

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-08T00:00:00Z",
  ...over,
})

describe("硬要求 ① 必须标注可能混入手动修改", () => {
  const facts = (over: Partial<FileChangeFacts> = {}): FileChangeFacts => ({
    files: ["src/a.ts", "src/b.ts"],
    mayIncludeUserEdits: true,
    baselineHead: "abc123",
    computedAt: "2026-08-08T00:01:00Z",
    ...over,
  })

  /**
   * **2026-08-09：这条告知搬家了。**
   *
   * 它此前同时长在「产出」与「变更」两个面板里，于是同一句四十字的橙色警告
   * 在概览上并排出现两次。现在由 `AttributionCaveat` 在概览顶上说一次，
   * 判定来自 `mayIncludeUserEdits(facts, runs)`——**两个来源合并**。
   *
   * 只留其中一个面板是不行的：两边数据来源不同，
   * 另一个有而这一个没有时警告会整个消失，那是静默吞掉告知（规格 7.5）。
   */
  it("显示告知", () => {
    render(<AttributionCaveat show={true} />)
    expect(screen.getByText(/可能包含你自己的修改/)).toBeDefined()
  })

  it("隔离环境（false）时不显示该告知", () => {
    render(<AttributionCaveat show={false} />)
    expect(screen.queryByText(/可能包含你自己的修改/)).toBeNull()
  })

  it("**面板自己不再各说一遍** —— 重复的警告是这次修掉的缺陷", () => {
    render(<ChangesPanel facts={facts()} />)
    expect(screen.queryByText(/可能包含你自己的修改/)).toBeNull()
  })

  describe("判定：两个来源合并，任一为真就要说", () => {
    const toolRun = (may: boolean): RunSummary =>
      run({ requestType: "tool_call:write", mayIncludeUserEdits: may })

    it("git 基线说可能混入 → 要说", () => {
      expect(mayIncludeUserEdits(facts(), [])).toBe(true)
    })
    it("**只有工具调用说可能混入 → 也要说**（此前这一支会整个丢掉告知）", () => {
      expect(mayIncludeUserEdits(undefined, [toolRun(true)])).toBe(true)
    })
    it("两边都说没有 → 不说", () => {
      expect(mayIncludeUserEdits(facts({ mayIncludeUserEdits: false }), [toolRun(false)])).toBe(false)
    })
    it("非工具调用的 run 不参与判定", () => {
      expect(
        mayIncludeUserEdits(undefined, [run({ requestType: "agent_turn", mayIncludeUserEdits: true })]),
      ).toBe(false)
    })
  })

  it("列出变更文件", () => {
    render(<ChangesPanel facts={facts()} />)
    expect(screen.getByText("src/a.ts")).toBeDefined()
    expect(screen.getByText("src/b.ts")).toBeDefined()
  })

  it("空变更集显示「未改动任何文件」——那是一个事实，不是缺数据", () => {
    render(<ChangesPanel facts={facts({ files: [] })} />)
    expect(screen.getByText(/未改动任何文件/)).toBeDefined()
  })

  it("**没有事实时显示「不可知」，绝不显示「未改动」**", () => {
    // 缺基线（进程重启、非 git 仓库）时后端不返回 fileChanges。
    // 把它显示成「未改动」是撒谎——那是本项目最不能犯的错。
    render(<ChangesPanel facts={undefined} />)
    expect(screen.getByText(/无法确定/)).toBeDefined()
    expect(screen.queryByText(/未改动任何文件/)).toBeNull()
  })
})

describe("硬要求 ② 成本「不可见」绝不显示为 0", () => {
  it("可见时显示金额与 token", () => {
    const cost: Cost = { visible: true, inputTokens: 120, outputTokens: 40, totalUSD: 0.000021 }
    render(<CostPanel cost={cost} />)
    expect(screen.getByText(/120/)).toBeDefined()
    expect(screen.getByText(/\$/)).toBeDefined()
  })

  it("不可见时显示「不可见」与原因，且页面上不出现 0 或 $", () => {
    const cost: Cost = { visible: false, reason: "该 agent 使用自有订阅额度" }
    const { container } = render(<CostPanel cost={cost} />)
    expect(screen.getByText(/不可见/)).toBeDefined()
    expect(screen.getByText(/自有订阅额度/)).toBeDefined()
    expect(container.textContent).not.toContain("$")
    expect(container.textContent).not.toMatch(/\b0\b/)
  })

  it("尚未记录（undefined）与「不可见」是两种显示 —— 三态不是两态", () => {
    render(<CostPanel cost={undefined} />)
    expect(screen.getByText(/尚未记录/)).toBeDefined()
    expect(screen.queryByText(/不可见/)).toBeNull()
  })
})

describe("硬要求 ③ 溯源不完整必须显示原因", () => {
  it("完整时显示「完整」，不显示原因区", () => {
    render(<ProvenanceBadge link={{ resourceId: "a1", provenanceComplete: true }} />)
    expect(screen.getByText(/完整/)).toBeDefined()
  })

  it("不完整时把原因原样显示出来 —— 不隐藏、不留白", () => {
    render(
      <ProvenanceBadge
        link={{
          resourceId: "a1",
          provenanceComplete: false,
          incompleteReason: "PTY agent 的内置工具不经过注入的 MCP",
        }}
      />,
    )
    expect(screen.getByText(/不完整/)).toBeDefined()
    expect(screen.getByText(/内置工具不经过注入的 MCP/)).toBeDefined()
  })
})

describe("历史栏", () => {
  it("列出 run，并显示是人做的还是 agent 做的", () => {
    render(<RunsPanel runs={[run({ origin: "user" }), run({ runId: "r2", origin: "agent" })]} />)
    // 用精确匹配：requestType 是 "agent_turn"，模糊匹配 /agent/i 会同时命中它
    // 「人」→「你」：与 transcript 里用户发言的标签同一个词
    expect(screen.getByText("你")).toBeDefined()
    expect(screen.getByText("agent")).toBeDefined()
  })

  it("出错的 run 有可见标记", () => {
    render(<RunsPanel runs={[run({ status: "failed", hasError: true })]} />)
    expect(screen.getByText(/失败/)).toBeDefined()
  })

  it("进行中的 run 不显示耗时 —— 它还没结束", () => {
    const { container } = render(
      <RunsPanel runs={[run({ status: "running", finishedAt: undefined })]} />,
    )
    expect(screen.getByText(/进行中/)).toBeDefined()
    expect(container.textContent).not.toMatch(/耗时/)
  })

  it("空历史如实说没有", () => {
    render(<RunsPanel runs={[]} />)
    expect(screen.getByText(/还没有记录/)).toBeDefined()
  })
})
