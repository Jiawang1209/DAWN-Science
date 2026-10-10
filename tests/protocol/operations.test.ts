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
import { ProjectSummarySchema, RemoteConnectionSchema } from "../../src/protocol/entities.js"

describe("操作注册表", () => {
  it("操作齐全（含 ACP 模型目录，… + 远端连接 5 + 远端会话 1 + 任务 4 + 技能 1 + 默认工作目录 2 + 权限 2 + MCP 6 + 视觉 3 + 用量 1 + ACP 权限 1 + ACP 开关 1 + ACP 适配器 3 + 下载目录 2 + 传输 3 + 微信 8 + 增强 2 + 文件搜索 1 + 技能管理 3 + 归档 3 + 定时 6 + 子 agent 名册 3 + 导出 1 + @ 引用设置 2 + 插件 2 + 浏览器旁观 2 + 记忆 5 + 飞书 7 + 产物 1 + 笔记本 2 + 远程内核 1 + 假服务器开关 1 + 应用内更新 6 + 本机取图 1 + 待发 1 + 侧边 1 + 压缩 1 + 回退 2 + 子 agent 看得见 2 + 桌面通知 4 + 全文搜索 1 + 先出方案 1 + 模型服务测试 1）", () => {
    expect(operationNames().sort()).toEqual(
      [
        "getAcpModels",
        "setRemoteInterpreter",
        "checkUpdate",
        "getUpdateState",
        "setUpdatePrefs",
        "downloadUpdate",
        "cancelUpdate",
        "applyUpdate",
        "fetchLocalImage",
        "editQueue",
        "answerPlan",
        "answerQuestion",
        "setSideSession",
        "compactSession",
        "previewRewind",
        "rewindTurn",
        "openSubagent",
        "askSubagent",
        "acquireLease",
        "listArtifacts",
        "runInKernel",
        "interruptKernel",
        "fakeSshControl",
        "openProject",
        "addAcpAgent",
        "removeAgent",
        "setAcpRemoteCapable",
        "suggestNextPrompt",
        "enhancePrompt",
        "cancelEnhance",
        "weixinBindSession",
        "weixinCancelLogin",
        "weixinGetNotify",
        "weixinGetStatus",
        "weixinSetNotify",
        "weixinStartLogin",
        "weixinSubmitCode",
        "weixinUnbind",
        "getDownloadDir",
        "setDownloadDir",
        "startDownload",
        "startUpload",
        "deletePath",
        "deleteSkill",
        "pathInfo",
        "reviewChanges",
        "fileDiff",
        "transferStatus",
        "cancelTransfer",
        "answerPermission",
        "setSessionConfigOption",
        "getUsage",
        "connectRemote",
        "createRemoteSession",
        "createSchedule",
        "createTask",
        "deleteTask",
        "listSubagents",
        "listAgentSkills",
        "listArchivedSessions",
        "listMcpServers",
        "testMcpServer",
        "setMcpFlag",
        "setMcpSecret",
        "saveMcpServer",
        "removeMcpServer",
        "getVision",
        "importSkill",
        "saveVision",
        "searchFiles",
        "testVision",
        "testProviderKey",
        "getDefaultWorkspace",
        "setDefaultWorkspace",
        "setPluginFlag",
        "browserObserve",
        "browserFrame",
        "feishuGetStatus",
        "feishuStartLogin",
        "feishuCancelLogin",
        "feishuUnbind",
        "feishuBindSession",
        "feishuGetNotify",
        "feishuSetNotify",
        "desktopGetNotify",
        "desktopSetNotify",
        "desktopTestNotify",
        "takePendingOpenSession",
        "searchSessionContent",
        "memoryOverview",
        "memorySuggestions",
        "memoryResolve",
        "memoryEntries",
        "memoryWrite",
        "setSkillInvocation",
        "setSubagentEnabled",
        "importSubagents",
        "deleteSubagent",
        "exportSession",
        "exportNotebook",
        "probeInterpreters",
        "getAtFileSettings",
        "setAtFileSettings",
        "updateSchedule",
        "listTasks",
        "setTaskWorkspace",
        "createTerminalSession",
        "disconnectRemote",
        "listTemporarySessions",
        "deleteCredential",
        "deleteArchivedSessions",
        "deleteProject",
        "deleteSchedule",
        "deleteSession",
        "deletionImpact",
        "listConnections",
        "runScheduleNow",
        "saveConnection",
        "removeConnection",
        "listCredentials",
        "listDirectory",
        "listKernels",
        "listKnownProviders",
        "listVariables",
        "setCredential",
        "setInterpreter",
        "setProviderConnection",
        "setSessionModel",
        "setSessionArchived",
        "setSessionPinned",
        "initScienceLayout",
        "getPermissionMode",
        "setPermissionMode",
        "getCapabilities",
        "getContextUsage",
        "getEnvironment",
        "getInterpreters",
        "getProvenance",
        "getProviders",
        "getRun",
        "listPlugins",
        "listProjects",
        "listRuns",
        "listScheduleRuns",
        "listSchedules",
        "listSessions",
        "moveSession",
        "openExternally",
        "readFile",
        "renameSession",
        "reorderSessions",
        "stopSession",
        "subscribeSession",
        "unsubscribeSession",
        "abortSession",
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
    for (const name of ["getCapabilities", "listProjects", "listSessions", "listRuns", "getRun", "getProvenance", "listArtifacts", "deletionImpact", "listDirectory", "listCredentials", "getProviders", "listTemporarySessions", "getPermissionMode"]) {
      expect(isMutating(name), `${name} 应为只读`).toBe(false)
    }
    for (const name of ["createTask", "setTaskWorkspace", "deleteTask", "setPermissionMode", "initScienceLayout",
        "createTerminalSession", "writeToSession", "stopSession", "acquireLease", "setCredential", "deleteCredential",
        "runInKernel", "interruptKernel"]) {
      expect(isMutating(name), `${name} 应为可写`).toBe(true)
    }
  })

  /**
   * **主语换了，规格 7.1 那条没换**（T4，2026-08-13）。
   *
   * 原来挂在 `previewTakeover` 上，那个操作已经不在协议里了。
   * `deletionImpact` 接得住同一条：**名字里带「删除」，做的只是算一算影响面**。
   * 它比原来那条更该被守住——按名字猜的人最容易把它标成可写。
   */
  it("deletionImpact 是只读 —— 预览不得改变状态（规格 7.1）", () => {
    expect(isMutating("deletionImpact")).toBe(false)
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

  /**
   * **T4（协议 5.0）：七个旧操作摘掉了。**
   *
   * 任务模型之后「开一段对话」只有一个动作（`createTask`），
   * 工作目录在开口之前选。这几个是它之前的形状，**界面上早就没有入口了**。
   *
   * 这条从「它长什么样」改成「它不该还在」——**删除也要有判据**，
   * 否则下一个人「顺手」把它加回来时没有任何东西会响。
   *
   * ---
   *
   * ## `openProject` 2026-08-19 回来了——**这是翻面，不是这条判据失效**
   *
   * **它当场拦住了我**，而且拦得对：我正是那个「顺手加回来」的人。
   * 所以这里不是把它从名单上划掉了事，两边的理由都留着：
   *
   * - **T4 摘它的理由**：那时它是**开会话那条路的一环**
   *   （开项目 → 在项目里建会话）。任务模型之后那条路只剩 `createTask` 一个入口，
   *   而它没有界面入口，留着就是一个说不清归谁用的操作。
   * - **现在加它的理由**：作者要*「选择文件夹后，立刻进入项目，文件tree也转入」*。
   *   本地列目录**必须给 projectId**（路径相对工作区，绝对路径被守卫拒），
   *   于是「文件树跟着走」需要一个「把文件夹认成项目」的动作——
   *   **而它明确不建任何会话**，与 T4 摘掉的那个用途正好是两件事。
   *
   * 名字沿用旧的，因为**它确实就是那件事**（把文件夹认成项目）；
   * 换个名字只会让人以为是两个东西。
   */
  it("**旧的会话入口不在协议里了**（T4；`openProject` 见上，2026-08-19 翻面）", () => {
    for (const 死的 of [
      "createSession",
      "createTemporarySession",
      "getProject",
      "previewTakeover",
      "steerSession",
      "createAgent",
    ]) {
      expect(operationNames(), `${死的} 又回来了`).not.toContain(死的)
    }
    /**
     * **回来的这个必须仍然是「只认领、不建会话」那一个。**
     * 它一旦长出 `agentId` 之类的参数，就是 T4 摘掉的那个又回来了。
     */
    expect(Object.keys(OPERATIONS.openProject.request.shape ?? {})).toEqual(["workspace"])
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

describe("readFile 按 sessionId（7.25）", () => {
  const S = OPERATIONS.readFile.request
  it("projectId / connectionId / sessionId 三选一", () => {
    expect(S.safeParse({ sessionId: "s", path: "a.csv" }).success).toBe(true)
    expect(S.safeParse({ sessionId: "s", projectId: "p", path: "a.csv" }).success).toBe(false)
    expect(S.safeParse({ path: "a.csv" }).success).toBe(false)
  })
})

describe("listArtifacts（产物，7.24）", () => {
  it("请求只要 sessionId；响应带 artifacts 与 unknown", () => {
    const op = OPERATIONS.listArtifacts
    expect(op.mutating).toBe(false)
    expect(op.request.safeParse({ sessionId: "s1" }).success).toBe(true)
    expect(op.request.safeParse({}).success).toBe(false)
    const ok = op.response.safeParse({
      artifacts: [{ path: "outputs/a.csv", kind: "table", bornRunId: "r1", bornToolCallId: "c1", bornAt: "2026-08-26T10:00:00.000Z", exists: true }],
      unknown: [{ runId: "r2", toolCallId: "c2" }],
    })
    expect(ok.success).toBe(true)
    // exists 缺省 = 不知道（远端查不了），允许
    expect(op.response.safeParse({ artifacts: [{ path: "x", kind: "other", bornRunId: "r", bornAt: "2026-08-26T10:00:00.000Z" }], unknown: [] }).success).toBe(true)
  })
})

/**
 * `runInKernel` / `interruptKernel`（笔记本，2026-08-26）：你在对话挂着的内核里
 * 自己敲一段、或掐掉正在跑的那一段。两个都是可写操作。
 *
 * `listVariables.request` 顺带加一个可选 `language`——普通对话挂着多台内核时
 * 指定看哪台；缺省由后端取第一台。
 */
describe("runInKernel / interruptKernel（笔记本，7.26）", () => {
  it("runInKernel：sessionId + language + 非空 code；mutating", () => {
    expect(
      OPERATIONS.runInKernel.request.safeParse({ sessionId: "s", language: "python", code: "x" }).success,
    ).toBe(true)
    expect(
      OPERATIONS.runInKernel.request.safeParse({ sessionId: "s", language: "python", code: "" }).success,
    ).toBe(false)
    expect(OPERATIONS.runInKernel.mutating).toBe(true)
    expect(OPERATIONS.runInKernel.response.safeParse({ cellId: "cell-1" }).success).toBe(true)
    expect(OPERATIONS.runInKernel.response.safeParse({}).success).toBe(false)
  })

  it("interruptKernel：sessionId + language；mutating；响应为空对象", () => {
    expect(OPERATIONS.interruptKernel.request.safeParse({ sessionId: "s", language: "R" }).success).toBe(
      true,
    )
    expect(OPERATIONS.interruptKernel.mutating).toBe(true)
    expect(OPERATIONS.interruptKernel.response.safeParse({}).success).toBe(true)
  })

  it("listVariables.request 可带可选 language", () => {
    expect(OPERATIONS.listVariables.request.safeParse({ sessionId: "s" }).success).toBe(true)
    expect(OPERATIONS.listVariables.request.safeParse({ sessionId: "s", language: "R" }).success).toBe(
      true,
    )
    expect(
      OPERATIONS.listVariables.request.safeParse({ sessionId: "s", language: "julia" }).success,
    ).toBe(false)
  })
})

/**
 * 远程内核（7.30，2026-09-03）：每台服务器各配一份解释器路径。
 * `probeInterpreters` 多一个可选 `connectionId`——给了就探那台服务器；
 * `setRemoteInterpreter` 是新操作；连接记录多一个可选 `interpreters`。
 */
describe("远程内核 · 解释器路径（7.30）", () => {
  const 一条合法连接 = {
    id: "conn-1",
    label: "实验室",
    host: "h.example",
    port: 22,
    username: "u",
    hasSecret: false,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    state: { kind: "idle" as const },
  }

  it("probeInterpreters 可带 connectionId；setRemoteInterpreter 存在且 mutating；连接记录可带 interpreters（7.30）", () => {
    expect(OPERATIONS.probeInterpreters.request.safeParse({}).success).toBe(true)
    expect(OPERATIONS.probeInterpreters.request.safeParse({ connectionId: "c1" }).success).toBe(true)
    expect(OPERATIONS.setRemoteInterpreter.mutating).toBe(true)
    expect(
      OPERATIONS.setRemoteInterpreter.request.safeParse({ connectionId: "c1", language: "R", path: "" })
        .success,
    ).toBe(true)
    expect(
      RemoteConnectionSchema.safeParse({ ...一条合法连接, interpreters: { python: "/x/python" } }).success,
    ).toBe(true)
  })

  const 一份内核快照 = {
    captured: true as const,
    kind: "kernel" as const,
    id: "env-1",
    language: "python" as const,
    version: "3.11.0",
    executable: "/usr/bin/python3",
    platform: "darwin",
    libraryPaths: [] as string[],
    packages: [] as { name: string; version: string }[],
    packagesTotal: 0,
  }

  it("getEnvironment 的 kernel 分支可带 where（远端内核记它在哪台机器）；未知字段仍被拒（7.30）", () => {
    const S = OPERATIONS.getEnvironment.response
    expect(S.safeParse(一份内核快照).success).toBe(true)
    expect(S.safeParse({ ...一份内核快照, where: { connectionId: "conn-1" } }).success).toBe(true)
    expect(S.safeParse({ ...一份内核快照, where: { connectionId: "conn-1" }, extra: 1 }).success).toBe(false)
  })
})

/**
 * `fakeSshControl`（远端内核猝死与接回，7.31）：**测试专用**——对这台装配上所有假 SSH 连接掐线，
 * 或杀掉假机器起的所有内核（模拟 OOM）。只在 `DAWN_FAKE_SSH=1` 时放行，生产界面没有入口。
 */
describe("fakeSshControl（测试专用，7.31）", () => {
  it("do ∈ dropLink | killKernels；mutating；响应 count", () => {
    const op = OPERATIONS.fakeSshControl
    expect(op.mutating).toBe(true)
    expect(op.request.safeParse({ do: "dropLink" }).success).toBe(true)
    expect(op.request.safeParse({ do: "killKernels" }).success).toBe(true)
    expect(op.request.safeParse({ do: "reboot" }).success).toBe(false)
    expect(op.response.safeParse({ count: 1 }).success).toBe(true)
  })
})

describe("8.0 · 调整方向（2026-09-25）", () => {
  const 写 = (behavior: unknown) =>
    OPERATIONS.writeToSession.request.safeParse({ sessionId: "s1", data: "hi", as: "user", behavior })
  const 动 = (action: unknown) => OPERATIONS.editQueue.request.safeParse({ sessionId: "s1", id: "q1", action })

  it("writeToSession.behavior：followUp / redirect；steer 不再收", () => {
    expect(写("followUp").success).toBe(true)
    expect(写("redirect").success).toBe(true)
    expect(写("steer").success).toBe(false)
  })

  it("editQueue.action：remove / redirect；steer 不再收", () => {
    expect(动("remove").success).toBe(true)
    expect(动("redirect").success).toBe(true)
    expect(动("steer").success).toBe(false)
  })

  it("两个响应都能带回一串 withdrawn（原文 + 原图）", () => {
    const 话 = { text: "画个图", images: [{ from: "path", path: "/a.png" }] }
    expect(OPERATIONS.editQueue.response.parse({ withdrawn: [话] })).toEqual({ withdrawn: [话] })
    expect(OPERATIONS.writeToSession.response.parse({ withdrawn: [话] })).toEqual({ withdrawn: [话] })
    expect(OPERATIONS.writeToSession.response.parse({})).toEqual({})
  })
})

describe("上下文用量与压缩（2026-09-27）", () => {
  it("compactSession：sessionId 必填，instructions 可选且不许空串", () => {
    const 压 = OPERATIONS.compactSession.request
    expect(压.safeParse({ sessionId: "s1" }).success).toBe(true)
    expect(压.safeParse({ sessionId: "s1", instructions: "保留暗号" }).success).toBe(true)
    expect(压.safeParse({ sessionId: "s1", instructions: "" }).success).toBe(false)
    expect(压.safeParse({ sessionId: "s1", 别的: 1 }).success).toBe(false)
    expect(OPERATIONS.compactSession.mutating).toBe(true)
  })

  it("getContextUsage：三个新字段都可缺；estimated / afterCompaction 只收 true", () => {
    const r = OPERATIONS.getContextUsage.response
    const 底 = { bytes: { system: 1, tools: 2, history: 3 } }
    expect(r.safeParse(底).success).toBe(true)
    expect(r.safeParse({ ...底, usedTokens: 20, estimated: true, compactAt: 111_616 }).success).toBe(true)
    expect(r.safeParse({ ...底, afterCompaction: true }).success).toBe(true)
    expect(r.safeParse({ ...底, estimated: false }).success).toBe(false)
    expect(r.safeParse({ ...底, afterCompaction: false }).success).toBe(false)
  })
})

describe("8.2 · 回退这一轮（2026-09-27）", () => {
  it("previewRewind：只读；文件那一半要么是四张清单，要么是一个缘故", () => {
    expect(isMutating("previewRewind")).toBe(false)
    const 好 = {
      files: { ok: true, restore: ["a.py"], remove: ["out/图.txt"], keep: [{ path: "n.md", reason: "changed_after" }], cannot: [{ path: "big.csv", reason: "too_large", size: 3 }] },
      kernels: ["python"],
      limits: { fileBytes: 52428800, totalBytes: 2147483648 },
    }
    expect(OPERATIONS.previewRewind.response.parse(好)).toEqual(好)
    const 坏 = { files: { ok: false, reason: "remote" }, kernels: [], limits: 好.limits }
    expect(OPERATIONS.previewRewind.response.parse(坏)).toEqual(坏)
    expect(OPERATIONS.previewRewind.response.safeParse({ ...坏, files: { ok: false, reason: "猜的" } }).success).toBe(false)
  })

  it("rewindTurn：mutating；做法只有三种", () => {
    expect(isMutating("rewindTurn")).toBe(true)
    const 请 = (mode: unknown) => OPERATIONS.rewindTurn.request.safeParse({ sessionId: "s", turnId: "u3", mode })
    expect(请("both").success).toBe(true)
    expect(请("files").success).toBe(true)
    expect(请("conversation").success).toBe(true)
    expect(请("all").success).toBe(false)
    const 回 = { restored: ["a.py"], removed: [], keep: [], cannot: [], failed: [], kernels: [], editorText: "那句" }
    expect(OPERATIONS.rewindTurn.response.parse(回)).toEqual(回)
    // 回退途中新冒出来、挪进回收处的；给模型的话没留成（Task 5 复审）
    const 全 = { ...回, appeared: [{ path: "t.csv", to: ".dawn/trash/r/t.csv" }], noteError: "disk full" }
    expect(OPERATIONS.rewindTurn.response.parse(全)).toEqual(全)
    expect(OPERATIONS.rewindTurn.response.safeParse({ ...回, appeared: [{ path: "t.csv" }] }).success).toBe(false)
  })
})

describe("8.3 · 子 agent 看得见（2026-09-27）", () => {
  it("openSubagent：只读但有副作用（可能读盘建子转录）；回的是会话快照", () => {
    expect(OPERATIONS.openSubagent.mutating).toBe(false)
    expect(OPERATIONS.openSubagent.request.safeParse({ transcriptId: "s#sub:c1:0" }).success).toBe(true)
    expect(OPERATIONS.openSubagent.request.safeParse({}).success).toBe(false)
  })
  it("askSubagent：可写；空话不收", () => {
    expect(OPERATIONS.askSubagent.mutating).toBe(true)
    expect(OPERATIONS.askSubagent.request.safeParse({ transcriptId: "s#sub:c1:0", text: "再说一句" }).success).toBe(true)
    expect(OPERATIONS.askSubagent.request.safeParse({ transcriptId: "s#sub:c1:0", text: "" }).success).toBe(false)
  })
})

describe("桌面通知（2026-09-27）", () => {
  const 回执 = { done: true, error: false, permission: true, quietWhenFocused: true, supported: true }
  it("get / set 回同一个形状；lang 可选；set 的每个字段都可选", () => {
    expect(OPERATIONS.desktopGetNotify.response.parse(回执)).toEqual(回执)
    expect(OPERATIONS.desktopSetNotify.response.parse({ ...回执, lang: "en" })).toMatchObject({ lang: "en" })
    expect(OPERATIONS.desktopSetNotify.request.parse({})).toEqual({})
    expect(OPERATIONS.desktopSetNotify.request.parse({ lang: "zh", done: false })).toEqual({ lang: "zh", done: false })
    expect(() => OPERATIONS.desktopSetNotify.request.parse({ lang: "fr" })).toThrow()
    expect(() => OPERATIONS.desktopGetNotify.response.parse({ ...回执, supported: undefined })).toThrow()
  })
  it("试一条：没弹出来要说为什么（两个码，界面各配一句）", () => {
    expect(OPERATIONS.desktopTestNotify.response.parse({ shown: true })).toEqual({ shown: true })
    expect(OPERATIONS.desktopTestNotify.response.parse({ shown: false, reason: "unsupported" })).toMatchObject({ reason: "unsupported" })
    expect(() => OPERATIONS.desktopTestNotify.response.parse({ shown: false, reason: "别的" })).toThrow()
  })
  it("set 与试一条是 mutating，get 不是", () => {
    expect(isMutating("desktopGetNotify")).toBe(false)
    expect(isMutating("desktopSetNotify")).toBe(true)
    expect(isMutating("desktopTestNotify")).toBe(true)
  })
  it("取走待回的那段：读了就清所以是 mutating；回执可以什么都没有", () => {
    expect(isMutating("takePendingOpenSession")).toBe(true)
    expect(OPERATIONS.takePendingOpenSession.response.parse({})).toEqual({})
    expect(OPERATIONS.takePendingOpenSession.response.parse({ sessionId: "s1" })).toEqual({ sessionId: "s1" })
    expect(() => OPERATIONS.takePendingOpenSession.response.parse({ sessionId: "" })).toThrow()
  })
})

describe("8.5 · 会话全文搜索（2026-09-27）", () => {
  const 请求 = (x: unknown) => OPERATIONS.searchSessionContent.request.safeParse(x)

  it("只读；query 去空白后至少两个字、至多 200；limit 1–100 可省", () => {
    expect(OPERATIONS.searchSessionContent.mutating).toBe(false)
    expect(请求({ query: " cox " }).success).toBe(true)
    expect(请求({ query: " c " }).success).toBe(false)
    // 2026-09-28：按字（码点）数、空白不算——一个生僻字 / emoji 是两个 UTF-16 单元，也只算一个字
    expect(请求({ query: "𠀀" }).success).toBe(false)
    expect(请求({ query: "😀" }).success).toBe(false)
    expect(请求({ query: "𠀀𠀀" }).success).toBe(true)
    expect(请求({ query: "回归" }).success).toBe(true)
    expect(请求({ query: "a b" }).success).toBe(true)
    expect(请求({ query: "\u3000c\u3000" }).success).toBe(false)
    expect(请求({ query: "x".repeat(201) }).success).toBe(false)
    expect(请求({ query: "cox", limit: 0 }).success).toBe(false)
    expect(请求({ query: "cox", limit: 30 }).success).toBe(true)
    expect(请求({ query: "cox", extra: 1 }).success).toBe(false)
  })

  it("响应：卡 + 处 + 截断与各种没搜的计数", () => {
    const r = {
      sessions: [
        {
          sessionId: "s1",
          projectId: "p1",
          title: "生存分析",
          place: { kind: "project", name: "lung" },
          archived: false,
          lastAt: "2026-09-03T10:00:00.000Z",
          hits: [
            { itemId: "t1", nth: 0, where: "toolInput", toolName: "run_code", snippet: "coxph(…", marks: [[0, 5]], at: "2026-09-03T10:00:00.000Z" },
          ],
          moreHits: 2,
        },
      ],
      matchedSessions: 1,
      total: 7,
      scanned: 5,
      notSearchable: 2,
      unreadable: 0,
      tooLarge: 0,
      elapsedMs: 12,
    }
    expect(OPERATIONS.searchSessionContent.response.parse(r)).toEqual(r)
    expect(OPERATIONS.searchSessionContent.response.safeParse({ ...r, truncated: "time" }).success).toBe(true)
    expect(OPERATIONS.searchSessionContent.response.safeParse({ ...r, truncated: "whatever" }).success).toBe(false)
  })
})

describe("8.6 · 先出方案（2026-09-27）", () => {
  const 答 = (req: unknown) => OPERATIONS.answerPlan.request.safeParse(req)
  it("answerPlan：approve（可带改过的正文）/ discard；别的动作不收", () => {
    expect(答({ sessionId: "s1", planId: "c1", action: "approve" }).success).toBe(true)
    expect(答({ sessionId: "s1", planId: "c1", action: "approve", text: "## 问题与假设\n…" }).success).toBe(true)
    expect(答({ sessionId: "s1", planId: "c1", action: "discard" }).success).toBe(true)
    expect(答({ sessionId: "s1", planId: "c1", action: "revise" }).success).toBe(false)
    expect(OPERATIONS.answerPlan.mutating).toBe(true)
  })
  it("响应：批准时带存档路径", () => {
    expect(OPERATIONS.answerPlan.response.parse({ savedPath: "analysis/plans/x.md" })).toEqual({ savedPath: "analysis/plans/x.md" })
    expect(OPERATIONS.answerPlan.response.parse({})).toEqual({})
  })
})
