/**
 * Run 记账员（Task 3.5 · S16′）。
 *
 * **不变式 3「没有不可见的行动」的落地点。** 系统里发生的每一件事，
 * 都是账本上一个有明确 executor 的条目。
 *
 * 在它之前，`RunStore` 写好了、协议有 `listRuns`/`getRun`、界面有历史栏，
 * **但那张表从头到尾是空的**——没有任何生产代码创建过 Run。
 * 测试全绿，功能是死的。
 *
 * ## 为什么它前移到 ①-B′
 *
 * 其余功能都是新增路径，随时可加。Run 不是——它要求**每条执行路径在诞生时
 * 就记账**。桌面全建完再补，每个已有的执行入口都要回头改。Rho 就是这么被咬的：
 * 其 durable run 行少一个 `project_root`，整个「运行对比」被阻塞，
 * 必须先做三个基线加固包。**三个包的代价，换一个字段。**
 *
 * ## 只记录，不解释
 *
 * 这里不做审计、不做对比、不算成本、不写溯源面板（那些是 S21–S24）。
 * 它只回答一件事：**发生过什么，什么时候，谁干的，结果是什么。**
 */
import { randomUUID } from "node:crypto"
import type { RunStore } from "../store/runs.js"
import type { AgentEvent, SessionId } from "../runtime/types.js"

export interface RunRecorderOptions {
  runs: RunStore
  /**
   * 会话 → 项目。**取不到就不记**。
   *
   * Rho 的原话：*"Inferring project identity from source paths, the current open
   * project, adjacent timestamps, or artifact filenames is **forbidden**."*
   * 猜一个归属等于伪造事实（不变式 5）——宁可没有这条记录。
   */
  projectOf: (sessionId: SessionId) => string | undefined
  /** 可注入的时钟，测试用。生产走 `Date` */
  now?: () => string
}

/** 一个会话当前开着的账目 */
interface Open {
  /** 正在进行的 agent 回合。同一时刻至多一个 */
  turnRunId?: string | undefined
  /** 正在执行的工具，按 pi 的 toolCallId 索引 */
  tools: Map<string, string>
  /** PTY 会话本身的那条 Run */
  sessionRunId?: string | undefined
}

export class RunRecorder {
  private readonly runs: RunStore
  private readonly projectOf: (sessionId: SessionId) => string | undefined
  private readonly now: () => string
  private readonly open = new Map<SessionId, Open>()

  constructor(opts: RunRecorderOptions) {
    this.runs = opts.runs
    this.projectOf = opts.projectOf
    this.now = opts.now ?? (() => new Date().toISOString())
  }

  private slot(sessionId: SessionId): Open {
    let s = this.open.get(sessionId)
    if (!s) {
      s = { tools: new Map() }
      this.open.set(sessionId, s)
    }
    return s
  }

  private begin(
    sessionId: SessionId,
    requestType: string,
    origin: "user" | "agent" | "system",
    parentRunId?: string,
  ): string | undefined {
    const projectId = this.projectOf(sessionId)
    if (!projectId) return undefined
    const runId = randomUUID()
    this.runs.insert({
      runId,
      projectId,
      sessionId,
      origin,
      requestType,
      status: "running",
      startedAt: this.now(),
      hasError: false,
      ...(parentRunId ? { parentRunId } : {}),
    })
    return runId
  }

  /**
   * 用户发话，一个 agent 回合开始。
   *
   * `origin: "user"`——**是人发起的**，哪怕干活的是 agent。
   * 这个区分是不变式 5 的一部分：将来要能回答「这次改动是谁要求的」。
   */
  beginTurn(sessionId: SessionId): void {
    // **PTY 会话按会话记账，不按回合。** 往 PTY 里写的是按键，不是"发一句话"——
    // 把每次按键记成一个回合会把账本变成噪音。这个判断放在这里而不是调用方，
    // 是为了让「PTY 记什么粒度」只有一处定义
    if (this.open.get(sessionId)?.sessionRunId) return
    const runId = this.begin(sessionId, "agent_turn", "user")
    if (runId) this.slot(sessionId).turnRunId = runId
  }

  /**
   * PTY 会话开始。
   *
   * **按实测修正了计划。** 计划写的是「PTY 命令」一条 Run，但 PTY 只给字节流——
   * 命令的边界不可观测：按回车算一条？被 TUI 吃掉的按键算不算？粘贴的多行呢？
   * 猜边界就是在编造事实。**可观测的是会话**，所以记会话，
   * 并在退出时带上真实的退出码。
   */
  beginPtySession(sessionId: SessionId): void {
    const runId = this.begin(sessionId, "pty_session", "user")
    if (runId) this.slot(sessionId).sessionRunId = runId
  }

  /** 把运行时事件记成账 */
  ingest(event: AgentEvent): void {
    const s = this.open.get(event.sessionId)

    if (event.kind === "tool_start") {
      // 没有开着的回合也要记——**只是没有 parent，不是丢掉它**。
      // 丢掉等于让一次真实发生的工具执行不留痕迹，违反不变式 3
      /**
       * **把工具名记进 `requestType`。**
       *
       * R3 之后账本能回答「哪次工具调用改了哪个文件」，却回答不了
       * 「那是什么工具」——而 U4 的变更 pane 要求**标明是哪次工具调用改的**，
       * 只给一个匿名序号等于没标。
       *
       * `requestType` 本来就是开放字符串（协议注释：「①-B 只产生 agent_turn，
       * ②-A 会加 execute_r / execute_py」），正好承载它。
       * **拿不到名字时退回裸 `tool_call`，不编一个**。
       */
      const kind = event.toolName ? `tool_call:${event.toolName}` : "tool_call"
      const runId = this.begin(event.sessionId, kind, "agent", s?.turnRunId)
      if (runId) this.slot(event.sessionId).tools.set(event.toolCallId, runId)
      return
    }

    if (event.kind === "tool_files") {
      /**
       * **文件事实到达得比 `tool_end` 早**（包装器算完就发，pi 的 end 事件还要再走一圈），
       * 所以那条 Run 还开着，直接补上即可。
       *
       * 收不到这个事件的工具调用，Run 上就**没有**这几个字段——
       * 「不知道」与「确认没改」是两回事（不变式 5）。
       */
      const runId = s?.tools.get(event.toolCallId)
      if (!runId) return
      this.runs.patchFiles(runId, {
        filesWritten: event.filesWritten,
        filesRead: event.filesRead,
        mayIncludeUserEdits: event.mayIncludeUserEdits,
      })
      return
    }

    if (event.kind === "tool_end") {
      const runId = s?.tools.get(event.toolCallId)
      if (!runId) return
      s!.tools.delete(event.toolCallId)
      this.runs.finish(runId, {
        status: event.isError ? "failed" : "completed",
        finishedAt: this.now(),
        hasError: event.isError,
      })
      return
    }

    if (event.kind === "idle") {
      /**
       * **回合在这里收尾，不在 `turn_end`。**
       *
       * 2026-08-09 真机实测：pi 在**每次模型响应后**都发一次 `turn_end`——
       * 877 次工具调用对应 877 次 `turn_end`。若在那里收尾，
       * 一轮里的第二次之后的工具调用就全成了**没有父账的孤儿**。
       * 上一次验证只有一次工具调用，正好把这个缺陷掩盖了。
       *
       * 真正的边界是 `prompt()` resolve，运行时把它翻译成 `idle`。
       */
      const runId = s?.turnRunId
      if (!runId) return
      s!.turnRunId = undefined
      this.runs.finish(runId, { status: "completed", finishedAt: this.now(), hasError: false })
      return
    }

    if (event.kind === "exited") {
      this.closeAll(event.sessionId, event.exitCode)
      return
    }
  }

  /**
   * 会话结束：把所有还开着的账目收尾。
   *
   * **不留永久 running 的孤儿。** 一条永远 running 的 Run 比没有这条记录更坏——
   * 它会让「有没有跑完」这个问题得到一个错误答案，而错误答案比"不知道"危险。
   * 被动收尾的记 `terminalReason`，如实说明它们不是自己跑完的。
   */
  private closeAll(sessionId: SessionId, exitCode: number): void {
    const s = this.open.get(sessionId)
    if (!s) return
    const finishedAt = this.now()

    for (const runId of s.tools.values()) {
      this.runs.finish(runId, {
        status: "cancelled",
        finishedAt,
        hasError: true,
        terminalReason: "会话结束时该工具调用仍在执行",
      })
    }
    s.tools.clear()

    if (s.turnRunId) {
      this.runs.finish(s.turnRunId, {
        status: "cancelled",
        finishedAt,
        hasError: true,
        terminalReason: "会话结束时该回合仍未收尾",
      })
      s.turnRunId = undefined
    }

    if (s.sessionRunId) {
      this.runs.finish(s.sessionRunId, {
        status: exitCode === 0 ? "completed" : "failed",
        finishedAt,
        hasError: exitCode !== 0,
        exitCode,
        ...(exitCode === 0 ? {} : { terminalReason: `退出码 ${exitCode}` }),
      })
      s.sessionRunId = undefined
    }

    this.open.delete(sessionId)
  }

  /** 会话不再关心时清掉内存。**不动数据库**——账本是账本 */
  forget(sessionId: SessionId): void {
    this.open.delete(sessionId)
  }
}
