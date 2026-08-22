import { describe, expect, it } from "vitest"
import { WorkbenchServer, fault, type WorkbenchBackend } from "../../src/workbench/server.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"

/** 一段够用的假会话 */
const 假会话 = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "a",
  kind: "native" as const,
  state: "alive" as const,
  pinned: false,
  sortOrder: 1,
  createdAt: "2026-08-08T00:00:00Z",
}

/** 一个够用的假任务。**没有 workspace**——那正是「普通对话」 */
const 假任务 = {
  taskId: "t1",
  pinned: false,
  sortOrder: 1,
  createdAt: "2026-08-12T00:00:00Z",
}

/** 一台够用的假服务器。**没有 secret 字段**——响应里本来就不该有 */
const 假连接 = {
  id: "c1",
  label: "实验室",
  host: "h",
  port: 22,
  username: "u",
  hasSecret: false,
  sortOrder: 1,
  createdAt: "2026-08-08T00:00:00Z",
  state: { kind: "idle" as const },
}

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
    openProject: async () => project,
    // 批 4a 新增的五个（这份桩要覆盖全协议）
    // 视觉服务的三个（协议 7.12）
    getVision: async () => ({ enabled: false, api: "openai-completions", hasSecret: false, ready: false }),
    saveVision: async () => ({ ready: false }),
    testVision: async () => ({ ok: false, text: "桩" }),
    getDownloadDir: async () => ({ path: "/下载", isDefault: true }),
    setDownloadDir: async () => ({ path: "/下载", isDefault: true }),
    startDownload: async () => ({ transferId: "t1", name: "x", target: "/下载/x" }),
    startUpload: async () => ({ kind: "started" as const, transferId: "t1", target: "/远端/x" }),
    deletePath: async () => ({ trashed: true }),
    pathInfo: async () => ({ directory: false, files: 1, bytes: 0, counted: "complete" as const }),
    reviewChanges: async () => ({ baseline: "head" as const, mayIncludeUserEdits: true, tracked: [], produced: [] }),
    fileDiff: async () => ({ diff: "" }),
    transferStatus: async () => ({ transferred: 0, state: "running" as const }),
    cancelTransfer: async () => ({}),
    getProviders: async () => ({ agents: [], providers: [] }),
    listCredentials: async () => ({ configured: [], encrypted: false }),
    setCredential: async () => ({}),
    deleteCredential: async () => ({}),
    listSessions: async () => [],
    // S21：新增操作必须同时补上假后端
    answerPermission: async () => ({}),
    setSessionConfigOption: async () => ({}),
    getUsage: async () => ({
      total: 0, input: 0, output: 0, cacheRead: 0,
      daily: [], byModel: [], activeDays: 0,
      streak: { current: 0, longest: 0 },
      unattributed: { runs: 0, tokens: 0 },
    }),
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
    writeToSession: async () => ({}),
    stopSession: async () => ({}),
    listKernels: async () => ({ kernels: [], problems: [], shadowed: [] }),
    listVariables: async () => ({ supported: false as const, reason: "测试替身不提供变量" }),
    getInterpreters: async () => ({}),
    setInterpreter: async () => ({}),
    listDirectory: async () => ({ path: "", entries: [], ignored: 0, omitted: 0 }),
    readFile: async () => ({ kind: "other" as const, mediaType: "application/octet-stream", bytes: 0, reason: "测试替身不读文件" }),
    setProviderConnection: async () => ({}),
    createTerminalSession: async () => ({}) as never,
    listTemporarySessions: async () => [],

    reorderSessions: async () => ({ reordered: 0 }),
    renameSession: async () => ({}),
    setSessionPinned: async () => ({}),
    moveSession: async () => ({ moved: false }),
    getEnvironment: async () => ({ captured: false as const, reason: "测试替身没有环境快照" }),
    listKnownProviders: async () => ({ providers: [] }),
    deleteSession: async () => ({ ledgerKept: 0, transcriptTrashed: false }),
    deleteProject: async () => ({ sessionsDeleted: 0, runsDeleted: 0, workspace: "/tmp/ws" }),
    deletionImpact: async () => ({ sessions: 0, runs: 0, workspace: "/tmp/ws" }),
    openExternally: async () => ({}),
    listTasks: async () => [],
    createTask: async () => 假任务,
    setTaskWorkspace: async () => 假任务,
    deleteTask: async () => ({ ledgerKept: 0 }),
    listSubagents: async () => ({ agents: [], problems: [], dir: "/w/.dawn/agents", dirs: {} }),
    listAgentSkills: async () => ({ skills: [], problems: [], dirs: {} }),
    listMcpServers: async () => ({ servers: [], problems: [] }),
    saveMcpServer: async () => ({ name: "x", needsSecrets: [] }),
    removeMcpServer: async () => ({ ok: true as const }),
    addAcpAgent: async () => ({ agentId: "codex-acp" }),
    removeAgent: async () => ({ ok: true as const }),
    setAcpRemoteCapable: async () => ({ ok: true as const }),
    weixinGetStatus: async () => ({ state: "unbound" as const, contactName: "DAWN-Science" }),
    weixinStartLogin: async () => ({ ok: true as const }),
    weixinSubmitCode: async () => ({ ok: true as const }),
    weixinCancelLogin: async () => ({ ok: true as const }),
    weixinUnbind: async () => ({ ok: true as const }),
    weixinBindSession: async () => ({ ok: true as const }),
    weixinGetNotify: async () => ({ done: true, error: true, permission: true, quietWhenFocused: true }),
    weixinSetNotify: async () => ({ done: true, error: true, permission: true, quietWhenFocused: true }),
    enhancePrompt: async () => ({ text: "", usedContext: null, model: "x" }),
    cancelEnhance: async () => ({ ok: true as const }),
    searchFiles: async () => ({ matches: [], visited: 0, skippedDirs: 0, unreadable: 0 }),
    setSkillInvocation: async () => ({ mode: "model" as const }),
    importSkill: async () => ({ kind: "single" as const, pending: [], conflicts: [], imported: [], skipped: [], failed: [] }),
    deleteSkill: async () => ({ trashed: true as const }),
    setSessionArchived: async () => ({}),
    listArchivedSessions: async () => ({ sessions: [] }),
    deleteArchivedSessions: async () => ({ deleted: 0, transcriptsTrashed: 0, problems: [] }),
    listSchedules: async () => ({ schedules: [] }),
    createSchedule: async () => { throw new Error("stub") },
    updateSchedule: async () => { throw new Error("stub") },
    deleteSchedule: async () => ({}),
    runScheduleNow: async () => { throw new Error("stub") },
    listScheduleRuns: async () => ({ runs: [] }),
    setSubagentEnabled: async () => ({ enabled: true }),
    importSubagents: async () => ({ pending: [], conflicts: [], imported: [], skipped: [], failed: [] }),
    deleteSubagent: async () => ({ trashed: true as const }),

    testMcpServer: async () => ({ ok: false, error: "替身不连真服务器", tools: [] }),
    setMcpFlag: async () => ({ ok: true as const }),
    setMcpSecret: async () => ({ ok: true as const }),

    initScienceLayout: async () => ({ created: [], instructions: "written" as const, file: "AGENTS.md" }),
    getPermissionMode: async () => ({ mode: "allow-all" as const }),
    setPermissionMode: async () => ({ mode: "deny-risky" as const }),
    getDefaultWorkspace: async () => ({ path: "/w", isDefault: true }),
    setDefaultWorkspace: async () => ({ path: "/w", isDefault: true }),
    listConnections: async () => [],
    createRemoteSession: async () => 假会话,
    saveConnection: async () => 假连接,
    removeConnection: async () => ({}),
    connectRemote: async () => 假连接,
    disconnectRemote: async () => 假连接,
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
    // createTask 要求 agentId 非空
    const r = await new WorkbenchServer(backend()).handle("createTask", { agentId: "" })
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
      listDirectory: async () => {
        throw fault("not_found", "项目不存在")
      },
    })
    const r = await new WorkbenchServer(bad).handle("listDirectory", { projectId: "nope", path: "." })
    if (!r.ok) {
      expect(r.error.code).toBe("not_found")
      expect(r.error.message).toContain("项目不存在")
    }
  })
})

describe("WorkbenchServer · 只读模式", () => {
  it("只读模式下可写操作被拒", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    const r = await s.handle("createTask", { agentId: "a" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("invalid_request")
  })

  it("只读模式下只读操作照常放行", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    expect((await s.handle("listProjects", {})).ok).toBe(true)
  })

  /**
   * **判据是「标没标 mutating」，不是名字听起来像不像**（T4 换的主语）。
   *
   * 原来这条挂在 `previewTakeover` 上，那个操作在协议 5.0 里摘掉了。
   * 换成 `deletionImpact`——它守的是同一件事，而且更值钱：
   * **名字里带「删除」，却只是算一算影响面**。真按名字猜的话它会被拦下，
   * 那时「只读模式」就成了「凡是听着吓人的都不许」。
   */
  it("只读模式下 deletionImpact 放行 —— 名字吓人，它是只读的", async () => {
    const s = new WorkbenchServer(backend(), { readOnly: true })
    const r = await s.handle("deletionImpact", { projectId: "p1" })
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
