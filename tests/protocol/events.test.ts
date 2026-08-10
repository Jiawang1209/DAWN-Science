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

describe("协议版本 · 2.12", () => {
  /**
   * 2.0：订阅的响应形状变了，破坏性，major 递增。
   * **2.1（2026-08-09）：新增 `setSessionModel`。只加操作、不改既有形状，
   * 所以是 minor**——老界面连新服务端照常工作，只是不知道有这个操作。
   * **2.2（2026-08-09）：transcript 新增 `subagents` 条目。** 同样是纯新增：
   * 既有条目的形状一个字没动，所以仍是 minor。
   * **2.3（2026-08-09）：会话 `kind` 新增 `cli`。** 同上，既有取值一个没动。
   * **2.12（2026-08-10）：`SessionSummary` 新增可选 `title`。**
   *   纯新增字段，老界面照常工作（只是仍然分不清会话）。
   *   **缺省 = 还没说过话**，不是空标题——界面据此显示「新会话」。
   *
   * **2.11（2026-08-10）：新增 `openExternally`（②-B · F3）。**
   *   它收的是**工作区内的相对路径**，由后端解析校验后才交给系统——
   *   直接给绝对路径调 `shell.openPath` 等于把路径守卫绕过去。
   *
   * **2.10（2026-08-10）：新增 `listDirectory` / `readFile`（②-B）。**
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
  it("新增操作、新增条目、新增 kind 都只升 minor", () => {
    expect(WORKBENCH_PROTOCOL_VERSION).toBe("2.12")
  })

  it("major 不同即不兼容，1.x 的界面连不上 2.0 的服务端", () => {
    expect(isCompatible("1.3", "2.0")).toBe(false)
    expect(isCompatible("2.0", "2.0")).toBe(true)
  })
})
