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
import { EnvironmentStore } from "../src/store/environments.js"

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

describe("子 agent 的账（①-B″ · S1，不变式 3）", () => {
  /**
   * 计划 §6 把这条列为「**现在就做，不等阶段 ④**」：
   *
   * > 每个子 agent 的回合**落 Run**，`parent_run_id` 指向发起它的那次工具调用。
   * > 子 agent 干的活也是账本上的条目。
   *
   * 理由与整个记账员前移到 ①-B′ 是同一条：Run 要求**每条执行路径在诞生时就记账**。
   * 子 agent 是一条全新的执行路径，等到阶段 ④ 再补，就要回头改已有的调用点。
   */
  const startSubagent = (i: number, agent: string) =>
    rec.ingest({
      kind: "subagent_start", sessionId: SESSION, toolCallId: "c1",
      index: i, agent, task: `任务${i}`,
    })

  const endSubagent = (i: number, ok: boolean, error?: string) =>
    rec.ingest({
      kind: "subagent_end", sessionId: SESSION, toolCallId: "c1",
      index: i, ok, ...(error ? { error } : {}),
    })

  /** 走到「subagent 工具正在执行」这一刻 */
  const untilToolRunning = () => {
    rec.beginTurn(SESSION)
    rec.ingest({
      kind: "tool_start", sessionId: SESSION, toolCallId: "c1",
      toolName: "subagent", input: {},
    })
  }

  it("**parent_run_id 指向发起它的那次工具调用**", () => {
    untilToolRunning()
    startSubagent(0, "scout")
    endSubagent(0, true)

    const tool = list().find((r) => r.requestType === "tool_call:subagent")!
    const sub = list().find((r) => r.requestType.startsWith("subagent:"))!
    expect(sub.parentRunId).toBe(tool.runId)
    // 而那次工具调用自己挂在回合上——**三层链是完整的**
    expect(tool.parentRunId).toBe(list().find((r) => r.requestType === "agent_turn")!.runId)
  })

  it("**agent 名字进 requestType** —— 只给序号等于没记是谁干的", () => {
    untilToolRunning()
    startSubagent(0, "scout")
    endSubagent(0, true)
    expect(list().some((r) => r.requestType === "subagent:scout")).toBe(true)
  })

  it("并发的几个各是一条，互不覆盖", () => {
    untilToolRunning()
    startSubagent(0, "scout")
    startSubagent(1, "planner")
    startSubagent(2, "scout")
    endSubagent(1, true)
    endSubagent(0, true)
    endSubagent(2, true)
    const subs = list().filter((r) => r.requestType.startsWith("subagent:"))
    expect(subs).toHaveLength(3)
    expect(subs.every((r) => r.status === "completed")).toBe(true)
  })

  it("失败的那个记 failed，**并带上原因**", () => {
    untilToolRunning()
    startSubagent(0, "scout")
    endSubagent(0, false, "子进程以退出码 3 结束")
    const sub = list().find((r) => r.requestType.startsWith("subagent:"))!
    expect(sub.status).toBe("failed")
    expect(sub.hasError).toBe(true)
    expect(sub.terminalReason).toContain("退出码 3")
  })

  it("**没有开着的工具调用也要记** —— 只是没有 parent，不是丢掉它", () => {
    // 与 tool_start 那条同源：丢掉等于让一次真实发生的执行不留痕迹
    rec.beginTurn(SESSION)
    startSubagent(0, "scout")
    endSubagent(0, true)
    const sub = list().find((r) => r.requestType.startsWith("subagent:"))!
    expect(sub).toBeDefined()
    expect(sub.parentRunId).toBeUndefined()
  })

  it("**会话结束时还开着的要收成 cancelled** —— 不留永久 running 的孤儿", () => {
    untilToolRunning()
    startSubagent(0, "scout")
    rec.ingest({ kind: "exited", sessionId: SESSION, exitCode: 0 })
    const sub = list().find((r) => r.requestType.startsWith("subagent:"))!
    expect(sub.status).toBe("cancelled")
    expect(sub.terminalReason).toBeTruthy()
  })

  it("同一个 index 在两次不同的工具调用里不打架", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c1", toolName: "subagent", input: {} })
    rec.ingest({ kind: "subagent_start", sessionId: SESSION, toolCallId: "c1", index: 0, agent: "scout", task: "a" })
    rec.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "c2", toolName: "subagent", input: {} })
    rec.ingest({ kind: "subagent_start", sessionId: SESSION, toolCallId: "c2", index: 0, agent: "planner", task: "b" })
    rec.ingest({ kind: "subagent_end", sessionId: SESSION, toolCallId: "c1", index: 0, ok: true })

    const subs = list().filter((r) => r.requestType.startsWith("subagent:"))
    expect(subs).toHaveLength(2)
    expect(subs.find((r) => r.requestType === "subagent:scout")!.status).toBe("completed")
    // c2 的那个还开着，没有被 c1 的 end 误关
    expect(subs.find((r) => r.requestType === "subagent:planner")!.status).toBe("running")
  })
})


/**
 * 内核执行的记账（②-B 前置 · 2026-08-11）。
 *
 * ## 这里修的是账本在撒谎
 *
 * 内核会话与 native 一样走 `beginTurn`，所以**每段代码都有 Run**——
 * 我一度以为「内核执行完全不进账本」，核代码时发现不是。真实的缺口更具体，
 * 也更难看：
 *
 *   1. **跑挂了的代码，账本上记的是「完成、无错」**。`idle` 分支无条件写
 *      `completed / hasError: false`，而内核报错的方式是 iopub 上一条 `error` 条目，
 *      没有退出码。**那不是漏记，是记了一件没发生的事**——
 *      账本本该是事实层（不变式 5）。
 *   2. **`requestType` 一律 `agent_turn`**：账本上一段 R 代码和一次模型对话
 *      长得一模一样，「这是执行代码」这个事实就此消失。
 *      路线图 S16 早写了 `execute_r` / `execute_py` 两个名字。
 */
describe("内核执行", () => {
  const 报错 = (ename: string, evalue: string) =>
    ({
      kind: "kernel_output" as const,
      sessionId: SESSION,
      entry: {
        kind: "error" as const,
        ename,
        evalue,
        traceback: [],
        provenance: { kernelInstanceId: "k1", kernelRevision: 1, at: "2026-08-11T00:00:00.000Z" },
      },
    }) as never

  it("**跑挂了就记 failed，并带上原因** —— 不能因为「这一轮结束了」就叫完成", () => {
    rec.beginTurn(SESSION, "execute_python")
    rec.ingest(报错("NameError", "name 'foo' is not defined"))
    rec.ingest({ kind: "idle", sessionId: SESSION })

    const r = list()[0]!
    expect(r.status).toBe("failed")
    expect(r.hasError).toBe(true)
    expect(r.terminalReason).toContain("NameError")
    expect(r.terminalReason).toContain("foo")
  })

  it("没报错照旧是 completed", () => {
    rec.beginTurn(SESSION, "execute_python")
    rec.ingest({ kind: "idle", sessionId: SESSION })
    const r = list()[0]!
    expect(r.status).toBe("completed")
    expect(r.hasError).toBe(false)
  })

  it("**下一轮不背上一轮的错** —— 错误状态要随收口清掉", () => {
    rec.beginTurn(SESSION, "execute_python")
    rec.ingest(报错("ValueError", "bad"))
    rec.ingest({ kind: "idle", sessionId: SESSION })

    rec.beginTurn(SESSION, "execute_python")
    rec.ingest({ kind: "idle", sessionId: SESSION })

    const all = list()
    expect(all.filter((r) => r.status === "failed")).toHaveLength(1)
    expect(all.filter((r) => r.status === "completed")).toHaveLength(1)
  })

  it("**只认结构化的 error 条目，不按文本猜** —— stream 里出现 error 字样的多了去了", () => {
    rec.beginTurn(SESSION, "execute_python")
    rec.ingest({
      kind: "kernel_output",
      sessionId: SESSION,
      entry: {
        kind: "stream",
        name: "stderr",
        text: "WARNING: error rate is 0.3",
        provenance: { kernelInstanceId: "k1", kernelRevision: 1, at: "2026-08-11T00:00:00.000Z" },
      },
    } as never)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    // 一句提到 error 的日志**不是**一次失败。按文本猜就是在编造事实
    expect(list()[0]!.status).toBe("completed")
  })

  it("**账本上分得出「跑了一段代码」和「说了一句话」**", () => {
    rec.beginTurn(SESSION, "execute_r")
    expect(list()[0]!.requestType).toBe("execute_r")
  })

  it("没报错但会话崩了，仍按会话收尾那条路走（不被错误状态干扰）", () => {
    rec.beginTurn(SESSION, "execute_python")
    rec.ingest(报错("KeyboardInterrupt", ""))
    rec.ingest({ kind: "exited", sessionId: SESSION, exitCode: 1 })
    const r = list()[0]!
    // 会话崩了的收尾自有其 terminalReason，这条只验它没被当成 completed
    expect(r.status).not.toBe("completed")
  })
})

/**
 * **每条 Run 都记得住它跑在哪个环境**（②-B · R5，2026-08-13）。
 *
 * ②-B 的判据原文：「两次运行都留下可查的 Run 记录，**且记录里有环境快照**」。
 * 此前 `runs` 表没有这一列——环境只挂在溯源链上，Run 自己指不到自己的环境。
 *
 * **记账的不需要知道那是解释器还是机器**：它只记一个 id。
 * 「该报哪一份」的判断在后端，「两份可不可比」的判断在 `env/snapshot.ts`。
 */
describe("Run 记得住它跑在哪个环境（R5）", () => {
  /**
   * 先把快照真的存进去，再让 run 指过来。
   *
   * **`runs.environment_snapshot_id` 上有外键**，编一个 id 会被库直接拒——
   * 这条约束是特意留的：**一个指向不存在快照的 id 比没有 id 更坏**，
   * 它在界面上看起来「有环境」，点进去却什么都没有。
   */
  function 存一份(): string {
    return new EnvironmentStore(db).putShell(
      { kind: "shell", where: "local", os: "Linux", arch: "x86_64" },
      "2026-08-13T00:00:00.000Z",
    )
  }

  function 带环境(环境: (s: string) => string | undefined): RunRecorder {
    return new RunRecorder({
      runs,
      projectOf: (s) => (s === SESSION ? PROJECT : undefined),
      environmentOf: 环境,
      now: () => new Date(1_800_000_000_000 + clock++ * 1000).toISOString(),
    })
  }

  it("建 run 时把当前会话的环境记上", () => {
    const id = 存一份()
    带环境(() => id).beginTurn(SESSION)
    expect(list()[0]!.environmentSnapshotId).toBe(id)
  })

  /**
   * **指向一份不存在的快照，库会拒**（外键）。
   *
   * 证据不许悬空：id 在、快照不在的话，「这次跑在什么环境里」
   * 会变成一个答不上来却看起来答得上来的问题。
   */
  it("**环境 id 必须真的对应一份快照** —— 悬空的引用当场被拒", () => {
    expect(() => 带环境(() => "并不存在的快照").beginTurn(SESSION)).toThrow(/FOREIGN KEY/)
  })

  /**
   * **取不到就不记**，与 `projectOf` 同一条纪律。
   * 缺这一格读作「不知道这次跑在什么环境里」——随手补一个当前环境上去，
   * 就是拿今天的环境冒充当时的（不变式 5）。
   */
  it("**取不到就不记这一格** —— 缺席读作「不知道」，不是「没有环境」", () => {
    带环境(() => undefined).beginTurn(SESSION)
    const r = list()[0]!
    expect("environmentSnapshotId" in r, "不知道就不该有这个字段").toBe(false)
  })

  it("不给 environmentOf 也照常记账 —— 它是加分项，不是准入条件", () => {
    rec.beginTurn(SESSION)
    expect(list()).toHaveLength(1)
  })

  /**
   * **子 run 也要有。** 一个 agent 回合里的每次工具调用各是一条 run，
   * 它们跑在同一个环境里；漏掉的话账本上会出现「父的知道、子的不知道」，
   * 而那看起来像是中途换了环境。
   */
  it("回合里的工具调用也带着环境", () => {
    const id = 存一份()
    const r = 带环境(() => id)
    r.beginTurn(SESSION)
    r.ingest({ kind: "tool_start", sessionId: SESSION, toolCallId: "t1", toolName: "bash", input: {} })
    r.ingest({
      kind: "tool_end", sessionId: SESSION, toolCallId: "t1", toolName: "bash",
      isError: false, text: "", truncated: false, bytes: 0,
    })
    const 全部 = list()
    expect(全部.length, "工具调用没有落成一条 run").toBeGreaterThan(1)
    for (const one of 全部) {
      expect(one.environmentSnapshotId, `${one.requestType} 少了环境`).toBe(id)
    }
  })
})
