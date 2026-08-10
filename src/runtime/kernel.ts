/**
 * 内核 runtime：让 Jupyter 内核成为**第四种会话**（②-A · K4）。
 *
 * ## 为什么是「第四种 kind」而不是一套新东西
 *
 * `AgentRuntime` 已经有三种实现（native / pty / cli），
 * 而会话生命周期、租约、transcript、账本、界面全都挂在这个接口上。
 * 内核做成第四种，**这些一次都不用重写**：
 *
 * | 接口 | 内核这边是什么 |
 * |---|---|
 * | `write(sessionId, code)` | 执行一段代码 |
 * | `abort(sessionId)` | **中断**（不杀内核） |
 * | `stop(sessionId)` | 关停内核 |
 *
 * `setModel` / `contextUsage` / `steer` 不实现——**内核没有这些概念**。
 * 接口本来就是可选的，硬塞一个空实现等于对上层撒谎。
 *
 * ## 判据决定了内核挂在哪
 *
 * ②-A 的判据是*「人和 agent **共用同一个活会话**」*。这句话直接推出
 * **内核的粒度是会话，而会话属于项目**——人在 Console 里定义的变量，
 * agent 下一次执行必须读得到。做成「每次对话一个内核」就不成立了。
 */
import { launchKernelChannel } from "../kernel/channel.js"
import { translateOutput } from "../kernel/outputs.js"
import { discoverKernelSpecs } from "../kernel/specs.js"
import { parseVariablesFor, probeExpressionFor, type VariableSummary } from "../kernel/variables.js"
import type { KernelChannel } from "../kernel/types.js"
import { UserFacingError } from "../errors.js"
import type { AgentEvent, AgentRuntime, EventSink, SessionHandle, SessionId, SessionSpec } from "./types.js"

interface Live {
  channel: KernelChannel
  /** kernelspec 声明的语言。**内省表达式按它挑**，拿不到就不猜 */
  language: string | undefined
  /** 这一轮的 `execute_request` msg_id。**用来把输出认回它的父** */
  current?: string | undefined
}

export interface KernelRuntimeOptions {
  /** 当前该记到哪条 run 上。**每次取，不缓存**——一个内核跨很多轮 */
  runIdOf?: (sessionId: SessionId) => string | undefined
}

export class KernelRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, Live>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()

  constructor(private readonly opts: KernelRuntimeOptions = {}) {}

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const k = spec.kernel
    if (!k) {
      // **响亮失败**：没有内核就没有内核，猜一个默认值是在替用户做决定
      throw new UserFacingError("这个会话没有指定内核（配置里给 `language` 或 `command`）")
    }
    const byPath = "interpreterPath" in k

    const channel = await launchKernelChannel({
      ...(byPath
        ? { interpreter: { language: k.language, path: k.interpreterPath } }
        : { kernelName: k.kernelName }),
      cwd: spec.workspace,
      ...(this.opts.runIdOf ? { runIdOf: () => this.opts.runIdOf!(spec.sessionId) } : {}),
    })

    /**
     * 语言。**按路径起时它是明确的**（用户自己选的）；
     * 走 kernelspec 时才需要去问 spec，拿不到就是 undefined，
     * 变量面板据此说「不支持」——**不猜**。
     */
    const language = byPath
      ? k.language
      : discoverKernelSpecs().specs.find((x) => x.name === k.kernelName)?.language
    this.sessions.set(spec.sessionId, { channel, language })

    /**
     * **一条 iopub 消息进来就翻成结构化条目发出去。**
     *
     * 不在这里攒、不在这里合并：合并是渲染层的事，
     * 而**攒起来的那一刻就丢掉了「什么时候到的」**。
     */
    channel.on("*", (tagged) => {
      const live = this.sessions.get(spec.sessionId)
      if (!live) return
      // **只认这一轮的输出**：内核可能还在吐上一轮的尾巴
      const parent = tagged.message.parent_header?.msg_id
      if (live.current && parent && parent !== live.current) return

      for (const entry of translateOutput(tagged)) {
        this.emit({ kind: "kernel_output", sessionId: spec.sessionId, entry })
        /**
         * **`idle` 是这一轮的边界**，账本靠它给回合收口。
         *
         * 与 native 那边同一条纪律：不能拿 `execute_reply` 当边界——
         * iopub 与 shell 是两条独立通道，**reply 到了不代表输出到齐**
         * （K1 里那个「Python 过、R 红」正是这么来的）。
         */
        if (entry.kind === "status" && entry.state === "idle" && live.current) {
          live.current = undefined
          this.emit({ kind: "turn_end", sessionId: spec.sessionId })
          this.emit({ kind: "idle", sessionId: spec.sessionId })
        }
      }
    })

    this.emit({ kind: "started", sessionId: spec.sessionId, pid: 0 })
    return { sessionId: spec.sessionId, pid: 0 }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    const set = this.sinks.get(sessionId) ?? new Set()
    set.add(sink)
    this.sinks.set(sessionId, set)
    return () => set.delete(sink)
  }

  /** 写 = 执行一段代码。**同步返回**，与 native/cli 的契约一致 */
  write(sessionId: SessionId, data: string): void {
    const live = this.sessions.get(sessionId)
    if (!live) throw new Error(`没有这个内核会话：${sessionId}`)
    const code = data.trim()
    // **空白不发**：一个空的 execute_request 会让内核走一遍 busy/idle，
    // 界面上表现为「我什么都没做，它闪了一下」
    if (!code) return
    // **消息由适配器构造**：这个文件不许碰 nteract（rxjs 边界只有一处）
    live.current = live.channel.execute(code)
  }

  /**
   * 中断。**不杀内核**——K3 的全部意义就在这里。
   *
   * 与 PTY 的「往终端送 Ctrl-C」是两件事：那是 `write` 的语义，
   * 而这是控制面的动作，走的是信号或 control 通道。
   */
  async abort(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live) throw new Error(`没有这个内核会话：${sessionId}`)
    live.channel.interrupt()
  }

  async stop(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live) return
    this.sessions.delete(sessionId)
    await live.channel.close()
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
    this.sinks.delete(sessionId)
  }

  /**
   * 这个会话现在有哪些变量（②-A · K5 · S14）。
   *
   * **三种结果要分清**，它们对用户意味着完全不同的事：
   *   - `undefined` —— 没有这个会话
   *   - `{ supported: false, reason }` —— 这个语言我们还不会问（例如 R）
   *   - `{ supported: true, variables }` —— 问到了（可能是空的，那才是「真没有变量」）
   *
   * **不能把后两者混成一个空列表**：那会把「我们没去问」说成「这里什么都没有」。
   */
  async variables(sessionId: SessionId): Promise<
    { supported: false; reason: string } | { supported: true; variables: VariableSummary[] } | undefined
  > {
    const live = this.sessions.get(sessionId)
    if (!live) return undefined
    const expr = probeExpressionFor(live.language)
    if (!expr) {
      return {
        supported: false,
        reason: `变量面板暂时只支持 Python 与 R 内核（这个内核的语言是 ${live.language ?? "未声明"}）`,
      }
    }
    // **按语言挑解析器**：Python 走 base64+JSON，R 走十六进制+分隔符
    const parsed = parseVariablesFor(live.language, await live.channel.probe(expr))
    if (!parsed) {
      // **问了但没问出来**，与「不支持」和「真没有」都不同
      return { supported: false, reason: "问了内核，但没拿到能解析的回答" }
    }
    return { supported: true, variables: parsed }
  }

  /** 内核实例身份。重启即变——上层落库时要用同一个值 */
  kernelInstanceId(sessionId: SessionId): string | undefined {
    return this.sessions.get(sessionId)?.channel.kernelInstanceId
  }

  private emit(e: AgentEvent): void {
    for (const sink of this.sinks.get(e.sessionId) ?? []) sink(e)
  }
}
