import { describe, expect, it } from "vitest"
import {
  DEFAULT_PAGE_SIZE,
  ErrorCodeSchema,
  MAX_PAGE_SIZE,
  OPERATIONS,
  PageInfoSchema,
  WorkbenchErrorSchema,
  WorkbenchSuccessSchema,
  isMutating,
  operationNames,
} from "../../src/protocol/operations.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/version.js"
import { ProjectSummarySchema } from "../../src/protocol/entities.js"

describe("操作注册表", () => {
  it("计划 §Task 2.2 冻结的 13 个操作齐全", () => {
    expect(operationNames().sort()).toEqual(
      [
        "acquireLease",
        "createSession",
        "getCapabilities",
        "getProject",
        "getProvenance",
        "getRun",
        "listProjects",
        "listRuns",
        "listSessions",
        "openProject",
        "previewTakeover",
        "stopSession",
        "writeToSession",
      ].sort(),
    )
  })

  it("每个操作都声明了请求与响应 schema", () => {
    for (const [name, op] of Object.entries(OPERATIONS)) {
      expect(op.request, `${name} 缺 request`).toBeDefined()
      expect(op.response, `${name} 缺 response`).toBeDefined()
    }
  })

  it("读写分明：只读操作不得标为 mutating", () => {
    for (const name of ["getCapabilities", "listProjects", "getProject", "listSessions", "listRuns", "getRun", "getProvenance", "previewTakeover"]) {
      expect(isMutating(name), `${name} 应为只读`).toBe(false)
    }
    for (const name of ["openProject", "createSession", "writeToSession", "stopSession", "acquireLease"]) {
      expect(isMutating(name), `${name} 应为可写`).toBe(true)
    }
  })

  it("previewTakeover 是只读 —— 预览不得改变状态（规格 7.1）", () => {
    expect(isMutating("previewTakeover")).toBe(false)
  })

  it("未知操作名 isMutating 抛错，而不是默认当成只读", () => {
    expect(() => isMutating("dropDatabase")).toThrow(/dropDatabase/)
  })
})

describe("请求校验", () => {
  it("listRuns 接受分页参数", () => {
    const r = OPERATIONS.listRuns.request.parse({ projectId: "p1", pageSize: 10 })
    expect(r.pageSize).toBe(10)
  })

  it("pageSize 缺省为 DEFAULT_PAGE_SIZE", () => {
    expect(OPERATIONS.listRuns.request.parse({ projectId: "p1" }).pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it("pageSize 不得超过 MAX_PAGE_SIZE —— 客户端不能请求无限结果", () => {
    expect(() =>
      OPERATIONS.listRuns.request.parse({ projectId: "p1", pageSize: MAX_PAGE_SIZE + 1 }),
    ).toThrow()
  })

  it("openProject 要求绝对路径", () => {
    expect(() => OPERATIONS.openProject.request.parse({ workspace: "rel/path" })).toThrow()
    expect(() =>
      OPERATIONS.openProject.request.parse({ workspace: "/abs/path" }),
    ).not.toThrow()
  })

  it("writeToSession 要求写权持有者身份 —— 不能匿名写", () => {
    expect(() =>
      OPERATIONS.writeToSession.request.parse({ sessionId: "s1", data: "hi" }),
    ).toThrow()
    expect(() =>
      OPERATIONS.writeToSession.request.parse({ sessionId: "s1", data: "hi", as: "user" }),
    ).not.toThrow()
  })

  it("getCapabilities 不需要参数", () => {
    expect(() => OPERATIONS.getCapabilities.request.parse({})).not.toThrow()
  })
})

describe("成功信封", () => {
  const S = WorkbenchSuccessSchema(ProjectSummarySchema)
  const project = {
    projectId: "p1",
    name: "x",
    workspace: "/w",
    createdAt: "2026-08-08T00:00:00Z",
    totalRunCount: 0,
    totalSessionCount: 0,
    unresolvedProblemCount: 0,
  }

  it("每个响应都带协议版本 —— 过期的 UI 在任何一次调用上都能察觉，不只握手时", () => {
    const r = S.parse({ ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: project })
    expect(r.workbenchProtocolVersion).toBe(WORKBENCH_PROTOCOL_VERSION)
  })

  it("ok 必须是字面量 true —— 与错误信封可辨识", () => {
    expect(() =>
      S.parse({ ok: false, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: project }),
    ).toThrow()
  })

  it("data 也过一遍 schema —— 双向校验，服务端返回错结构同样被拒", () => {
    expect(() =>
      S.parse({
        ok: true,
        workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
        data: { ...project, totalRunCount: -1 },
      }),
    ).toThrow()
  })

  it("warnings 缺省为空数组 —— 非致命问题要有地方说，不能吞掉", () => {
    const r = S.parse({ ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: project })
    expect(r.warnings).toEqual([])
  })
})

describe("错误信封", () => {
  const base = {
    ok: false as const,
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    error: { code: "not_found" as const, message: "没找到", retryable: false },
  }

  it("接受一条最小合法错误", () => {
    expect(WorkbenchErrorSchema.parse(base).error.code).toBe("not_found")
  })

  it("错误码是封闭集合", () => {
    expect(() =>
      WorkbenchErrorSchema.parse({ ...base, error: { ...base.error, code: "oops" } }),
    ).toThrow()
  })

  it("retryable 必填 —— 客户端要据此决定重试，不能靠猜", () => {
    expect(() =>
      WorkbenchErrorSchema.parse({ ...base, error: { code: "internal_error", message: "x" } }),
    ).toThrow(/retryable/)
  })

  it("message 不得为空串", () => {
    expect(() =>
      WorkbenchErrorSchema.parse({ ...base, error: { ...base.error, message: "  " } }),
    ).toThrow()
  })

  it("覆盖 Rho 采纳的错误码，外加租约冲突与请求非法", () => {
    for (const code of [
      "not_found",
      "invalid_request",
      "conflict",
      "internal_error",
      "unsupported_protocol_version",
      "page_size_exceeded",
      "invalid_cursor",
      "project_unavailable",
      "size_limit_exceeded",
    ]) {
      expect(() => ErrorCodeSchema.parse(code)).not.toThrow()
    }
  })
})

describe("分页信息", () => {
  it("hasMore 与 pageSize 必填", () => {
    expect(() => PageInfoSchema.parse({ hasMore: false })).toThrow()
    expect(() => PageInfoSchema.parse({ hasMore: false, pageSize: 50 })).not.toThrow()
  })

  it("totalCount 可选 —— 有些查询算总数代价过高", () => {
    const p = PageInfoSchema.parse({ hasMore: true, pageSize: 50 })
    expect(p.totalCount).toBeUndefined()
  })

  it("上限常量符合 Rho 的取值", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50)
    expect(MAX_PAGE_SIZE).toBe(200)
  })
})
