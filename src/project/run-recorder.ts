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
import type { Cost } from "../protocol/index.js"
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
  /**
   * 会话 → 它准入时那份环境快照的 id（②-B · R5，2026-08-13）。
   *
   * **记账的不需要知道那是解释器还是机器**——它只记一个 id。
   * 内核会话给的是内核快照，其余会话给的是机器快照，
   * 两者**不可比**，而判据在 `env/snapshot.ts`，不在这里。
   *
   * **取不到就不记**，与 `projectOf` 同一条纪律：
   * 缺这个字段读作「不知道这次跑在什么环境里」，
   * 而随手补一个当前环境上去，就是拿今天的环境冒充当时的。
   */
  environmentOf?: (sessionId: SessionId) => string | undefined
  /**
   * **外部 agent 干的活，文件事实从 git 算**（B1 路线 C，2026-08-16）。
   *
   * ## 为什么需要这一条
   *
   * 内置对话的文件事实来自我们自己的工具包装器（`tool_files` 事件）。
   * 而 **ACP agent 用的是它自己的读写工具**——那些调用根本不经过我们，
   * 于是它在项目里干的活在账本上只有「跑了一轮」，**改了什么一概没有**。
   *
   * 不变式 5 说的是「从 git 事实算，不听 agent 声明」。
   * 这条钩子把它用在外部 agent 身上：**回合开始时拍一张，收口时比一次**。
   *
   * ## 两个函数而不是一个
   *
   * 基线必须在**回合开始**拍——收口时再拍就什么都比不出来了。
   * 这个先后关系写在类型里，比写在注释里可靠。
   *
   * 取不到（不是 git 仓库、没有工作区）时**什么都不补**：
   * 「不知道」与「确认没改」是两回事。
   */
  外部文件事实?: {
    拍基线: (sessionId: SessionId) => void
    比一次: (sessionId: SessionId) => Promise<
      { filesWritten: string[]; mayIncludeUserEdits: boolean } | undefined
    >
  }
  /** 可注入的时钟，测试用。生产走 `Date` */
  now?: () => string
}

/**
 * 把「金额那一支」与「攒下的 token」合成一条 `Cost`（2026-08-16）。
 *
 * 三种情况都要说得清：
 *   - 运行时报了金额（`visible: true`）→ 它自己就带着 token，不动它；
 *   - 报了「金额不可见 + 原因」→ 把 token 挂上去（**钱看不见 ≠ token 看不见**）；
 *   - 一条成本事件都没来，但有 token → 也要记，原因写清楚是哪一类拿不到。
 *
 * 一个 token 都没收到时返回原样：**缺省表示「没记到」，不是 0**。
 */
function 合成成本(
  cost: Cost | undefined,
  tokens: { input: number; output: number; cacheRead: number } | undefined,
): Cost | undefined {
  if (!tokens) return cost
  if (cost?.visible === true) return cost
  return {
    visible: false,
    reason: cost?.reason ?? "该 provider 只报 token，不报金额",
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    ...(tokens.cacheRead ? { cacheReadTokens: tokens.cacheRead } : {}),
  }
}

/** 一个会话当前开着的账目 */
interface Open {
  /** 正在进行的 agent 回合。同一时刻至多一个 */
  turnRunId?: string | undefined
  /**
   * 这一轮的成本，等着在 `idle` 时落到那条 run 上。
   *
   * **运行时在 `idle` 之前发它**，因为收口那一刻才写库。
   * 收不到的会话，run 上就**没有**成本字段——那是「尚未记录」，
   * 与「不可见」是两回事（数据库那层用 `cost_visible IS NULL` 表达）。
   */
  pendingCost?: Cost | undefined
  /**
   * 这一轮攒下的 token（2026-08-16）。
   *
   * **一轮里可能有很多次模型调用**（每次工具调用之后都要再问一次模型），
   * 每一次都有自己的用量——所以是**累加**，不是取最后一条。
   * 上一版这条路整个不存在：运行时一直在发 `turn_usage`（上下文栏用的就是它），
   * 而账本一个 token 都没记，于是「用量」那一屏无从谈起。
   *
   * 缺省 = 这一轮一次用量都没收到，**与「花了 0 个」不是一回事**。
   */
  pendingTokens?: { input: number; output: number; cacheRead: number } | undefined
  /** 这一轮实际是谁答的。**后到的覆盖先到的**——换模型发生在轮内时以最后一次为准 */
  pendingModel?: string | undefined
  /**
   * 这一轮里内核报过的错（2026-08-11）。
   *
   * **在 `idle` 收口时决定这条 Run 是 completed 还是 failed。**
   * 内核不像子进程有退出码——它报错的方式是 iopub 上一条 `error` 条目，
   * 而那条来得比 `idle` 早。
   */
  turnError?: string | undefined
  /** 正在执行的工具，按 pi 的 toolCallId 索引 */
  tools: Map<string, string>
  /** toolCallId → 工具名。`远端断了` 只收 `run_code`：断的是内核，本机在飞的 bash 与它无关 */
  工具名: Map<string, string>
  /**
   * 正在跑的子 agent，按 `<toolCallId>#<index>` 索引。
   *
   * **键必须带 toolCallId**：同一轮里可能有两次 subagent 调用，
   * 各自的 index 都从 0 开始，只按 index 索引会互相覆盖——
   * 表现是「第二次调用的第一个子 agent 永远 running」。
   */
  subagents: Map<string, string>
  /** PTY 会话本身的那条 Run */
  sessionRunId?: string | undefined
}

/**
 * 事件里的那个 token → 账本上的一句人话（远程内核，审查 2026-09-04）。
 *
 * `disconnected` 是**协议上的记号**，判断用；而 `terminal_reason` 这一列
 * 别处装的全是中文句子（「会话结束时该工具调用仍在执行」）。
 * 把 token 原样写进去，历史栏上就会冒出一个英文单词，
 * 而**「这一列到底是给人看的还是给代码看的」从此说不清**。
 * 所以 token 一路不变，只在账本这道边界上换成话。
 */
function 落账理由(reason: string | undefined): string | undefined {
  return reason === "disconnected" ? "与服务器断开，这段没跑完" : reason
}

export class RunRecorder {
  private readonly runs: RunStore
  private readonly projectOf: (sessionId: SessionId) => string | undefined
  private readonly environmentOf: (sessionId: SessionId) => string | undefined
  private readonly 外部文件事实: RunRecorderOptions["外部文件事实"]
  private readonly now: () => string
  private readonly open = new Map<SessionId, Open>()

  constructor(opts: RunRecorderOptions) {
    this.runs = opts.runs
    this.projectOf = opts.projectOf
    this.environmentOf = opts.environmentOf ?? (() => undefined)
    this.外部文件事实 = opts.外部文件事实
    this.now = opts.now ?? (() => new Date().toISOString())
  }

  /**
   * 这一段此刻开着的那一轮（B1 路线 B，2026-08-17）。
   *
   * **给网关用**：外部 agent 经 MCP 调我们的工具时，那条 Run 的父账
   * 就是这一轮——没有它，那些调用会变成一堆**没有归属的孤儿**，
   * 而「这一轮它到底干了什么」就再也拼不起来。
   *
   * 缺席 = 此刻没有开着的回合（它在两轮之间调的），**那时就没有父账**，
   * 不硬挂到上一轮头上（那是把 A 的账算到 B 头上）。
   */
  当前回合(sessionId: SessionId): string | undefined {
    return this.open.get(sessionId)?.turnRunId
  }

  private slot(sessionId: SessionId): Open {
    let s = this.open.get(sessionId)
    if (!s) {
      s = { tools: new Map(), 工具名: new Map(), subagents: new Map() }
      this.open.set(sessionId, s)
    }
    return s
  }

  private begin(
    sessionId: SessionId,
    requestType: string,
    origin: "user" | "agent" | "system",
    parentRunId?: string,
    toolCallId?: string,
  ): string | undefined {
    const projectId = this.projectOf(sessionId)
    if (!projectId) return undefined
    const runId = randomUUID()
    // **只在建 run 的这一刻取一次**：run 结束时再去问，问到的是那时的环境
    const env = this.environmentOf(sessionId)
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
      ...(toolCallId ? { toolCallId } : {}),
      ...(env ? { environmentSnapshotId: env } : {}),
    })
    return runId
  }

  /**
   * 用户发话，一个 agent 回合开始。
   *
   * `origin: "user"`——**是人发起的**，哪怕干活的是 agent。
   * 这个区分是不变式 5 的一部分：将来要能回答「这次改动是谁要求的」。
   */
  beginTurn(sessionId: SessionId, requestType = "agent_turn"): void {
    // **PTY 会话按会话记账，不按回合。** 往 PTY 里写的是按键，不是"发一句话"——
    // 把每次按键记成一个回合会把账本变成噪音。这个判断放在这里而不是调用方，
    // 是为了让「PTY 记什么粒度」只有一处定义
    if (this.open.get(sessionId)?.sessionRunId) return
    /**
     * **`requestType` 由调用方给**（2026-08-11）。
     *
     * 内核会话往这里送的是**一段代码**，不是一句话，所以它记
     * `execute_python` / `execute_r`——路线图 S16 早就写了这两个名字。
     * 此前一律记成 `agent_turn`：账本上一段 R 代码和一次模型对话长得一模一样，
     * **而「这是执行代码」这个事实就此消失**。
     */
    // **基线要在回合开始时拍**——收口时再拍就什么都比不出来了
    this.外部文件事实?.拍基线(sessionId)
    const runId = this.begin(sessionId, requestType, "user")
    if (runId) this.slot(sessionId).turnRunId = runId
  }

  /**
   * 你在内核里敲的一段（笔记本，2026-08-26）：一次插入一条**已完成**的 Run。
   *
   * 它不经 `turn_end`——对话的回合是模型的，这段是你的：代码从笔记本送进内核、
   * 等到 `status: idle` 就结束，没有「运行中」需要账本跟着看的那一段。
   * `origin: "user"` 与 `execute_python` / `execute_r` 与内核会话那条同一口径，
   * 账本上一段你亲手跑的代码，能与模型用 run_code 跑的分开数。
   */
  记内核执行(
    sessionId: SessionId,
    language: "python" | "R",
    结果: { hasError: boolean; terminalReason?: string },
    /** 代码送进内核的时刻。**调用方在执行前取**——不给就与 finishedAt 同刻，时长为零 */
    startedAt?: string,
  ): string | undefined {
    const projectId = this.projectOf(sessionId)
    if (!projectId) return undefined
    const runId = randomUUID()
    // 这段对话（不是内核会话）的环境快照——与 beginTurn 同一条约定
    const env = this.environmentOf(sessionId)
    const finishedAt = this.now()
    this.runs.insert({
      runId,
      projectId,
      sessionId,
      origin: "user",
      requestType: language === "R" ? "execute_r" : "execute_python",
      status: 结果.hasError ? "failed" : "completed",
      startedAt: startedAt ?? finishedAt,
      finishedAt,
      hasError: 结果.hasError,
      ...(结果.terminalReason ? { terminalReason: 结果.terminalReason } : {}),
      ...(env ? { environmentSnapshotId: env } : {}),
    })
    return runId
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

    if (event.kind === "cost") {
      /**
       * **先记下，`idle` 时才落库。**
       *
       * 成本属于**这一轮**，而这一轮的 run 要到 `idle` 才收口。
       * 提前 `finish` 会把回合关早，之后的工具调用就变成没有父账的孤儿。
       *
       * 没有开着的回合时丢弃：那意味着这条成本没有归属，
       * 硬记到上一轮上就是把 A 的账算到 B 头上。
       */
      if (s?.turnRunId) s.pendingCost = event.cost
      return
    }

    /**
     * **token 是一轮里累加出来的**（2026-08-16）。
     *
     * 与 `cost` 那条同一副纪律：先攒着、`idle` 才落库；
     * 没有开着的回合就丢弃——**没有归属的账，记到上一轮头上就是算错人**。
     */
    if (event.kind === "turn_usage") {
      if (!s?.turnRunId) return
      const 攒 = s.pendingTokens ?? { input: 0, output: 0, cacheRead: 0 }
      s.pendingTokens = {
        input: 攒.input + (event.usage.input ?? 0),
        output: 攒.output + (event.usage.output ?? 0),
        cacheRead: 攒.cacheRead + (event.usage.cacheRead ?? 0),
      }
      if (event.model) s.pendingModel = event.model
      return
    }

    if (event.kind === "kernel_output") {
      /**
       * **内核报错要落到账本上**（2026-08-11 补）。
       *
       * 此前 `idle` 分支无条件写 `status: "completed", hasError: false`——
       * 于是**一段跑挂了的代码，账本上是「完成、无错」**。
       * 那不是漏记，是**记了一件没发生的事**：不变式 5 说的「声明层与事实层分离」
       * 在这里被反了过来——账本本该是事实层。
       *
       * 只认 `kind: "error"`：`stream` 里出现 "error" 字样的多了去了
       * （编译器警告、日志级别），**按文本猜错误就是在编造事实**。
       */
      if (event.entry.kind === "error" && s?.turnRunId) {
        const { ename, evalue } = event.entry
        s.turnError = evalue ? `${ename}: ${evalue}` : ename
      }
      return
    }

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
      const runId = this.begin(event.sessionId, kind, "agent", s?.turnRunId, event.toolCallId)
      if (runId) {
        const slot = this.slot(event.sessionId)
        slot.tools.set(event.toolCallId, runId)
        if (event.toolName) slot.工具名.set(event.toolCallId, event.toolName)
      }
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
        filesCreated: event.filesCreated,
      })
      return
    }

    if (event.kind === "subagent_start") {
      /**
       * **挂到发起它的那次工具调用下面。**
       *
       * 拿不到父（没有开着的 subagent 工具调用）**照样记，只是没有 parent**——
       * 与上面 `tool_start` 那条同源：丢掉等于让一次真实发生的执行不留痕迹。
       *
       * agent 名字进 `requestType`，理由与 `tool_call:<工具名>` 完全一样：
       * 只给一个序号，账本就回答不了「是谁干的」。
       */
      const parent = s?.tools.get(event.toolCallId)
      const runId = this.begin(event.sessionId, `subagent:${event.agent}`, "agent", parent)
      if (runId) this.slot(event.sessionId).subagents.set(subKey(event), runId)
      return
    }

    if (event.kind === "subagent_end") {
      const runId = s?.subagents.get(subKey(event))
      if (!runId) return
      s!.subagents.delete(subKey(event))
      this.runs.finish(runId, {
        status: event.ok ? "completed" : "failed",
        finishedAt: this.now(),
        hasError: !event.ok,
        // 失败必须带原因（规格 7.5）。没给原因时也要留一句，不留空
        ...(event.ok ? {} : { terminalReason: event.error ?? "子 agent 失败，但没有给出原因" }),
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
      const cost = s!.pendingCost
      const tokens = s!.pendingTokens
      const 模型 = s!.pendingModel
      const 出错 = s!.turnError
      s!.turnRunId = undefined
      s!.pendingCost = undefined
      s!.pendingTokens = undefined
      s!.pendingModel = undefined
      s!.turnError = undefined
      this.runs.finish(runId, {
        // **跑挂了就记 failed**，不能因为「这一轮结束了」就叫完成
        status: 出错 ? "failed" : "completed",
        finishedAt: this.now(),
        hasError: Boolean(出错),
        // 失败必须带原因（规格 7.5）
        ...(出错 ? { terminalReason: 出错 } : {}),
        // **没收到就整个不给这个字段**：`finish` 用 COALESCE，
        // 给 undefined 与不给是一回事，但显式写出来是为了说清楚
        // 「没记到成本」不该被写成 0（那会被读成「免费」）
        /**
         * **token 与金额是两件事**（2026-08-16）。
         *
         * provider 报 token、不报钱，于是这一轮的 `cost` 是
         * `{visible:false, reason}`——上一版就到此为止，token 被扔了。
         * 现在把攒下的三档挂上去：**钱看不见，不代表 token 也看不见。**
         *
         * 一次用量都没收到时**整个字段不给**（不是给 0）：
         * 0 在「用量」那一屏上会被读成「这一轮免费」。
         */
        ...(合成成本(cost, tokens) ? { cost: 合成成本(cost, tokens)! } : {}),
        ...(模型 ? { model: 模型 } : {}),
      })

      /**
       * **外部 agent 的文件事实**（路线 C）。
       *
       * 放在 `finish` 之后、用 `patchFiles` 补：那个方法「只补文件事实，
       * 不动状态」，正是为这种「事实比终态晚到」准备的。
       *
       * **异步且不阻塞收口**：git 要跑几条命令，而回合的终态不该等它。
       * 失败一律吞掉并留 NULL——**「不知道」与「确认没改」是两回事**，
       * 补一个空数组上去就是编造。
       */
      const 比 = this.外部文件事实?.比一次
      if (比) {
        void 比(event.sessionId)
          .then((事实) => {
            if (事实) this.runs.patchFiles(runId, 事实)
          })
          .catch(() => {
            /* 不是 git 仓库、或 git 出错：留 NULL，不编造 */
          })
      }
      return
    }

    if (event.kind === "exited") {
      this.closeAll(event.sessionId, event.exitCode, event.reason)
      return
    }
  }

  /**
   * 远端断了：**这段对话此刻在飞的工具调用按「断线」收尾**（远程内核，审查 2026-09-04）。
   *
   * ## 它为什么不能等 `ingest` 里那条 `exited`
   *
   * 内核死掉时运行时发的 `exited` 带的是**内核会话** id（`c1::python`），
   * 而记账员只被挂在**对话会话**上——那条事件它一辈子看不到。
   * 于是断线时正在飞的 `run_code` 在账本上收成一次普通的失败工具调用，
   * 「为什么失败」这件唯一值得记的事丢了。调用方（`wiring.ts` 的 `状态变了`）
   * 是唯一已经把 id 换回对话的地方，所以由它来叫这一声。
   *
   * ## 只收工具，不收这一轮
   *
   * 死的是内核，不是这段对话：模型会拿到工具的报错、接着把话说完，
   * 那一轮该由它自己的 `idle` 收口。把回合也一起判成 cancelled，
   * 记的就是一件没发生的事（不变式 5：账本是事实层）。
   */
  远端断了(sessionId: SessionId, reason: string): void {
    const s = this.open.get(sessionId)
    if (!s) return
    const finishedAt = this.now()
    // **只收 run_code**：断的是内核。同一刻在飞的本机 bash / 读文件与服务器无关，
    // 给它们也记「与服务器断开」是在账本里写一件没发生的事（不变式 5）
    for (const [callId, runId] of [...s.tools]) {
      if (s.工具名.get(callId) !== "run_code") continue
      this.runs.finish(runId, {
        status: "cancelled",
        finishedAt,
        hasError: true,
        terminalReason: 落账理由(reason) ?? reason,
      })
      s.tools.delete(callId)
      s.工具名.delete(callId)
    }
  }

  /**
   * 会话结束：把所有还开着的账目收尾。
   *
   * **不留永久 running 的孤儿。** 一条永远 running 的 Run 比没有这条记录更坏——
   * 它会让「有没有跑完」这个问题得到一个错误答案，而错误答案比"不知道"危险。
   * 被动收尾的记 `terminalReason`，如实说明它们不是自己跑完的。
   */
  private closeAll(sessionId: SessionId, exitCode: number, reason?: string): void {
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
    s.工具名.clear()

    // 子 agent 在另一个进程里，**它比父会话活得久也是可能的**——
    // 但账本这边必须收口，理由与上面同一条：永久 running 比没有记录更坏
    for (const runId of s.subagents.values()) {
      this.runs.finish(runId, {
        status: "cancelled",
        finishedAt,
        hasError: true,
        terminalReason: "会话结束时该子 agent 仍在执行",
      })
    }
    s.subagents.clear()

    if (s.turnRunId) {
      this.runs.finish(s.turnRunId, {
        status: "cancelled",
        finishedAt,
        hasError: true,
        // 有 reason（例如远程内核断线的 "disconnected"）就记它——
        // 比泛泛的「仍未收尾」更接近真相；没有、或是空串，就还是那句老话
        // （规格 7.5：失败必须出声——空串不该悄悄把这句话顶掉）
        terminalReason: 落账理由(reason) || "会话结束时该回合仍未收尾",
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

/**
 * 子 agent 账目的键。
 *
 * **必须带 `toolCallId`。** 同一轮里可能有两次 subagent 调用，各自的 `index`
 * 都从 0 开始；只按 index 索引会互相覆盖，表现是
 * 「第二次调用的第一个子 agent 永远 running」——一条永久 running 的 Run
 * 比没有这条记录更坏（见 `closeAll` 的注释）。
 */
function subKey(e: { toolCallId: string; index: number }): string {
  return `${e.toolCallId}#${e.index}`
}
