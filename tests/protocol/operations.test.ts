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
  it("125 个操作齐全（… + 远端连接 5 + 远端会话 1 + 任务 4 + 技能 1 + 默认工作目录 2 + 权限 2 + MCP 6 + 视觉 3 + 用量 1 + ACP 权限 1 + ACP 开关 1 + ACP 适配器 3 + 下载目录 2 + 传输 3 + 微信 8 + 增强 2 + 文件搜索 1 + 技能管理 3 + 归档 3 + 定时 6 + 子 agent 名册 3 + 导出 1 + @ 引用设置 2 + 插件 2 + 浏览器旁观 2 + 记忆 5 + 飞书 7）", () => {
    expect(operationNames().sort()).toEqual(
      [
        "acquireLease",
        "openProject",
        "addAcpAgent",
        "removeAgent",
        "setAcpRemoteCapable",
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
    for (const name of ["getCapabilities", "listProjects", "listSessions", "listRuns", "getRun", "getProvenance", "deletionImpact", "listDirectory", "listCredentials", "getProviders", "listTemporarySessions", "getPermissionMode"]) {
      expect(isMutating(name), `${name} 应为只读`).toBe(false)
    }
    for (const name of ["createTask", "setTaskWorkspace", "deleteTask", "setPermissionMode", "initScienceLayout",
        "createTerminalSession", "writeToSession", "stopSession", "acquireLease", "setCredential", "deleteCredential"]) {
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
