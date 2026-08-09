/**
 * Run 记账（Task 3.5 · S16′）。
 *
 * **本项目此前没有任何生产代码创建过 Run。** `RunStore` 写好了、协议有
 * `listRuns`/`getRun`、界面有历史栏——但那张表从头到尾是空的。
 * 测试全绿，功能是死的：这是同一类缺陷的第六次。
 *
 * ## 为什么它必须现在做，而不是等阶段 ③
 *
 * 其余功能都是**新增路径**，随时可加。Run 不是——它要求
 * **每条执行路径在诞生时就记账**。桌面全建完再补，每个已有的执行入口都要回头改。
 *
 * Rho 的前车之鉴（`reproducibility-audit` 设计文档原文）：
 * > *"Current durable run rows **do not directly carry `project_root`**.
 * > Therefore RA-RC1 is **blocked** until its interface checkpoint defines one
 * > canonical, testable run-to-project identity contract. Inferring project
 * > identity from source paths, the current open project, adjacent timestamps,
 * > or artifact filenames is **forbidden**."*
 *
 * Run 行少一个字段，整个运行对比被阻塞，必须先做三个基线加固包。
 * **三个包的代价，换一个字段。** 所以 `projectId` 与 `exitCode` 现在就钉死。
 */
import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../src/store/schema.js"
import { RunStore } from "../src/store/runs.js"
import { RunRecorder } from "../src/project/run-recorder.js"

let db: Database.Database
let runs: RunStore
let rec: RunRecorder
let clock: number

const PROJECT = "p1"
const SESSION = "s1"

beforeEach(() => {
  db = new Database(":memory:")
  migrate(db)
  db.prepare(
    `INSERT INTO projects (id, name, workspace, created_at) VALUES (?,?,?,?)`,
  ).run(PROJECT, "demo", "/w", "2026-08-09T00:00:00.000Z")
  runs = new RunStore(db)
  clock = 0
  rec = new RunRecorder({
    runs,
    projectOf: (s) => (s === SESSION ? PROJECT : undefined),
    // 确定性时钟：**时间戳必须单调**，这是冻结点八项之一
    now: () => new Date(1_800_000_000_000 + clock++ * 1000).toISOString(),
  })
})

const list = () => runs.listByProject(PROJECT, {})

describe("agent 回合", () => {
  it("用户发话即开一条 running 的 agent_turn", () => {
    rec.beginTurn(SESSION)
    const all = list()
    expect(all).toHaveLength(1)
    expect(all[0]!.requestType).toBe("agent_turn")
    expect(all[0]!.status).toBe("running")
    expect(all[0]!.origin).toBe("user")
    // **projectId 现在就钉死**——Rho 正是漏了它才让运行对比整个被阻塞
    expect(all[0]!.projectId).toBe(PROJECT)
  })

  it("idle 收尾为 completed 并写 finishedAt", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    const r = list()[0]!
    expect(r.status).toBe("completed")
    expect(r.finishedAt).toBeDefined()
    expect(r.hasError).toBe(false)
  })

  it("**没有开着的回合时，idle 不凭空造一条** —— 记账不能记出不存在的事", () => {
    rec.ingest({ kind: "idle", sessionId: SESSION })
    expect(list()).toHaveLength(0)
  })

  /**
   * **2026-08-09 真机实测抓到的缺陷。**
   *
   * pi 在每次模型响应后都发 `turn_end`（877 次工具调用 = 877 次 turn_end）。
   * 原实现在 `turn_end` 收尾回合，于是一轮里第二次之后的工具调用
   * **全部变成没有父账的孤儿**。上一次验证只有一次工具调用，掩盖了它。
   */
  it("turn_end **不**收尾回合 —— pi 每次模型响应都发它", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "turn_end", sessionId: SESSION })
    expect(list()[0]!.status).toBe("running")
  })

  it("一轮里的多次工具调用，parent 都指向同一个回合", () => {
    rec.beginTurn(SESSION)
    const turnId = list()[0]!.runId
    for (const id of ["c1", "c2", "c3"]) {
      rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: id, toolName: "bash", input: {} })
      rec.ingest({ kind: "tool_end", sessionId: SESSION, toolCallId: id, toolName: "bash", isError: false, text: "", truncated: false, bytes: 0 })
      // pi 在每次模型响应后发 turn_end —— 它不该打断父子关系
      rec.ingest({ kind: "turn_end", sessionId: SESSION })
    }
    const tools = list().filter((r) => r.requestType.startsWith("tool_call"))
    expect(tools).toHaveLength(3)
    expect(tools.every((t) => t.parentRunId === turnId), "有工具调用成了孤儿").toBe(true)
  })

  it("连发两轮各自成账，不互相顶掉", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    expect(list()).toHaveLength(2)
    expect(list().every((r) => r.status === "completed")).toBe(true)
  })

  it("未知会话直接不记 —— **绝不猜 projectId**", () => {
    rec.beginTurn("不认识的会话")
    expect(list()).toHaveLength(0)
  })
})

describe("工具调用", () => {
  it("每次调用一条 Run，parentRunId 指向当时那个回合", () => {
    rec.beginTurn(SESSION)
    const turnId = list()[0]!.runId
    rec.ingest({
      kind: "tool_start",
      sessionId: SESSION,
      toolCallId: "c1",
      toolName: "bash",
      input: { command: "ls" },
    })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool).toBeDefined()
    expect(tool.parentRunId).toBe(turnId)
    expect(tool.origin).toBe("agent")
  })

  it("失败的工具调用记成 failed 且 hasError", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "bash", input: {} })
    rec.ingest({ kind: "tool_end", sessionId: SESSION, toolCallId: "c1", toolName: "bash", isError: true, text: "boom", truncated: false, bytes: 0 })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool.status).toBe("failed")
    expect(tool.hasError).toBe(true)
  })

  it("成功的记成 completed", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "read", input: {} })
    rec.ingest({ kind: "tool_end", sessionId: SESSION, toolCallId: "c1", toolName: "read", isError: false, text: "ok", truncated: false, bytes: 0 })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool.status).toBe("completed")
    expect(tool.hasError).toBe(false)
  })

  it("没有开着的回合也能记工具调用 —— 只是没有 parent，不是丢掉它", () => {
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "bash", input: {} })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool).toBeDefined()
    expect(tool.parentRunId).toBeUndefined()
  })
})

describe("PTY 会话", () => {
  // **按实测修正计划。** 计划写的是「PTY 命令」一条 Run，但 PTY 只给字节流，
  // 命令的边界不可观测——按回车？被 TUI 吃掉的按键算不算？
  // 猜边界就是在编造事实（不变式 5 明令禁止）。可观测的是**会话**，所以记会话。
  it("会话开始即一条 running 的 pty_session", () => {
    rec.beginPtySession(SESSION)
    const r = list()[0]!
    expect(r.requestType).toBe("pty_session")
    expect(r.status).toBe("running")
    expect(r.origin).toBe("user")
  })

  it("退出时写**结构化的 exitCode**，不是把它埋进日志文本", () => {
    rec.beginPtySession(SESSION)
    rec.ingest({ kind: "exited", sessionId: SESSION, exitCode: 3 })
    const r = list()[0]!
    expect(r.status).toBe("failed")
    expect(r.exitCode).toBe(3)
    expect(r.hasError).toBe(true)
  })

  it("退出码 0 记 completed", () => {
    rec.beginPtySession(SESSION)
    rec.ingest({ kind: "exited", sessionId: SESSION, exitCode: 0 })
    const r = list()[0]!
    expect(r.status).toBe("completed")
    expect(r.exitCode).toBe(0)
    expect(r.hasError).toBe(false)
  })

  it("会话退出时把还开着的回合与工具一并收尾 —— **不留永久 running 的孤儿**", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "bash", input: {} })
    rec.ingest({ kind: "exited", sessionId: SESSION, exitCode: 1 })
    expect(list().filter((r) => r.status === "running")).toHaveLength(0)
    // 收尾原因要如实——它们不是自己跑完的
    expect(list().every((r) => r.terminalReason !== undefined || r.status === "completed")).toBe(true)
  })
})

describe("时间戳", () => {
  it("单调递增 —— 冻结点要求「可重建事件序列」", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    rec.beginTurn(SESSION)
    const stamps = list().map((r) => r.startedAt)
    const sorted = [...stamps].sort()
    expect(stamps).toEqual([...sorted].reverse())
  })
})

describe("文件事实（不变式 5）", () => {
  it("tool_files 补进那条仍然开着的 tool_call Run", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "write", input: {} })
    rec.ingest({
      kind: "tool_files", sessionId: SESSION, toolCallId: "c1",
      filesWritten: ["src/a.ts", "src/b.ts"], filesRead: [], mayIncludeUserEdits: true,
    })
    rec.ingest({ kind: "tool_end", sessionId: SESSION, toolCallId: "c1", toolName: "write", isError: false, text: "", truncated: false, bytes: 0 })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool.filesWritten).toEqual(["src/a.ts", "src/b.ts"])
    expect(tool.mayIncludeUserEdits).toBe(true)
  })

  it("**没收到 tool_files 的调用，字段就是缺省** —— 「不知道」不能写成「没改」", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "read", input: {} })
    rec.ingest({ kind: "tool_end", sessionId: SESSION, toolCallId: "c1", toolName: "read", isError: false, text: "", truncated: false, bytes: 0 })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool.filesWritten).toBeUndefined()
  })

  it("确认没改文件时是**空数组**，与缺省可区分", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "bash", input: {} })
    rec.ingest({
      kind: "tool_files", sessionId: SESSION, toolCallId: "c1",
      filesWritten: [], filesRead: [], mayIncludeUserEdits: false,
    })
    const tool = list().find((r) => r.requestType.startsWith("tool_call"))!
    expect(tool.filesWritten).toEqual([])
    expect(tool.filesWritten).not.toBeUndefined()
  })

  it("不认识的 toolCallId 不乱写 —— 宁可丢这条事实，不可写错行", () => {
    rec.beginTurn(SESSION)
    expect(() =>
      rec.ingest({
        kind: "tool_files", sessionId: SESSION, toolCallId: "从没见过",
        filesWritten: ["x"], filesRead: [], mayIncludeUserEdits: false,
      }),
    ).not.toThrow()
    expect(list().filter((r) => r.requestType.startsWith("tool_call"))).toHaveLength(0)
  })
})

/**
 * 账本要记「是哪个工具改的」（①-B″ · U4 前置）。
 *
 * R3 已经能回答「哪次工具调用改了哪个文件」，但**回答不了「那是什么工具」**——
 * `requestType` 一律是字面量 `"tool_call"`。而 U4 的变更 pane 要求
 * **标明是哪次工具调用改的**，只显示一个匿名序号等于没标。
 *
 * `requestType` 本来就是**开放字符串**（协议注释：「①-B 只产生 agent_turn，
 * ②-A 会加 execute_r / execute_py」），正好用来承载它。
 */
describe("Run 记账 · 记下是哪个工具", () => {
  it("requestType 带上工具名", () => {
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "t1", toolName: "bash", input: {} })
    const tool = list().find((x) => x.requestType.startsWith("tool_call"))!
    expect(tool.requestType).toBe("tool_call:bash")
  })

  it("**拿不到工具名时不编一个**，退回裸 tool_call", () => {
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "t1", toolName: "", input: {} })
    const tool = list().find((x) => x.requestType.startsWith("tool_call"))!
    expect(tool.requestType).toBe("tool_call")
  })
})
