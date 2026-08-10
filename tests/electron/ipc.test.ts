import { describe, expect, it } from "vitest"
import { IPC_CHANNEL, createIpcHandler } from "../../src/electron/ipc.js"
import { WorkbenchServer, type WorkbenchBackend } from "../../src/workbench/server.js"

function backend(): WorkbenchBackend {
  const project = {
    projectId: "p1", name: "x", workspace: "/w", createdAt: "2026-08-08T00:00:00Z",
    totalRunCount: 0, totalSessionCount: 0, unresolvedProblemCount: 0,
  }
  return {
    listProjects: async () => [project],
    getProviders: async () => ({ agents: [], providers: [] }),
    listCredentials: async () => ({ configured: [], encrypted: false }),
    setCredential: async () => ({}),
    deleteCredential: async () => ({}),
    getProject: async () => project,
    listSessions: async () => [],
    listRuns: async () => [],
    getRun: async () => ({
      runId: "r1", projectId: "p1", sessionId: "s1", origin: "agent" as const,
      requestType: "agent_turn", status: "running" as const,
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    }),
    getProvenance: async () => ({ resourceId: "a", provenanceComplete: true }),
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
      sessionId: "s1", currentHolder: null, requester: "user" as const,
      wouldPreempt: false, allowed: true,
    }),
    openProject: async () => project,
    createSession: async () => ({
      sessionId: "s1", projectId: "p1", agentId: "a", kind: "native" as const,
      pinned: false,
      sortOrder: 1,
      state: "alive" as const, createdAt: "2026-08-08T00:00:00Z",
    }),
    writeToSession: async () => ({}),
    stopSession: async () => ({}),
    listKernels: async () => ({ kernels: [], problems: [], shadowed: [] }),
    listVariables: async () => ({ supported: false as const, reason: "测试替身不提供变量" }),
    getInterpreters: async () => ({}),
    setInterpreter: async () => ({}),
    listDirectory: async () => ({ path: "", entries: [], ignored: 0, omitted: 0 }),
    readFile: async () => ({ kind: "other" as const, mediaType: "application/octet-stream", bytes: 0, reason: "测试替身不读文件" }),
    setProviderBaseUrl: async () => ({}),
    createAgent: async ({ agentId }) => ({ agentId }),
    reorderSessions: async () => ({ reordered: 0 }),
    renameSession: async () => ({}),
    setSessionPinned: async () => ({}),
    moveSession: async () => ({ moved: false }),
    getEnvironment: async () => ({ captured: false as const, reason: "测试替身没有环境快照" }),
    listKnownProviders: async () => ({ providers: [] }),
    deleteSession: async () => ({ ledgerKept: 0 }),
    deleteProject: async () => ({ sessionsDeleted: 0, runsDeleted: 0, workspace: "/tmp/ws" }),
    deletionImpact: async () => ({ sessions: 0, runs: 0, workspace: "/tmp/ws" }),
    openExternally: async () => ({}),
    acquireLease: async () => ({
      sessionId: "s1", holder: "user" as const,
      expiresAt: "2026-08-08T00:05:00Z", fingerprint: "abc",
    }),
  }
}

const handler = () => createIpcHandler(new WorkbenchServer(backend()))

describe("IPC 桥", () => {
  it("通道名固定且唯一 —— 单一入口，不靠开洞", () => {
    expect(IPC_CHANNEL).toBe("dawn:workbench:invoke")
  })

  it("正常请求原样转给服务端", async () => {
    const r = await handler()("listProjects", {})
    expect(r.ok).toBe(true)
  })

  it("非字符串的 operation 被挡下 —— 渲染进程送来的东西一律不可信", async () => {
    for (const bad of [42, null, undefined, {}, ["listProjects"]]) {
      const r = await handler()(bad, {})
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe("invalid_request")
    }
  })

  it("未知操作被服务端拒绝，桥不做额外判断", async () => {
    const r = await handler()("dropDatabase", {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("invalid_request")
  })

  it("requestId 透传", async () => {
    const r = await handler()("listProjects", {}, { requestId: "req-1" })
    expect(r.requestId).toBe("req-1")
  })

  it("桥不含业务逻辑：只读模式的拒绝由服务端做出", async () => {
    const h = createIpcHandler(new WorkbenchServer(backend(), { readOnly: true }))
    const r = await h("createSession", { projectId: "p1", agentId: "a" })
    expect(r.ok).toBe(false)
  })
})
