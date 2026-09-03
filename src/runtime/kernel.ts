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
import { attachKernelChannel, launchKernelChannel, type KernelProcess } from "../kernel/channel.js"
import { translateOutput } from "../kernel/outputs.js"
import { discoverKernelSpecs, diagnoseInterpreter } from "../kernel/specs.js"
import { 起远端内核, 停远端内核, 内核文件名, 远端启动失败 } from "../remote/kernel-launch.js"
import { 五条隧道 } from "../remote/tunnel.js"
import { parseVariablesFor, probeExpressionFor, type VariableSummary } from "../kernel/variables.js"
import {
  environmentProbeFor,
  parseEnvironmentFor,
  type EnvironmentSnapshot,
} from "../kernel/environment.js"
import type { KernelChannel } from "../kernel/types.js"
import { UserFacingError } from "../errors.js"
import type { AgentEvent, AgentRuntime, EventSink, SessionHandle, SessionId, SessionSpec } from "./types.js"

interface Live {
  channel: KernelChannel
  /** kernelspec 声明的语言。**内省表达式按它挑**，拿不到就不猜 */
  language: string | undefined
  /** 这一轮的 `execute_request` msg_id。**用来把输出认回它的父** */
  current?: string | undefined
  /**
   * 准入时刻冻结的环境快照（S17）。**只在 `start` 里写一次**——
   * 会话中途 `pip install` 了什么，这一份不跟着变：
   * 它记的是「这个会话是在什么环境里起来的」。
   */
  environment?: EnvironmentSnapshot | undefined
  /** 远端那台（远程内核，2026-09-03）：停与断线要用 */
  远端?: {
    connectionId: string | undefined
    label: string
    executor: NonNullable<SessionSpec["remote"]>["executor"]
    起的: { pid: number; 文件: string }
    关隧道: () => Promise<void>
  }
}

export interface KernelRuntimeOptions {
  /** 当前该记到哪条 run 上。**每次取，不缓存**——一个内核跨很多轮 */
  runIdOf?: (sessionId: SessionId) => string | undefined
  /**
   * 收下一份准入时刻的环境快照（S17）。
   *
   * **端口注入**：这一层不认识数据库。谁存、存哪，由装配它的人决定。
   */
  onEnvironment?: (sessionId: SessionId, snapshot: EnvironmentSnapshot) => void
  /** 装机 id（远端文件名里带它）。不给就 `noid`——那时两台电脑共用一个账号会互相扫掉 */
  installId?: () => string
  /** 远端起停 / 隧道 / 接通道。**注入只为可测**，缺省是真的 */
  远端?: {
    起远端内核: typeof 起远端内核
    停远端内核: typeof 停远端内核
    五条隧道: typeof 五条隧道
    attach: typeof attachKernelChannel
  }
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

    /**
     * **这段对话长在哪台机器上，内核就在哪台起**（远程内核，2026-09-03）。
     *
     * 远端那条的顺序是定死的：**起内核 → 五条隧道 → attach**。
     * 每一步失败都要把前一步收摊掉——半路留一个跑着的远端内核，
     * 用户既看不见它、也停不掉它，只能等下次连上时被「扫残留」清走。
     */
    const remote = spec.remote
    let channel: KernelChannel
    let 远端记: Live["远端"]
    if (remote) {
      if (!byPath) {
        throw new UserFacingError("远端内核只能按解释器路径起——kernelspec 是本机的概念")
      }
      const 远 = this.opts.远端 ?? { 起远端内核, 停远端内核, 五条隧道, attach: attachKernelChannel }
      const label = remote.label ?? remote.connectionId ?? "远端"
      const ex = remote.executor
      // **响亮失败**：没有 forwardOut 就没有隧道，而没有隧道 zeromq 那五个端口一个都连不上
      if (typeof ex.forwardOut !== "function") {
        throw new UserFacingError(`到 ${label} 的执行器不支持端口隧道，起不了远端内核`)
      }
      const forwardOut = ex.forwardOut.bind(ex)
      const exec = ex.exec.bind(ex)
      let 起的: Awaited<ReturnType<typeof 起远端内核>>
      try {
        起的 = await 远.起远端内核(exec, {
          语言: k.language,
          解释器路径: k.interpreterPath,
          cwd: remote.cwd.get(),
          文件名: 内核文件名(this.opts.installId?.() ?? "noid", k.language),
        })
      } catch (e) {
        // 三种实情同一套诊断；路径存不存在这里判不了（在远端），所以 exists 注入成永远在
        const d = diagnoseInterpreter(
          k.language,
          k.interpreterPath,
          e instanceof 远端启动失败 ? e.日志尾 : "",
          () => true,
        )
        throw new UserFacingError(
          `${label}：${
            d
              ? d.message + ("evidence" in d && d.evidence ? `\n${d.evidence}` : "")
              : e instanceof Error
                ? e.message
                : String(e)
          }`,
        )
      }
      let 隧: Awaited<ReturnType<typeof 五条隧道>>
      try {
        隧 = await 远.五条隧道({ forwardOut }, 起的.连接信息)
      } catch (e) {
        await 远.停远端内核(exec, 起的).catch(() => {})
        throw new UserFacingError(
          `到 ${label} 的端口隧道建不起来（sshd 可能关了 AllowTcpForwarding）：${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
      const 信号 = (s?: NodeJS.Signals) => (s === "SIGINT" ? "INT" : s === "SIGKILL" ? "KILL" : "TERM")
      const process: KernelProcess = {
        pid: 起的.pid,
        // 走 SSH，fire-and-forget：`kill(signal)` 的契约是同步的
        kill: (s) => void exec(`kill -${信号(s)} ${起的.pid} 2>/dev/null; true`).catch(() => {}),
      }
      try {
        channel = await 远.attach({
          连接信息: 隧.本地,
          process,
          language: k.language,
          label: `${k.interpreterPath} @ ${label}`,
          // 远端也走信号（上面那个 `kill` 会 `kill -INT` 过去），不用 control 通道
          interruptMode: "signal",
          ...(this.opts.runIdOf ? { runIdOf: () => this.opts.runIdOf!(spec.sessionId) } : {}),
          diagnose: (ev) => diagnoseInterpreter(k.language, k.interpreterPath, ev, () => true),
        })
      } catch (e) {
        await 隧.关().catch(() => {})
        await 远.停远端内核(exec, 起的).catch(() => {})
        throw e
      }
      远端记 = {
        connectionId: remote.connectionId,
        label,
        executor: ex,
        起的: { pid: 起的.pid, 文件: 起的.文件 },
        关隧道: 隧.关,
      }
    } else {
      channel = await launchKernelChannel({
        ...(byPath
          ? { interpreter: { language: k.language, path: k.interpreterPath } }
          : { kernelName: k.kernelName }),
        cwd: spec.workspace,
        ...(this.opts.runIdOf ? { runIdOf: () => this.opts.runIdOf!(spec.sessionId) } : {}),
      })
    }

    /**
     * 语言。**按路径起时它是明确的**（用户自己选的）；
     * 走 kernelspec 时才需要去问 spec，拿不到就是 undefined，
     * 变量面板据此说「不支持」——**不猜**。
     */
    const language = byPath
      ? k.language
      : discoverKernelSpecs().specs.find((x) => x.name === k.kernelName)?.language
    this.sessions.set(spec.sessionId, { channel, language, ...(远端记 ? { 远端: 远端记 } : {}) })

    /**
     * **准入时刻冻结环境**（S17）。
     *
     * 位置就是这里，不是第一次执行的时候：一旦人跑了一句 `pip install`，
     * 「这个会话起来时是什么环境」这个问题就再也答不上来了。
     *
     * 失败不阻断会话——**探测不到只是少一份证据，不是不能干活**。
     * 但它要出声（规格 7.5），所以走 `console.error` 而不是静静吞掉。
     */
    void this.captureEnvironment(spec.sessionId)

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

    /**
     * **内核进程意外死亡也要收口**（审查 debug H2）:OOM / 段错误时既没有 idle 也没有
     * 我们主动 close,`执行()` 的 promise 会永挂,那一轮 run_code「发过去了永远没回音」。
     * 转发进程死亡为一条 exited,让在等的那一轮结束、这段会话从表里清掉。
     */
    channel.onExit?.(() => {
      const live = this.sessions.get(spec.sessionId)
      if (!live) return // 已经 close 掉了(主动关停走的是 stop 那条路)
      this.sessions.delete(spec.sessionId)
      this.emit({ kind: "notice", sessionId: spec.sessionId, text: "内核进程意外退出了(可能是内存耗尽或崩溃)——这一段代码没有跑完。" })
      this.emit({ kind: "exited", sessionId: spec.sessionId, exitCode: 1 })
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
    const 远 = this.opts.远端 ?? { 停远端内核 }
    // 远端：先让内核自己收尾（TERM → 等 → KILL → 删文件），再关本地 socket，最后关隧道
    if (live.远端) {
      await 远
        .停远端内核(live.远端.executor.exec.bind(live.远端.executor), live.远端.起的)
        .catch((e) => console.error(`[远端内核] 停不掉：${e instanceof Error ? e.message : String(e)}`))
    }
    await live.channel.close()
    if (live.远端) await live.远端.关隧道().catch(() => {})
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
    this.sinks.delete(sessionId)
  }

  /**
   * 一台服务器断了（定案 3：断线 = 内核死）。连接没了，杀不了远端进程——留给下次连上的扫残留；
   * 这里只把本地这半收掉：关隧道、关 socket、出声、发一条带 reason 的 exited 让挂载层与账本收口。
   */
  async 连接断了(connectionId: string): Promise<void> {
    for (const [id, live] of [...this.sessions]) {
      if (live.远端?.connectionId !== connectionId) continue
      this.sessions.delete(id)
      this.emit({
        kind: "notice",
        sessionId: id,
        text: `与 ${live.远端.label} 断开了，${
          live.language === "R" ? "R" : "Python"
        } 内核里的变量已经不在了；重新连接后再跑会起新的一台`,
      })
      await live.channel.close().catch(() => {})
      await live.远端.关隧道().catch(() => {})
      this.emit({ kind: "exited", sessionId: id, exitCode: 1, reason: "disconnected" })
      this.sinks.delete(id)
    }
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
  /**
   * 问一次环境，存进 `Live` 并交给端口。
   *
   * 走的是 `probe`（`silent: true`）**这一点很要紧**：
   * 直接执行一段探测代码的话，用户一打开会话就会看见一堆自己没写过的代码。
   */
  private async captureEnvironment(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live) return
    const expr = environmentProbeFor(live.language)
    // **不支持的语言就不假装有快照。** 空快照会被读成「这个环境什么都没有」
    if (!expr) return
    try {
      const snap = parseEnvironmentFor(live.language, await live.channel.probe(expr))
      if (!snap) {
        console.error(`[环境快照] ${sessionId}：解析不出内核的回答，这个会话没有环境证据`)
        return
      }
      // 会话可能在探测期间就没了——**别把快照挂到一个已经死掉的会话上**
      const still = this.sessions.get(sessionId)
      if (!still) return
      // 远端内核：同一个 conda env 搬到另一台服务器，是另一份快照（指纹里带上是哪台）
      if (still.远端?.connectionId) snap.where = { connectionId: still.远端.connectionId }
      still.environment = snap
      this.opts.onEnvironment?.(sessionId, snap)
    } catch (err) {
      console.error(`[环境快照] ${sessionId}：探测失败——${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 这个会话准入时的环境。**没有就是没有**，不回头再探一次（Rho 的禁令一） */
  environmentOf(sessionId: SessionId): EnvironmentSnapshot | undefined {
    return this.sessions.get(sessionId)?.environment
  }

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
