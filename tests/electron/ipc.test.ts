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
    openProject: async () => project,
    // 批 4a 新增的五个（这份桩要覆盖全协议，少一个就编译不过）
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
    listRuns: async () => [],
    getRun: async () => ({
      runId: "r1", projectId: "p1", sessionId: "s1", origin: "agent" as const,
      requestType: "agent_turn", status: "running" as const,
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    }),
    getProvenance: async () => ({ resourceId: "a", provenanceComplete: true }),
    listArtifacts: async () => ({ artifacts: [], unknown: [] }),
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
    // 笔记本（2026-08-26）：这份桩要覆盖全协议，少一个就编译不过
    runInKernel: async () => ({ cellId: "cell-1" }),
    interruptKernel: async () => ({}),
    fakeSshControl: async () => ({ count: 0 }),
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
    listPlugins: async () => ({ plugins: [] }),
    setPluginFlag: async () => ({ on: true }),
    browserObserve: async () => ({ open: false, channel: "", activeUrl: "", activeTitle: "", tabs: 0, history: [] }),
    browserFrame: async () => ({ png: "aGk=" }),
    feishuGetStatus: async () => ({ state: "unbound", contactName: "DAWN-Science" }),
    feishuStartLogin: async () => ({ ok: true }),
    feishuCancelLogin: async () => ({ ok: true }),
    feishuUnbind: async () => ({ ok: true }),
    feishuBindSession: async () => ({ ok: true }),
    feishuGetNotify: async () => ({ done: true, error: true, permission: true, quietWhenFocused: true }),
    feishuSetNotify: async () => ({ done: true, error: true, permission: true, quietWhenFocused: true }),
    memoryOverview: async () => ({ pending: 0, tracks: [] }),
    memorySuggestions: async () => ({ suggestions: [], pendingSkills: [] }),
    memoryResolve: async () => ({ ok: true, message: "桩" }),
    memoryEntries: async () => ({ entries: [] }),
    memoryWrite: async () => ({ ok: true, message: "桩" }),
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
    exportSession: async () => ({ path: "/x.md", turns: 0 }),
    exportNotebook: async () => ({ path: "/x.ipynb", cells: 0 }),
    probeInterpreters: async () => ({ python: [], r: [] }),

    testMcpServer: async () => ({ ok: false, error: "替身不连真服务器", tools: [] }),
    setMcpFlag: async () => ({ ok: true as const }),
    setMcpSecret: async () => ({ ok: true as const }),

    initScienceLayout: async () => ({ created: [], instructions: "written" as const, file: "AGENTS.md" }),
    getPermissionMode: async () => ({ mode: "allow-all" as const }),
    getAtFileSettings: async () => ({ ignorePasted: true, globalRules: [] }),
    setAtFileSettings: async () => ({ ignorePasted: true, globalRules: [] }),
    setPermissionMode: async () => ({ mode: "deny-risky" as const }),
    getDefaultWorkspace: async () => ({ path: "/w", isDefault: true }),
    setDefaultWorkspace: async () => ({ path: "/w", isDefault: true }),
    listConnections: async () => [],
    createRemoteSession: async () => 假会话,
    saveConnection: async () => 假连接,
    removeConnection: async () => ({}),
    connectRemote: async () => 假连接,
    disconnectRemote: async () => 假连接,
    setRemoteInterpreter: async () => 假连接,
    acquireLease: async () => ({
      sessionId: "s1", holder: "user" as const,
      expiresAt: "2026-08-08T00:05:00Z", fingerprint: "abc",
    }),
    // S21：新增操作必须同时补上假后端，否则这里与真契约会各走各的
    answerPermission: async () => ({}),
    setSessionConfigOption: async () => ({}),
    getUsage: async () => ({
      total: 0, input: 0, output: 0, cacheRead: 0,
      daily: [], byModel: [], activeDays: 0,
      streak: { current: 0, longest: 0 },
      unattributed: { runs: 0, tokens: 0 },
    }),
  }
}

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
    const r = await h("createTask", { agentId: "a" })
    expect(r.ok).toBe(false)
  })
})
