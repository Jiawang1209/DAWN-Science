import { describe, expect, it } from "vitest"
import {
  CostSchema,
  FileChangeFactsSchema,
  ProjectSummarySchema,
  ProvenanceLinkSchema,
  RunSummarySchema,
  SessionSummarySchema,
  WorkbenchCapabilitiesSchema,
} from "../../src/protocol/entities.js"
import { WORKBENCH_PROTOCOL_VERSION, isCompatible } from "../../src/protocol/version.js"

/** 进行中的 run：不带 finishedAt */
const baseRun = {
  runId: "r1",
  projectId: "p1",
  sessionId: "s1",
  origin: "agent" as const,
  requestType: "agent_turn",
  status: "running" as const,
  startedAt: "2026-08-08T00:00:00Z",
  hasError: false,
}

/** 已结束的 run：必须带 finishedAt */
const doneRun = { ...baseRun, status: "completed" as const, finishedAt: "2026-08-08T00:01:00Z" }

describe("协议版本", () => {
  it("形如 major.minor", () => {
    expect(WORKBENCH_PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/)
  })

  it("同 major、UI 的 minor 不高于服务端 → 兼容", () => {
    expect(isCompatible("1.0", "1.0")).toBe(true)
    expect(isCompatible("1.0", "1.3")).toBe(true) // 服务端更新，向后兼容
  })

  it("UI 的 minor 高于服务端 → 不兼容（UI 会用到服务端没有的字段）", () => {
    expect(isCompatible("1.5", "1.2")).toBe(false)
  })

  it("major 不同 → 不兼容", () => {
    expect(isCompatible("1.0", "2.0")).toBe(false)
    expect(isCompatible("2.0", "1.9")).toBe(false)
  })

  it("格式非法 → 不兼容，而不是抛错或放行", () => {
    expect(isCompatible("abc", "1.0")).toBe(false)
    expect(isCompatible("1", "1.0")).toBe(false)
  })
})

describe("RunSummary", () => {
  it("接受一条最小合法记录", () => {
    expect(RunSummarySchema.parse(baseRun).origin).toBe("agent")
    expect(RunSummarySchema.parse(doneRun).status).toBe("completed")
  })

  it("origin 只接受 user / agent / system", () => {
    for (const origin of ["user", "agent", "system"]) {
      expect(() => RunSummarySchema.parse({ ...baseRun, origin })).not.toThrow()
    }
    expect(() => RunSummarySchema.parse({ ...baseRun, origin: "robot" })).toThrow()
  })

  it("requestType 是开放字符串 —— ②-A 要加内核类型，不能写死枚举", () => {
    expect(() => RunSummarySchema.parse({ ...baseRun, requestType: "execute_r" })).not.toThrow()
    expect(() => RunSummarySchema.parse({ ...baseRun, requestType: "execute_py" })).not.toThrow()
    // 但不能是空串
    expect(() => RunSummarySchema.parse({ ...baseRun, requestType: "" })).toThrow()
  })

  it("parentRunId 可选，用于表达重跑与续跑链", () => {
    const r = RunSummarySchema.parse({ ...baseRun, parentRunId: "r0" })
    expect(r.parentRunId).toBe("r0")
    expect(RunSummarySchema.parse(baseRun).parentRunId).toBeUndefined()
  })

  it("status 只接受四种终态/进行态", () => {
    expect(() => RunSummarySchema.parse(baseRun)).not.toThrow() // running
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(() => RunSummarySchema.parse({ ...doneRun, status })).not.toThrow()
    }
    expect(() => RunSummarySchema.parse({ ...doneRun, status: "zombie" })).toThrow()
  })

  it("status 为 running 时不得带 finishedAt", () => {
    expect(() =>
      RunSummarySchema.parse({ ...baseRun, status: "running", finishedAt: "2026-08-08T00:01:00Z" }),
    ).toThrow(/finishedAt/)
  })

  it("status 为终态时必须带 finishedAt", () => {
    expect(() => RunSummarySchema.parse({ ...baseRun, status: "completed" })).toThrow(/finishedAt/)
    expect(() =>
      RunSummarySchema.parse({ ...baseRun, status: "completed", finishedAt: "2026-08-08T00:01:00Z" }),
    ).not.toThrow()
  })

  it("时间戳必须是 ISO 8601", () => {
    expect(() => RunSummarySchema.parse({ ...baseRun, startedAt: "昨天" })).toThrow()
  })
})

describe("Cost —— 不可见与零必须是两种东西", () => {
  // 计划 §2.4 的硬要求：PTY 会话用的是用户自有额度，我们拿不到成本。
  // 显示 0 是错的，会让人以为免费。用可辨识联合在类型层面强制区分。
  it("可见时携带 token 与金额", () => {
    const c = CostSchema.parse({
      visible: true,
      inputTokens: 100,
      outputTokens: 50,
      totalUSD: 0.000021,
    })
    expect(c.visible).toBe(true)
  })

  it("不可见时必须说明原因", () => {
    expect(() => CostSchema.parse({ visible: false })).toThrow()
    const c = CostSchema.parse({ visible: false, reason: "该 agent 使用自有额度" })
    expect(c.visible).toBe(false)
  })

  it("不可见时不得夹带金额 —— 防止 UI 误读", () => {
    expect(() =>
      CostSchema.parse({ visible: false, reason: "x", totalUSD: 0 }),
    ).toThrow()
  })

  it("token 数不得为负", () => {
    expect(() =>
      CostSchema.parse({ visible: true, inputTokens: -1, outputTokens: 0, totalUSD: 0 }),
    ).toThrow()
  })
})

describe("ProvenanceLink —— 完整性是一等公民", () => {
  const base = { resourceId: "a1", provenanceComplete: true }

  it("完整时可以不带原因", () => {
    expect(() => ProvenanceLinkSchema.parse(base)).not.toThrow()
  })

  it("不完整时必须写明原因 —— 不隐藏、不留白", () => {
    expect(() => ProvenanceLinkSchema.parse({ ...base, provenanceComplete: false })).toThrow(
      /incompleteReason/,
    )
    expect(() =>
      ProvenanceLinkSchema.parse({
        ...base,
        provenanceComplete: false,
        incompleteReason: "PTY agent 的内置工具不经过注入的 MCP",
      }),
    ).not.toThrow()
  })

  it("完整时不得同时给出不完整原因 —— 自相矛盾", () => {
    expect(() =>
      ProvenanceLinkSchema.parse({ ...base, provenanceComplete: true, incompleteReason: "x" }),
    ).toThrow()
  })

  it("原因不得是空串", () => {
    expect(() =>
      ProvenanceLinkSchema.parse({ ...base, provenanceComplete: false, incompleteReason: "  " }),
    ).toThrow()
  })
})

describe("FileChangeFacts —— 产出来自 git 事实", () => {
  it("必须显式声明是否可能混入用户手动修改", () => {
    expect(() =>
      FileChangeFactsSchema.parse({
        files: ["src/a.ts"],
        baselineHead: "abc123",
        computedAt: "2026-08-08T00:00:00Z",
      }),
    ).toThrow(/mayIncludeUserEdits/)
  })

  it("声明后可解析", () => {
    const f = FileChangeFactsSchema.parse({
      files: ["src/a.ts"],
      mayIncludeUserEdits: true,
      baselineHead: "abc123",
      computedAt: "2026-08-08T00:00:00Z",
    })
    expect(f.mayIncludeUserEdits).toBe(true)
  })

  it("空变更集合法（agent 什么都没改也是一个事实）", () => {
    expect(() =>
      FileChangeFactsSchema.parse({
        files: [],
        mayIncludeUserEdits: false,
        baselineHead: "abc123",
        computedAt: "2026-08-08T00:00:00Z",
      }),
    ).not.toThrow()
  })
})

describe("ProjectSummary", () => {
  const base = {
    projectId: "p1",
    name: "dawn-science",
    workspace: "/Users/x/dawn-science",
    createdAt: "2026-08-08T00:00:00Z",
    totalRunCount: 0,
    totalSessionCount: 0,
    unresolvedProblemCount: 0,
  }

  it("接受最小合法记录", () => {
    expect(ProjectSummarySchema.parse(base).name).toBe("dawn-science")
  })

  it("计数字段必须是非负整数", () => {
    expect(() => ProjectSummarySchema.parse({ ...base, totalRunCount: -1 })).toThrow()
    expect(() => ProjectSummarySchema.parse({ ...base, totalRunCount: 1.5 })).toThrow()
  })

  it("workspace 必须是绝对路径", () => {
    expect(() => ProjectSummarySchema.parse({ ...base, workspace: "relative/path" })).toThrow()
  })
})

describe("SessionSummary —— 与 ①-A 的 SessionRecord 对齐", () => {
  const base = {
    sessionId: "s1",
    projectId: "p1",
    agentId: "ds-chat",
    kind: "native" as const,
    state: "alive" as const,
    createdAt: "2026-08-08T00:00:00Z",
  }

  it("state 沿用 ①-A 的三态", () => {
    for (const state of ["starting", "alive", "exited"]) {
      expect(() => SessionSummarySchema.parse({ ...base, state })).not.toThrow()
    }
    expect(() => SessionSummarySchema.parse({ ...base, state: "paused" })).toThrow()
  })

  it("kind 只有 native 与 pty", () => {
    expect(() => SessionSummarySchema.parse({ ...base, kind: "acp" })).toThrow()
  })

  it("pid 与 exitCode 可选", () => {
    const s = SessionSummarySchema.parse({ ...base, pid: 42, exitCode: 0 })
    expect(s.pid).toBe(42)
    expect(SessionSummarySchema.parse(base).pid).toBeUndefined()
  })
})

describe("WorkbenchCapabilities", () => {
  it("握手信息完整", () => {
    const c = WorkbenchCapabilitiesSchema.parse({
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      operations: ["listProjects"],
      entityTypes: ["Project", "Run"],
      maxPageSize: 200,
      readOnly: false,
    })
    expect(c.workbenchProtocolVersion).toBe(WORKBENCH_PROTOCOL_VERSION)
  })

  it("版本号格式受校验", () => {
    expect(() =>
      WorkbenchCapabilitiesSchema.parse({
        workbenchProtocolVersion: "v1",
        operations: [],
        entityTypes: [],
        maxPageSize: 200,
        readOnly: true,
      }),
    ).toThrow()
  })
})
