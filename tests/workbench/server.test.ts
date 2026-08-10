import { describe, expect, it } from "vitest"
import { WorkbenchServer, type WorkbenchBackend } from "../../src/workbench/server.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"

const project = {
  projectId: "p1",
  name: "x",
  workspace: "/w",
  createdAt: "2026-08-08T00:00:00Z",
  totalRunCount: 0,
  totalSessionCount: 0,
  unresolvedProblemCount: 0,
}

/** getCapabilities 不在后端接口里——它由服务端自答，见 server.ts 的注释 */
function backend(over: Partial<WorkbenchBackend> = {}): WorkbenchBackend {
  return {
    listProjects: async () => [project],
    getProviders: async () => ({ agents: [], providers: [] }),
    listCredentials: async () => ({ configured: [], encrypted: false }),
    setCredential: async () => ({}),
    deleteCredential: async () => ({}),
    getProject: async () => project,
    listSessions: async () => [],
    listRuns: async () => [],
    getRun: async () => {
      throw new Error("未实现")
    },
    getProvenance: async () => ({ resourceId: "a1", provenanceComplete: true }),
    subscribeSession: async () => ({
      sessionId: "s1", kind: "native" as const, revision: 0, items: [],
      terminal: "", terminalTrimmed: false, state: "alive" as const,
    }),
    unsubscribeSession: async () => ({}),
    abortSession: async () => ({}),
    setSessionModel: async () => ({}),
    getContextUsage: async () => ({ bytes: { system: 0, tools: 0, history: 0 } }),
    steerSession: async () => ({}),
    previewTakeover: async () => ({
      sessionId: "s1",
      currentHolder: null,
      requester: "user" as const,
      wouldPreempt: false,
      allowed: true,
    }),
    openProject: async () => project,
    createSession: async () => ({
      sessionId: "s1",
      projectId: "p1",
      agentId: "a",
      kind: "native" as const,
      state: "alive" as const,
      createdAt: "2026-08-08T00:00:00Z",
    }),
    writeToSession: async () => ({}),
    stopSession: async () => ({}),
    listKernels: async () => ({ kernels: [], problems: [], shadowed: [] }),
    listVariables: async () => ({ supported: false as const, reason: "测试替身不提供变量" }),
    getInterpreters: async () => ({}),
    setInterpreter: async () => ({}),
    listDirectory: async () => ({ path: "", entries: [], ignored: 0, omitted: 0 }),
    readFile: async () => ({ kind: "other" as const, mediaType: "application/octet-stream", bytes: 0, reason: "测试替身不读文件" }),
    openExternally: async () => ({}),
    acquireLease: async () => ({
      sessionId: "s1",
      holder: "user" as const,
      expiresAt: "2026-08-08T00:05:00Z",
      fingerprint: "abc",
    }),
    ...over,
  }
}

describe("WorkbenchServer · 派发", () => {
  it("成功响应带 ok=true、协议版本与默认空 warnings", async () => {
    const r = await new WorkbenchServer(backend()).handle("listProjects", {})
    expect(r.ok).toBe(true)
    expect(r.workbenchProtocolVersion).toBe(WORKBENCH_PROTOCOL_VERSION)
    if (r.ok) expect(r.warnings).toEqual([])
  })

  it("未知操作返回 invalid_request，而不是抛错", async () => {
    const r = await new WorkbenchServer(backend()).handle("dropDatabase", {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe("invalid_request")
      expect(r.error.message).toContain("dropDatabase")
      expect(r.error.retryable).toBe(false)
    }
  })

  it("请求不合 schema 被拒，且带定位信息", async () => {
    // openProject 要求绝对路径
    const r = await new WorkbenchServer(backend()).handle("openProject", { workspace: "rel" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe("invalid_request")
      expect(r.error.details).toBeDefined()
    }
  })

  it("requestId 原样透传，便于把请求与响应对上", async () => {
    const r = await new WorkbenchServer(backend()).handle("listProjects", {}, { requestId: "req-7" })
    expect(r.requestId).toBe("req-7")
  })

  it("错误响应同样带协议版本 —— 版本漂移在失败路径上也能察觉", async () => {
    const r = await new WorkbenchServer(backend()).handle("nope", {})
    expect(r.workbenchProtocolVersion).toBe(WORKBENCH_PROTOCOL_VERSION)
  })
})

describe("WorkbenchServer · 双向校验", () => {
  it("后端返回不合 schema 的数据 → internal_error，不漏给 UI", async () => {
    const bad = backend({
      // totalRunCount 为负，违反实体 schema
      listProjects: async () => [{ ...project, totalRunCount: -1 }] as never,
    })
    const r = await new WorkbenchServer(bad).handle("listProjects", {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("internal_error")
  })

  it("双向校验拦下的是服务端的错，故不可重试", async () => {
    const bad = backend({ listProjects: async () => [{ ...project, totalRunCount: -1 }] as never })
    const r = await new WorkbenchServer(bad).handle("listProjects", {})
    if (!r.ok) expect(r.error.retryable).toBe(false)
  })
})

describe("WorkbenchServer · 后端异常", () => {
  it("后端抛错 → internal_error", async () => {
    const r = await new WorkbenchServer(backend()).handle("getRun", { runId: "r1" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("internal_error")
  })

  it("不向客户端泄露内部细节 —— 堆栈与原始消息只进日志", async () => {
    const bad = backend({
      listProjects: async () => {
        throw new Error("数据库密码是 hunter2")
      },
    })
    const r = await new WorkbenchServer(bad).handle("listProjects", {})
    if (!r.ok) {
      expect(r.error.message).not.toContain("hunter2")
      expect(JSON.stringify(r.error.details ?? {})).not.toContain("hunter2")
    }
  })

  it("后端抛出的 WorkbenchFault 保留其错误码 —— 业务性失败不该被压成 internal", async () => {
    const bad = backend({
      getProject: async () => {
        throw Object.assign(new Error("项目不存在"), { workbenchCode: "not_found" })
      },
    })
    const r = await new WorkbenchServer(bad).handle("getProject", { projectId: "nope" })
    if (!r.ok) {
      expect(r.error.code).toBe("not_found")
      expect(r.error.message).toContain("项目不存在")
    }
  })
})

describe("WorkbenchServer · 只读模式", () => {
  it("只读模式下可写操作被拒", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    const r = await s.handle("createSession", { projectId: "p1", agentId: "a" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("invalid_request")
  })

  it("只读模式下只读操作照常放行", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    expect((await s.handle("listProjects", {})).ok).toBe(true)
  })

  it("只读模式下 previewTakeover 放行 —— 它是只读的", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    const r = await s.handle("previewTakeover", { sessionId: "s1", requester: "user" })
    expect(r.ok).toBe(true)
  })
})

describe("WorkbenchServer · 握手", () => {
  it("getCapabilities 报告的版本与本地常量一致", async () => {
    const r = await new WorkbenchServer(backend()).handle("getCapabilities", {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { workbenchProtocolVersion: string }).workbenchProtocolVersion).toBe(
        WORKBENCH_PROTOCOL_VERSION,
      )
    }
  })

  it("readOnly 标志如实反映服务端配置", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    const r = await s.handle("getCapabilities", {})
    if (r.ok) expect((r.data as { readOnly: boolean }).readOnly).toBe(true)
  })
})
