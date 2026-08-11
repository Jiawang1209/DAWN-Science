/**
 * 会话协议（返工 R4 重写）。
 *
 * **旧设计：seq + 环形缓冲 + `dropped` + `truncated` + `earliestSeq`。**
 * 那套「丢弃必须出声」的纪律是为一个本不该存在的问题设计的——
 * 只要有一份完整的 transcript，就不需要在内存缓冲溢出时向用户道歉。
 *
 * **新设计（借自 pi-protocol）：snapshot + revision。**
 * 订阅拿全量快照，之后收增量；发现 revision 跳号就**重新取一次快照**。
 * 旧设计只能「出声」，新设计能**自愈**——这是这次重写真正换来的东西。
 */
import { describe, expect, it } from "vitest"
import {
  SessionSnapshotSchema,
  SessionUpdateSchema,
  TranscriptItemSchema,
} from "../../src/protocol/events.js"
import { OPERATIONS, operationNames } from "../../src/protocol/operations.js"
import { WORKBENCH_PROTOCOL_VERSION, isCompatible } from "../../src/protocol/version.js"

const turn = (over: Record<string, unknown> = {}) => ({
  type: "turn",
  id: "a1",
  who: "agent",
  text: "在",
  final: false,
  ...over,
})

const tool = (over: Record<string, unknown> = {}) => ({
  type: "tool",
  id: "t1",
  name: "bash",
  input: { command: "ls" },
  status: "running",
  ...over,
})

const snapshot = (over: Record<string, unknown> = {}) => ({
  sessionId: "s1",
  kind: "native",
  revision: 0,
  items: [],
  terminal: "",
  terminalTrimmed: false,
  state: "alive",
  ...over,
})

describe("transcript 条目", () => {
  it("turn 必须说明是谁在说、说完没有", () => {
    expect(TranscriptItemSchema.safeParse(turn()).success).toBe(true)
    const { who: _w, ...noWho } = turn()
    expect(TranscriptItemSchema.safeParse(noWho).success).toBe(false)
    const { final: _f, ...noFinal } = turn()
    expect(TranscriptItemSchema.safeParse(noFinal).success).toBe(false)
  })

  it("tool 条目带名字、入参与状态", () => {
    expect(TranscriptItemSchema.safeParse(tool()).success).toBe(true)
    expect(TranscriptItemSchema.safeParse(tool({ status: "ok", result: "done" })).success).toBe(true)
  })

  it("tool 的状态只有三种 —— running / ok / error", () => {
    expect(TranscriptItemSchema.safeParse(tool({ status: "maybe" })).success).toBe(false)
  })

  it("未知 type 拒绝，多余字段拒绝", () => {
    expect(TranscriptItemSchema.safeParse({ ...turn(), type: "whatever" }).success).toBe(false)
    expect(TranscriptItemSchema.safeParse({ ...turn(), extra: 1 }).success).toBe(false)
  })

  it("notice 用于错误与系统提示 —— 它们既不是对话也不是工具", () => {
    expect(
      TranscriptItemSchema.safeParse({ type: "notice", id: "n1", text: "会话已退出" }).success,
    ).toBe(true)
  })
})

describe("会话快照", () => {
  it("接受一份空快照 —— revision 0 表示还什么都没发生", () => {
    expect(SessionSnapshotSchema.safeParse(snapshot()).success).toBe(true)
  })

  it("revision 从 0 起且不接受负数", () => {
    expect(SessionSnapshotSchema.safeParse(snapshot({ revision: -1 })).success).toBe(false)
    expect(SessionSnapshotSchema.safeParse(snapshot({ revision: 1.5 })).success).toBe(false)
  })

  it("退出的会话可带 exitCode", () => {
    expect(SessionSnapshotSchema.safeParse(snapshot({ state: "exited", exitCode: 0 })).success).toBe(true)
  })

  it("**终端 scrollback 被裁掉不是异常**，只是如实标注", () => {
    // 旧设计为此发 `dropped` 事件并要求界面道歉。但终端本来就是有限回滚的，
    // xterm 自己也只留 5000 行——**把正常契约当成故障来播报，是把噪音当成诚实**。
    const r = SessionSnapshotSchema.safeParse(
      snapshot({ kind: "pty", terminal: "…", terminalTrimmed: true }),
    )
    expect(r.success).toBe(true)
  })
})

describe("增量更新", () => {
  const base = { workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, sessionId: "s1" }

  it("item 更新带 revision 与条目", () => {
    expect(
      SessionUpdateSchema.safeParse({ ...base, type: "item", revision: 1, item: turn() }).success,
    ).toBe(true)
  })

  it("bytes 更新用于 PTY", () => {
    expect(
      SessionUpdateSchema.safeParse({ ...base, type: "bytes", revision: 1, data: "\x1b[31m" }).success,
    ).toBe(true)
  })

  it("state 更新带状态", () => {
    expect(
      SessionUpdateSchema.safeParse({ ...base, type: "state", revision: 2, state: "exited", exitCode: 0 })
        .success,
    ).toBe(true)
  })

  it("snapshot 更新用于重放全量", () => {
    expect(
      SessionUpdateSchema.safeParse({ ...base, type: "snapshot", revision: 5, snapshot: snapshot({ revision: 5 }) })
        .success,
    ).toBe(true)
  })

  it("revision 从 1 起 —— 0 是「还没有任何更新」的快照初值，不会作为增量出现", () => {
    expect(
      SessionUpdateSchema.safeParse({ ...base, type: "item", revision: 0, item: turn() }).success,
    ).toBe(false)
  })

  it("版本不符的信封仍然合 schema —— 版本判断是客户端的事，不是 schema 的事", () => {
    const r = SessionUpdateSchema.safeParse({
      ...base,
      workbenchProtocolVersion: "9.9",
      type: "item",
      revision: 1,
      item: turn(),
    })
    expect(r.success).toBe(true)
  })
})

describe("协议操作 · 订阅与控制", () => {
  it("subscribeSession 不再有 fromSeq —— 订阅一律给全量快照", () => {
    expect(OPERATIONS.subscribeSession.request.safeParse({ sessionId: "s1" }).success).toBe(true)
    expect(
      OPERATIONS.subscribeSession.request.safeParse({ sessionId: "s1", fromSeq: 3 }).success,
    ).toBe(false)
  })

  it("新增 abortSession —— 界面终于能有一个停止按钮", () => {
    expect(operationNames()).toContain("abortSession")
    expect(OPERATIONS.abortSession.mutating).toBe(true)
  })

  it("新增 steerSession —— 不打断整轮，只插一句引导", () => {
    expect(operationNames()).toContain("steerSession")
    expect(OPERATIONS.steerSession.request.safeParse({ sessionId: "s1", text: "换个思路" }).success).toBe(true)
    expect(OPERATIONS.steerSession.request.safeParse({ sessionId: "s1", text: "" }).success).toBe(false)
  })
})

describe("协议版本 · 4.2", () => {
  /**
   * 2.0：订阅的响应形状变了，破坏性，major 递增。
   * **2.1（2026-08-09）：新增 `setSessionModel`。只加操作、不改既有形状，
   * 所以是 minor**——老界面连新服务端照常工作，只是不知道有这个操作。
   * **2.2（2026-08-09）：transcript 新增 `subagents` 条目。** 同样是纯新增：
   * 既有条目的形状一个字没动，所以仍是 minor。
   * **2.3（2026-08-09）：会话 `kind` 新增 `cli`。** 同上，既有取值一个没动。
   * **4.2（2026-08-11）：新增 `createTemporarySession` / `listTemporarySessions`；
   *   `ProjectSummary` 带上可选的 `temporary`。** 纯新增。
   *   **临时会话仍然有工作区**（每个一个独立目录）——agent 要有地方读写、
   *   账本要有归属；`temporary` 只是告诉界面它归上面那一列。
   *
   * **4.1（2026-08-11）：`getProviders` 的 `providers[]` 带上 `name`。**
   *   纯新增。作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*——
   *   agent id 是配置里的键，**是我们的内部标识，不是这家服务的名字**。
   *   名字来自 pi 的 provider 表（`deepseek → DeepSeek`），不是手打的对照表。
   *
   * **4.0（2026-08-10，破坏性）：`setProviderBaseUrl` → `setProviderConnection`
   *   （多收 `api` / `models`）；`listKnownProviders` 的 `baseUrls` → `connections`。**
   *   两处都是**替换**，不是新增，所以 major 递增。本可以两边并存躲开这次 major——
   *   没有那么做：**两个写口子迟早会各写各的**，那时「我到底改没改上」没人答得出来。
   *
   * **3.4（2026-08-10）：新增 `setProviderBaseUrl`；`listKnownProviders` 带上
   *   `needsBaseUrl` / `baseUrls`。** pi 自带 40 个 provider 的地址，
   *   **有 8 个不自带**——它们跟账号、区域、项目走，只能由人填。
   *
   * **3.3（2026-08-10）：新增 `createAgent`；`listKnownProviders` 带上 `models`。**
   *   纯新增。只支持 `kind: native`——cli 与 pty 要填命令行，
   *   在这里顺手支持等于让一个「加个模型」的按钮悄悄能起任意进程。
   *
   * **3.2（2026-08-10）：transcript 的 `turn` 条目新增可选 `usage`。**
   *   纯新增。**缺席 = 不知道**，不是 0——自有订阅额度的 agent、
   *   或者这一段本来就没有新的模型调用，界面据此说的话完全不同。
   *
   * **3.1（2026-08-10）：新增 `reorderSessions`（拖拽排序）。**
   *   纯新增，故 minor。**客户端发完整顺序、服务端一次写完**——
   *   在客户端算「插在 A 与 B 之间」的位置需要间隙分配，间隙用光还得重排。
   *
   * **3.0（2026-08-10）：`SessionSummary` 新增必填的 `pinned` / `sortOrder`。**
   *   **必填即破坏性**——老服务端不会发这两个字段，新界面的 zod 校验会直接拒，
   *   所以是 major。同批新增 `renameSession` / `setSessionPinned` / `moveSession`。
   *
   *   本可以做成可选来躲开这次 major。**没有那么做**：`sortOrder` 缺省时
   *   列表该按什么排没有诚实的答案，而「可选 + 各处兜底」正是
   *   schema v8 里那笔烂账的翻版（见 `store/schema.ts`）。
   *   契约冻结点在阶段 ③，**现在破一次比冻结之后便宜得多**。
   *
   * **2.16（2026-08-10）：新增 `getEnvironment`（②-B · S17）。**
   *   三态：不支持 / 还没拿到 / 拿到了。**一份空快照会被读成
   *   「这个环境什么都没有」**，而实情是「我们没问到」。
   *   返回的是**准入时刻**冻结的那一份，不是现在重新探的。
   *
   * **2.15（2026-08-10）：`readFile` 新增 `pdf` 一档（②-A′ · F5）。**
   *   **与 `image` 分开**：它在界面上走 blob + `<embed>`，交给 Chromium 自带的阅读器；
   *   混进 `image` 会让界面拿 `<img>` 去画 PDF——那是一个空框。
   *
   * **2.14（2026-08-10）：新增 `listKnownProviders`。**
   *   **与 `getProviders` 不是一回事**：那是「我配过谁」（providers.yaml 里声明过的），
   *   这是「我能配谁」（pi 的模型目录里出现过的）。作者机器上前者 1、后者 39。
   *   目录取不到时**如实说取不到**，不返回一个悄悄变短的清单。
   *
   * **2.13（2026-08-10）：新增 `deleteSession` / `deleteProject` / `deletionImpact`。**
   *   纯新增。**`deleteProject` 不碰磁盘上的文件夹**——它移除的是工作台里的记录。
   *   删会话**不动账本**：账本记的是「对你的文件发生过什么」，
   *   那件事不因为你删掉一个会话就没发生（不变式 5）。
   *
   * **2.12（2026-08-10）：`SessionSummary` 新增可选 `title`。**
   *   纯新增字段，老界面照常工作（只是仍然分不清会话）。
   *   **缺省 = 还没说过话**，不是空标题——界面据此显示「新会话」。
   *
   * **2.11（2026-08-10）：新增 `openExternally`（②-A′ · F3）。**
   *   它收的是**工作区内的相对路径**，由后端解析校验后才交给系统——
   *   直接给绝对路径调 `shell.openPath` 等于把路径守卫绕过去。
   *
   * **2.10（2026-08-10）：新增 `listDirectory` / `readFile`（②-A′）。**
   *   **只读**；图片回 base64 而不回 `file://` 路径——后者等于把路径守卫的
   *   判断权交给渲染进程。
   *
   * 2.9（2026-08-10）：新增 `getInterpreters` / `setInterpreter`。
   *   两个解释器路径是**调用 Python / R 的机制**（作者定）：没配就不能用，
   *   而不是退回某个扫描出来的默认。**没配的那个不给字段**，不是空串。
   *
   * 2.8（2026-08-10）：新增 `listVariables`（S14）。
   *   响应是**三态**：「不支持 + 原因」与「支持但为空」必须分得开——
   *   混成空列表就是把「我们没去问」说成「这里什么都没有」。
   *
   * 2.7（2026-08-10）：`SessionSnapshot` 新增 `kernelInstanceId`（S13）。
   *   界面据它判断一条输出是不是**上一个内核**算出来的。
   *   **缺省 = 还没有内核，不是「不陈旧」。**
   *
   * 2.6（2026-08-10）：会话 `kind` 新增 `kernel` + transcript 新增
   *   `kernelOutput` 条目（②-A · K4）。** 判别式的**三处一起加**——
   *   这是 2.3 留下的教训：漏一处的症状是「某条路径上这个会话凭空消失」。
   *
   * 2.5（2026-08-10）：新增 `listKernels`（②-A · K2）。
   *   纯新增操作，故 minor。响应里必须带解释器路径——
   *   本机五个 kernelspec 里三个是 conda 环境，光看名字分不出哪个是哪个。
   *
   * 2.4（2026-08-09）：cli 的模型清单 + `provider` 放宽为可选。
   * 放宽必填字段是兼容的方向，仍是 minor。
   */
  it("版本号与这份说明一致", () => {
    expect(WORKBENCH_PROTOCOL_VERSION).toBe("4.2")
  })

  it("major 不同即不兼容，1.x 的界面连不上 2.0 的服务端", () => {
    expect(isCompatible("1.3", "2.0")).toBe(false)
    expect(isCompatible("2.0", "2.0")).toBe(true)
  })
})
