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
import {
  起远端内核,
  停远端内核,
  内核文件名,
  远端启动失败,
  远端活着,
  远端内核还在,
  删远端文件,
} from "../remote/kernel-launch.js"
import { 五条隧道 } from "../remote/tunnel.js"
import { 起心跳, 开心跳口, type 心跳 } from "../kernel/heartbeat.js"
import type { KernelConnectionInfo } from "../kernel/types.js"
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
  /**
   * 隧道本地这头的五个端口（远端才有）。`attachKernelChannel` 把它挂在通道对象上，
   * 但 `KernelChannel` 类型里没有——心跳要开 `hb_port`，所以这里单独存一份
   */
  本地连接信息?: KernelConnectionInfo
  /** 远端那台（远程内核，2026-09-03）：停、断线、接回要用 */
  远端?: {
    connectionId: string | undefined
    label: string
    executor: NonNullable<SessionSpec["remote"]>["executor"]
    起的: { pid: number; 文件: string }
    /** **远端**的五个端口 + key（接回要用它重建隧道，定案 6）。隧道那头的本地端口在 `本地连接信息` 里 */
    连接信息: KernelConnectionInfo
    语言: "python" | "R"
    解释器路径: string
    关隧道: () => Promise<void>
    /**
     * 交给 `attach` 的那个进程句柄。留一份是为了**分离前把它的枪下了**——
     * `channel.close()` 会 `kill("SIGKILL")`，远端那一下是 SSH 上真的 `kill -KILL`。
     */
    句柄: 远端句柄
    /** 猝死察觉（定案 1/2）。开不了心跳口时缺省——那时猝死只靠 5 分钟兜底 */
    心跳?: 心跳
  }
}

/** 远端内核的进程句柄。`杀得了` 拨掉之后 `kill` 是个空动作（见 `远端进程句柄`） */
type 远端句柄 = KernelProcess & { 杀得了: boolean }

/** 掉线后等着接回的那台（定案 6）。**只在内存里**：DAWN 这一次运行内才接回（定案 12） */
interface 分离记录 {
  connectionId: string | undefined
  label: string
  executor: NonNullable<SessionSpec["remote"]>["executor"]
  起的: { pid: number; 文件: string }
  连接信息: KernelConnectionInfo
  语言: "python" | "R"
  解释器路径: string
  language: string | undefined
  environment: EnvironmentSnapshot | undefined
  掉线时刻: number
  掉线时在飞: boolean
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
    开心跳口: typeof 开心跳口
  }
}

export class KernelRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, Live>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /**
   * 隧道已经建起来、但 attach 还没落地的那些（远程内核，2026-09-03）。
   *
   * **`sessions` 还看不见它们**，而握手要等到 kernel_info 应答——正好是最容易撞上断线的
   * 那几秒。不记一笔的话，`连接断了` 扫不到它，五个本地监听端口就此泄漏（进程活多久漏多久）。
   */
  private readonly 起中隧道 = new Map<SessionId, { connectionId: string | undefined; 关隧道: () => Promise<void> }>()
  /** 掉线后等着接回的那几台（定案 6）。`sessions` 看不见它们；`variables` / `environmentOf` 认得 */
  private readonly 分离的 = new Map<SessionId, 分离记录>()

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
    let 本地连接信息: KernelConnectionInfo | undefined
    if (remote) {
      if (!byPath) {
        throw new UserFacingError("远端内核只能按解释器路径起——kernelspec 是本机的概念")
      }
      const 远 = this.opts.远端 ?? { 起远端内核, 停远端内核, 五条隧道, attach: attachKernelChannel, 开心跳口 }
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
      /**
       * 远端没有 exit 事件。本机那条路的 `process` 是个真 `ChildProcess`，`once("exit")` 一响，
       * `接线` 里的 `channel.onExit` 就把「内核崩了」转成一条 `exited`。**这里没有那只耳朵**——
       * SSH 那头的进程死了我们不会收到任何通知（连接还活着，只是内核没了）。
       * 所以远端猝死靠 `起心跳给`（hb 隧道上 zmq ping 报警、SSH `kill -0` 下结论，2026-09-04 定案 1）；
       * 心跳口开不了时才退回 `挂载.ts` 的 5 分钟静默兜底。断线那条另有 `连接断了`。
       */
      const process = this.远端进程句柄(exec, 起的.pid)
      // 登记在案，好让握手期间断线时 `连接断了` 也能把这五条关掉
      this.起中隧道.set(spec.sessionId, { connectionId: remote.connectionId, 关隧道: 隧.关 })
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
        this.起中隧道.delete(spec.sessionId)
        await 隧.关().catch(() => {})
        await 远.停远端内核(exec, 起的).catch(() => {})
        throw e
      }
      this.起中隧道.delete(spec.sessionId)
      本地连接信息 = 隧.本地
      远端记 = {
        connectionId: remote.connectionId,
        label,
        executor: ex,
        起的: { pid: 起的.pid, 文件: 起的.文件 },
        连接信息: 起的.连接信息,
        语言: k.language,
        解释器路径: k.interpreterPath,
        关隧道: 隧.关,
        句柄: process,
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
    this.sessions.set(spec.sessionId, {
      channel,
      language,
      ...(本地连接信息 ? { 本地连接信息 } : {}),
      ...(远端记 ? { 远端: 远端记 } : {}),
    })

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

    this.接线(spec.sessionId, channel)
    // 远端才有心跳；**等它武装好再回**——不然 `start` 回了心跳还没排上，那几秒的猝死没人看
    if (远端记) await this.起心跳给(spec.sessionId)

    this.emit({ kind: "started", sessionId: spec.sessionId, pid: 0 })
    return { sessionId: spec.sessionId, pid: 0 }
  }

  /**
   * 远端内核的进程句柄：`kill` 走 SSH。起与接回共用。
   *
   * **`杀得了` 是一个可以拨掉的保险**（审查 2026-09-04）。`KernelChannel.close()` 的契约里
   * 就带着一下 `kill("SIGKILL")`——本机那条路对着自己的子进程发，天经地义；远端这条路
   * 把它翻成 SSH 上的 `kill -KILL <pid>`。而**分离（等接回）时我们正要关的就是这条通道**，
   * 那一下会打死我们打算接回的那台内核，`分离的` 里留下的记录从此指向一具尸体。
   *
   * 保险装在句柄上而不是 `close` 上：给 `close` 加一个「只关 socket」模式会动到本机那条路，
   * 而那里 kill 与 socket 的先后是 zeromq native 层的一条硬约束（先杀、等死、再关，
   * 不然 `Napi::Error` 从 C++ 回调里抛出来直接 SIGABRT）。这里只让远端的枪空一次膛。
   */
  private 远端进程句柄(exec: NonNullable<SessionSpec["remote"]>["executor"]["exec"], pid: number): 远端句柄 {
    const 信号 = (s?: NodeJS.Signals) => (s === "SIGINT" ? "INT" : s === "SIGKILL" ? "KILL" : "TERM")
    const 句柄: 远端句柄 = {
      pid,
      杀得了: true,
      // 走 SSH，fire-and-forget：`kill(signal)` 的契约是同步的
      kill: (s) => {
        if (!句柄.杀得了) return
        void exec(`kill -${信号(s)} ${pid} 2>/dev/null; true`).catch(() => {})
      },
    }
    return 句柄
  }

  /**
   * 把一条通道接到这个会话上：iopub 翻成事件、进程退出收口。`start` 与 `接回远端` 共用——
   * 接回是同一个会话 id 换一条新通道，耳朵得重新装一遍。
   */
  private 接线(sessionId: SessionId, channel: KernelChannel): void {
    /**
     * **一条 iopub 消息进来就翻成结构化条目发出去。**
     *
     * 不在这里攒、不在这里合并：合并是渲染层的事，
     * 而**攒起来的那一刻就丢掉了「什么时候到的」**。
     */
    channel.on("*", (tagged) => {
      const live = this.sessions.get(sessionId)
      if (!live) return
      // **只认这一轮的输出**：内核可能还在吐上一轮的尾巴
      const parent = tagged.message.parent_header?.msg_id
      if (live.current && parent && parent !== live.current) return

      for (const entry of translateOutput(tagged)) {
        this.emit({ kind: "kernel_output", sessionId, entry })
        /**
         * **`idle` 是这一轮的边界**，账本靠它给回合收口。
         *
         * 与 native 那边同一条纪律：不能拿 `execute_reply` 当边界——
         * iopub 与 shell 是两条独立通道，**reply 到了不代表输出到齐**
         * （K1 里那个「Python 过、R 红」正是这么来的）。
         */
        if (entry.kind === "status" && entry.state === "idle" && live.current) {
          live.current = undefined
          this.emit({ kind: "turn_end", sessionId })
          this.emit({ kind: "idle", sessionId })
        }
      }
    })

    /**
     * **内核进程意外死亡也要收口**（审查 debug H2）:OOM / 段错误时既没有 idle 也没有
     * 我们主动 close,`执行()` 的 promise 会永挂,那一轮 run_code「发过去了永远没回音」。
     * 转发进程死亡为一条 exited,让在等的那一轮结束、这段会话从表里清掉。
     * **远端没有这只耳朵**（SSH 那头的进程死了没人通知）——远端走 `起心跳给` 那条路。
     */
    channel.onExit?.(() => {
      const live = this.sessions.get(sessionId)
      if (!live) return // 已经 close 掉了(主动关停走的是 stop 那条路)
      this.sessions.delete(sessionId)
      this.emit({ kind: "notice", sessionId, text: "内核进程意外退出了(可能是内存耗尽或崩溃)——这一段代码没有跑完。" })
      this.emit({ kind: "exited", sessionId, exitCode: 1 })
    })
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

  /**
   * 给这台远端内核开心跳（定案 1/2）。**开不了不算死**：出声，退回 5 分钟兜底（规格 §6）。
   * 心跳只报警；结论由 `确认活着` 走 SSH 下。
   */
  private async 起心跳给(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live?.远端) return
    const 远 = this.opts.远端 ?? { 起远端内核, 停远端内核, 五条隧道, attach: attachKernelChannel, 开心跳口 }
    let 口: Awaited<ReturnType<typeof 开心跳口>>
    try {
      口 = await 远.开心跳口(live.本地连接信息!.hb_port)
    } catch (e) {
      console.error(
        `[远端内核] ${live.远端.label}：心跳通道没打开，猝死只能靠 5 分钟兜底——${e instanceof Error ? e.message : String(e)}`,
      )
      this.emit({ kind: "notice", sessionId, text: "心跳通道没打开，内核猝死只能靠 5 分钟静默兜底" })
      return
    }
    /**
     * **开口是异步的，`live` 是开口之前那一刻的**（审查 2026-09-04）。连一个 socket 要几十毫秒，
     * 这期间会话完全可能已经被收掉（掉线分离、`stop`、猝死），甚至已经接回成另一条记录了。
     * 把心跳挂到那条旧记录上，它会一直 ping 下去、这个 zmq 口永远没人关——
     * **所有 `停()` 都是从 `sessions` / `分离的` 里找出来调的**，找不到就再也碰不到它。
     * 按对象身份认，不只按 id：接回换的是同一个 id 的另一条记录。
     */
    if (this.sessions.get(sessionId) !== live) {
      口.关()
      return
    }
    const 心 = 起心跳({
      ping: 口.ping,
      忙着: () => this.sessions.get(sessionId)?.current !== undefined,
      沉默: async () => {
        const r = await this.确认活着(sessionId)
        return r === undefined ? "不知道" : r ? "活着" : "死了"
      },
    })
    const 原停 = 心.停
    live.远端.心跳 = { ...心, 停: () => { 原停(); 口.关() } }
  }

  /**
   * 远端进程还在不在（定案 1 的「结论」）。`true` 活着；`false` 没了——**已经按猝死收摊**；
   * `undefined` = 不是远端会话，或链路不通问不了（掉线走 `连接断了`，这里不下结论）。
   */
  async 确认活着(sessionId: SessionId): Promise<boolean | undefined> {
    const live = this.sessions.get(sessionId)
    if (!live?.远端) return undefined
    let 活: boolean
    try {
      活 = await 远端活着(live.远端.executor.exec.bind(live.远端.executor), live.远端.起的.pid)
    } catch {
      return undefined
    }
    if (!活) await this.猝死(sessionId)
    return 活
  }

  /** 定案 4：判死之后的收摊。远端文件尽力删，删不掉出声、留给扫残留 */
  private async 猝死(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live?.远端) return
    this.sessions.delete(sessionId)
    live.远端.心跳?.停()
    await live.channel.close().catch(() => {})
    await live.远端.关隧道().catch(() => {})
    await 删远端文件(live.远端.executor.exec.bind(live.远端.executor), live.远端.起的.文件).catch((e) =>
      console.error(
        `[远端内核] ${live.远端!.label} 上删不掉 ${live.远端!.起的.文件}：${e instanceof Error ? e.message : String(e)}`,
      ),
    )
    this.emit({ kind: "exited", sessionId, exitCode: 1, reason: "died" })
    this.sinks.delete(sessionId)
  }

  async stop(sessionId: SessionId): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (!live) return
    this.sessions.delete(sessionId)
    const 远 = this.opts.远端 ?? { 停远端内核 }
    // 远端：先停心跳（不然停到一半它去确认、判死、再收一遍），再让内核自己收尾（TERM → 等 → KILL → 删文件），再关本地 socket，最后关隧道
    live.远端?.心跳?.停()
    if (live.远端) {
      await 远
        .停远端内核(live.远端.executor.exec.bind(live.远端.executor), live.远端.起的)
        .catch((e) => console.error(`[远端内核] 停不掉：${e instanceof Error ? e.message : String(e)}`))
    }
    /**
     * **关 socket 抛了也要关隧道**（审查 2026-09-04）：不然那五个本地监听端口留一辈子。
     * `连接断了` 那条本来就每步 `.catch`，这里不对称就是个洞。
     */
    try {
      await live.channel.close()
    } finally {
      if (live.远端) await live.远端.关隧道().catch(() => {})
    }
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
    this.sinks.delete(sessionId)
  }

  /**
   * 一台服务器**掉线**了（定案 6：掉线 = 分离，不是死）。连接没了，杀不了远端进程——它多半还活着；
   * 这里收本地这半（关通道、关隧道、停心跳），把记录挪进 `分离的` 等接回，发 `detached`。
   *
   * **`start` 还在飞的那些仍按旧法收掉**（定案 8）：隧道建好、握手还没回来时断线，那段 `start` 不在
   * `sessions` 里，只按表扫的话它的五条隧道永远不关。所以先收 `起中隧道`——半起的不接，
   * 远端那个进程留给下次连上的「扫残留」。隧道一关，那段 `start` 的握手会失败、走它自己的 catch
   * 往上抛，用户看见的是「起不来」而不是一个静默泄漏的端口。
   *
   * 不在这里 emit notice：普通对话那条路的 `转发` 只放 `kernel_output`，这句到不了转录（e2e 2026-09-04 抓的）；
   * 「可能还活着、等接回」由挂载层收到 `detached` 后在转录里说（`内核变化出声`）。
   *
   * ## 记录先落，本地后收（审查 2026-09-04）
   *
   * 「分离了」是**关于链路的事实**——链路断的那一瞬间它就成立，与我们关 socket、关隧道的快慢无关。
   * 所以这个方法分两趟：第一趟纯同步，把该分离的都挪进 `分离的` 并发 `detached`；第二趟才收本地那半。
   *
   * 装配层是 fire-and-forget 调它的（`void 内核运行时.连接断了(cid)`），而重连的 `ready` 一到就
   * **同步**取 `等着接回的文件(cid)` 当扫残留的「别动」名单。记录落在第二趟那些 `await` 后面的话，
   * 一次快的「断→连」会撞出两个洞：① 名单是空的，扫残留一枪 `pkill` 掉的正是我们要接回的那台；
   * ② 就算侥幸没扫着，`接回远端` 看到空的 `分离的` 直接返回——那台内核卡在 `detached`，
   * **再没有第二次接回的触发点**。顺带补上一个更小的洞：以前记录有一小段既不在 `sessions`、也不在 `分离的`。
   */
  async 连接断了(connectionId: string): Promise<void> {
    /** 第二趟要做的收摊。每件事自己吞错——这道收摊不许抛给调用方（它多半是 fire-and-forget 调的） */
    const 收本地: Array<() => Promise<void>> = []
    for (const [id, 在飞] of [...this.起中隧道]) {
      if (在飞.connectionId !== connectionId) continue
      this.起中隧道.delete(id)
      收本地.push(() => 在飞.关隧道())
    }
    for (const [id, live] of [...this.sessions]) {
      if (live.远端?.connectionId !== connectionId) continue
      const 远 = live.远端
      this.sessions.delete(id)
      远.心跳?.停()
      /**
       * **关通道之前把这个句柄的枪下了**（审查 2026-09-04）。`channel.close()` 的第一步是
       * `kill("SIGKILL")`，远端句柄会把它变成 SSH 上的 `kill -KILL <pid>`——而这台内核
       * 正是我们下面要留在 `分离的` 里、等重连时接回的那台。杀掉它，记录就指向一具尸体。
       *
       * 至今没出事只是运气：`RemoteConnections.记下` 在发 `onState` 之前就把执行器丢了，
       * 那个 `exec` 直接 reject。那是**别的文件**的实现顺序，不是这里的保证——
       * ssh2 的 `close` 换个次序、假 SSH 的 `dropLink`（链路标断但进程还在）、
       * 或者哪天有人把执行器留久一点，这一枪就打实了。
       *
       * `猝死` / `丢了` / `stop` / `收远端` 照旧杀：那几条路要么内核已经死了，要么人就是要它停。
       */
      远.句柄.杀得了 = false
      const { 心跳: _心, 关隧道: 关隧道, 句柄: _句, ...留 } = 远
      this.分离的.set(id, {
        ...留,
        language: live.language,
        environment: live.environment,
        掉线时刻: Date.now(),
        掉线时在飞: live.current !== undefined,
      })
      this.emit({ kind: "detached", sessionId: id, reason: "disconnected" })
      收本地.push(async () => {
        // 关 socket 抛了也要关隧道——不然那五个本地监听端口留一辈子（与 `收远端` 同一条）
        await live.channel.close().catch(() => {})
        await 关隧道()
      })
    }
    for (const 收 of 收本地) await 收().catch(() => {})
  }

  /**
   * 人**主动**断开一台服务器（定案 7 + 14；e2e 2026-09-04 抓的：按「断开」进的是 `idle` 不是 `disconnected`，
   * 内核原样留着）。与掉线只差一件事：**此刻连接还活着**，所以先把远端内核停干净
   * （TERM → 等 → KILL → 删文件），不留给下次连上的扫残留；然后本地收摊、标 `exited`——不进 `detached`。
   * 停不掉也不拦着断开——出声，剩下的扫残留兜。等着接回的那几台放弃：人已经说了不要，不替他留。
   */
  async 服务器要断了(connectionId: string): Promise<void> {
    await this.收远端(connectionId, true)
    this.放弃接回(connectionId)
  }

  /** 连接进 `idle` 之后的兜底（装配层调）：停不掉的照旧标死，等着接回的放弃 */
  async 断开了(connectionId: string): Promise<void> {
    await this.收远端(connectionId, false)
    this.放弃接回(connectionId)
  }

  /** 定案 14：人说不要了。不碰服务器（链路本来就没了），那台由下次扫残留清 */
  放弃接回(connectionId: string): void {
    for (const [id, 记] of [...this.分离的]) {
      if (记.connectionId !== connectionId) continue
      this.分离的.delete(id)
      this.emit({ kind: "exited", sessionId: id, exitCode: 1, reason: "abandoned" })
      this.sinks.delete(id)
    }
  }

  /** 扫残留的「别动」名单（定案 9/11）：这台服务器上等着接回的那几台的 connection.json 文件名 */
  等着接回的文件(connectionId: string): string[] {
    return [...this.分离的.values()]
      .filter((记) => 记.connectionId === connectionId)
      .map((记) => 记.起的.文件.slice(记.起的.文件.lastIndexOf("/") + 1))
  }

  /**
   * 重连后认领（定案 10）：进程在且文件在 → 重建五条隧道 → 重握手 → 同一个会话 id 恢复。
   * 任一步不通 → `丢了`。**逐台、不并发**：一台失败不影响下一台。
   * 执行器用留下的句柄——它重连后仍指向这台机器。
   *
   * ## 认领的这几秒里，这台内核必须一直有人管（审查 2026-09-04）
   *
   * 认领要走一次 SSH、建五条隧道、等一次 20 秒的握手——**足够人按一下「断开」，
   * 也足够再断一次线**。所以：
   *
   * - 记录**留在 `分离的` 里**直到尘埃落定（成功时紧挨着 `sessions.set` 才删，失败时在 `丢了` 里删）。
   *   顶上就删的话，`放弃接回` 这几秒里找不到它：`exited{abandoned}` 永远不发，
   *   而这边照样把会话装回 `sessions`——一台人已经说了不要的内核又活了。
   * - 建好的隧道立刻登记进 `起中隧道`（`start` 用的同一张表），这几秒里的 `连接断了` / `收远端`
   *   才关得掉它，不然五个本地监听端口漏一辈子。
   * - **每个 await 之后重新认一次**：记录还是出发时那条吗（没被放弃）？隧道还归我们管吗
   *   （没被 `连接断了` 抽走）？任一条不成立就不再往下走，也不下任何结论。
   */
  async 接回远端(connectionId: string): Promise<void> {
    const 远 = this.opts.远端 ?? { 起远端内核, 停远端内核, 五条隧道, attach: attachKernelChannel, 开心跳口 }
    for (const [id, 记] of [...this.分离的]) {
      if (记.connectionId !== connectionId) continue
      const ex = 记.executor
      const exec = ex.exec.bind(ex)
      /** 这条记录还是我们出发时那条吗。`放弃接回` 已经替它收过尾了的话，这里什么都不该再做 */
      const 还等着接回 = () => this.分离的.get(id) === 记
      let 在 = false
      try {
        在 = await 远端内核还在(exec, 记.起的)
      } catch (e) {
        // 问不到 = 不知道；接回这一步不知道就当没了（下面尽力停，停不掉的留给扫残留）
        console.error(`[远端内核] 接回 ${记.label} 时问不到进程：${e instanceof Error ? e.message : String(e)}`)
      }
      if (!还等着接回()) continue
      if (!在) {
        await this.丢了(id, 记, "进程或文件不在了")
        continue
      }
      if (typeof ex.forwardOut !== "function") {
        await this.丢了(id, 记, "执行器不支持端口隧道")
        continue
      }
      let 隧: Awaited<ReturnType<typeof 五条隧道>>
      try {
        隧 = await 远.五条隧道({ forwardOut: ex.forwardOut.bind(ex) }, 记.连接信息)
      } catch (e) {
        // 规格 §6：说清是哪一层（sshd 的转发开关），再走定案 10 的失败路
        console.error(
          `[远端内核] 接回 ${记.label} 时端口隧道建不起来（sshd 可能关了 AllowTcpForwarding）：${e instanceof Error ? e.message : String(e)}`,
        )
        if (!还等着接回()) continue
        await this.丢了(id, 记, "隧道建不起来")
        continue
      }
      // 与 `start` 同一个登记处：握手那几秒里断线，`连接断了` 靠它把这五条关掉
      const 登记 = { connectionId, 关隧道: 隧.关 }
      this.起中隧道.set(id, 登记)
      /** 这条隧道还归我们管吗——`连接断了` 抽走它时会连着从 `起中隧道` 里删掉 */
      const 还归我们 = () => this.起中隧道.get(id) === 登记
      if (!还等着接回()) {
        // 建隧道那几秒里人按了「断开」：收掉刚建好的这条，别的什么都不做（`放弃接回` 已经发过 exited）
        this.起中隧道.delete(id)
        await 隧.关().catch(() => {})
        continue
      }
      const process = this.远端进程句柄(exec, 记.起的.pid)
      let channel: KernelChannel
      try {
        channel = await 远.attach({
          连接信息: 隧.本地,
          process,
          language: 记.语言,
          label: `${记.解释器路径} @ ${记.label}`,
          interruptMode: "signal",
          // 规格 §6：接回不无限等——握手 20 秒没回音就按不通处理
          handshakeTimeoutMs: 20_000,
          ...(this.opts.runIdOf ? { runIdOf: () => this.opts.runIdOf!(id) } : {}),
        })
      } catch (e) {
        const 我们的 = 还归我们()
        this.起中隧道.delete(id)
        if (我们的) await 隧.关().catch(() => {})
        /**
         * 隧道在我们脚下被 `连接断了` 抽走了 → **握手不通是断线的后果，不是内核的死讯**：
         * 那台内核多半还在服务器上，留在 `分离的` 里等下一次连上再接。
         * 记录已经被人放弃了 → 也不下结论（`放弃接回` 收过尾了）。
         */
        if (!我们的 || !还等着接回()) continue
        console.error(`[远端内核] 接回 ${记.label} 时握手没回音：${e instanceof Error ? e.message : String(e)}`)
        await this.丢了(id, 记, "握手没回音")
        continue
      }
      const 我们的 = 还归我们()
      this.起中隧道.delete(id)
      if (!我们的 || !还等着接回()) {
        // 握手期间被放弃 / 又断了一次：**不复活**，把刚接上的这条收掉。
        // 先下枪：这台内核要么人已经不要（定案 14：不碰服务器），要么还等着下一次接回。
        process.杀得了 = false
        await channel.close().catch(() => {})
        await 隧.关().catch(() => {})
        continue
      }
      this.分离的.delete(id)
      // 定案 13：接回不生成新快照——同一个进程，S17 那份照旧挂着
      this.sessions.set(id, {
        channel,
        language: 记.language,
        ...(记.environment ? { environment: 记.environment } : {}),
        本地连接信息: 隧.本地,
        远端: {
          connectionId,
          label: 记.label,
          executor: ex,
          起的: 记.起的,
          连接信息: 记.连接信息,
          语言: 记.语言,
          解释器路径: 记.解释器路径,
          关隧道: 隧.关,
          句柄: process,
        },
      })
      this.接线(id, channel)
      await this.起心跳给(id)
      this.emit({ kind: "reattached", sessionId: id, 掉线时在飞: 记.掉线时在飞 })
    }
  }

  /**
   * 接回失败（定案 10 后半）：尽力停干净，发 exited{lost}。原因只进 console——转录那句是固定的。
   * **记录在这里才离开 `分离的`**：进来之前它一直在表里，好让这期间的「断开」找得到它。
   */
  private async 丢了(id: SessionId, 记: 分离记录, 原因: string): Promise<void> {
    const 远 = this.opts.远端 ?? { 停远端内核 }
    this.分离的.delete(id)
    console.error(`[远端内核] ${记.label} 上的 ${记.语言} 内核没接回来：${原因}`)
    await 远.停远端内核(记.executor.exec.bind(记.executor), 记.起的).catch(() => {})
    this.emit({ kind: "exited", sessionId: id, exitCode: 1, reason: "lost" })
    this.sinks.delete(id)
  }

  private async 收远端(connectionId: string, 先停远端: boolean): Promise<void> {
    const 远 = this.opts.远端 ?? { 停远端内核 }
    for (const [id, 在飞] of [...this.起中隧道]) {
      if (在飞.connectionId !== connectionId) continue
      this.起中隧道.delete(id)
      await 在飞.关隧道().catch(() => {})
    }
    for (const [id, live] of [...this.sessions]) {
      if (live.远端?.connectionId !== connectionId) continue
      this.sessions.delete(id)
      live.远端.心跳?.停()
      // 不在这里 emit notice：普通对话那条路的 `转发` 只放 `kernel_output`，这句到不了转录（e2e 2026-09-04 抓的）；
      // 「变量没了」由挂载层收到带 reason 的 exited 后在转录里说（`内核变化出声`）
      if (先停远端) {
        await 远.停远端内核(live.远端.executor.exec.bind(live.远端.executor), live.远端.起的).catch((e) =>
          console.error(`[远端内核] 断开前停不掉 ${live.远端!.label} 上的内核：${e instanceof Error ? e.message : String(e)}`),
        )
      }
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
    // 等着接回的那台也答：同一个进程，快照没变（定案 13）
    return this.sessions.get(sessionId)?.environment ?? this.分离的.get(sessionId)?.environment
  }

  async variables(sessionId: SessionId): Promise<
    { supported: false; reason: string } | { supported: true; variables: VariableSummary[] } | undefined
  > {
    // 分离期间**不画空列表**（空会被读成「变量没了」，规格 §3）：说清是等接回
    if (this.分离的.has(sessionId)) {
      return { supported: false as const, reason: "与服务器断开，等接回；变量在服务器上没动" }
    }
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
