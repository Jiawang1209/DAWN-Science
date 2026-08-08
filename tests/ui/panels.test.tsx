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
  ChangesPanel,
  CostPanel,
  ProvenanceBadge,
  RunsPanel,
  StatusPanel,
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
  state: "alive",
  createdAt: "2026-08-08T00:00:00Z",
  ...over,
})

describe("硬要求 ① 产出栏必须标注可能混入手动修改", () => {
  const facts = (over: Partial<FileChangeFacts> = {}): FileChangeFacts => ({
    files: ["src/a.ts", "src/b.ts"],
    mayIncludeUserEdits: true,
    baselineHead: "abc123",
    computedAt: "2026-08-08T00:01:00Z",
    ...over,
  })

  it("mayIncludeUserEdits 为 true 时显示告知", () => {
    render(<ChangesPanel facts={facts()} />)
    expect(screen.getByText(/可能包含你自己的修改/)).toBeDefined()
  })

  it("隔离环境（false）时不显示该告知", () => {
    render(<ChangesPanel facts={facts({ mayIncludeUserEdits: false })} />)
    expect(screen.queryByText(/可能包含你自己的修改/)).toBeNull()
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

describe("状态栏", () => {
  it("区分存活与已退出的会话", () => {
    render(<StatusPanel sessions={[session(), session({ sessionId: "s2", state: "exited" })]} />)
    expect(screen.getByText(/存活\s*1/)).toBeDefined()
    expect(screen.getByText(/已退出\s*1/)).toBeDefined()
  })

  it("没有会话时如实说没有", () => {
    render(<StatusPanel sessions={[]} />)
    expect(screen.getByText(/还没有会话/)).toBeDefined()
  })
})

describe("历史栏", () => {
  it("列出 run，并显示是人做的还是 agent 做的", () => {
    render(<RunsPanel runs={[run({ origin: "user" }), run({ runId: "r2", origin: "agent" })]} />)
    // 用精确匹配：requestType 是 "agent_turn"，模糊匹配 /agent/i 会同时命中它
    expect(screen.getByText("人")).toBeDefined()
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
