/**
 * 内核通道适配器（②-A · K1）。
 *
 * **整个 `src/` 里只有这一个文件碰 rxjs。** 由 `tests/ui/design-contract.test.ts`
 * 的扫描强制（②-A 计划 §7 的第一条防线）。
 *
 * ```
 * spawnteract.launch  →  enchannel.createMainChannel  →  【本文件】  →  DAWN 的其余部分
 *      起进程              五通道 + HMAC 签名            打标 / 握手 / 关停       只见普通接口
 * ```
 *
 * ## 三条实测约束，不照办就会得到「看着对、实际不工作」的东西
 *
 * 全部来自 Spike D（2026-08-08 首测，2026-08-10 用 Python 与 R 各重跑一次）：
 *
 * 1. **握手是必需的，不是优化。** 内核就绪前发出的 `execute_request`
 *    会被**静默丢弃**——不报错、不重试、什么都没有。所以 `send` 在握手完成前
 *    **入队**，而不是发出去。这条不能靠调用方记得先握手：
 *    忘了的症状是「发过去了，永远没有回音」，最难查。
 *
 * 2. **关停顺序是正式代码。** `先停内核进程 → 关 socket → 留时间给 native 层`。
 *    顺序错了 native 层会抛 `Napi::Error` + **SIGABRT**，
 *    而且**结论会先打印、崩溃在后**——只看日志末尾会以为成功。
 *    与 Spike C 的 node-pty 是同一类失效，已升格为通则。
 *
 * 3. **中断后的 `abort` 不是故障。** Python 回 `status=error`/`KeyboardInterrupt`，
 *    R 回 `status=abort` 且没有 ename，**两个都是协议里合法的回复**。
 *    适配器不解释 status，原样往上传——判断「中断成没成」是 K3 的事，
 *    而且判据是「内核还能不能算对一道题」，不是回复长什么样。
 */
import { UserFacingError } from "../errors.js"
import {
  argvForInterpreter,
  diagnoseInterpreter,
  diagnoseLaunch,
  discoverKernelSpecs,
  type KernelLanguage,
  type LaunchDiagnosis,
} from "./specs.js"
import type {
  JupyterMessage,
  KernelChannel,
  KernelConnectionInfo,
  Provenance,
  TaggedMessage,
  Unsubscribe,
} from "./types.js"

/**
 * enchannel 的通道。**结构化类型，不 import rxjs**——
 * 我们只用到这三个方法，写出它们比引一个类型依赖更划算。
 */
export interface RawChannel {
  next(message: unknown): void
  subscribe(observer: (message: unknown) => void): { unsubscribe(): void }
  complete(): void
}

/** 内核进程。只用到 `kill` 与 `pid`——同样不引 spawnteract 的类型 */
export interface KernelProcess {
  pid?: number | undefined
  kill(signal?: NodeJS.Signals): void
  /**
   * 退出状态与退出事件（2026-08-11 加）。
   *
   * **关通道时要等它真的死掉**——`kill()` 只是送出信号，
   * 回来时进程往往还活着，而那时去关 socket 会撞上 zeromq 的 native 层
   * 正在收消息：`Napi::Error` 从 C++ 回调里抛出来，**整个进程 SIGABRT**。
   *
   * 可选：**测试里的假进程不必实现它**（那时按「已经退出」处理）。
   */
  exitCode?: number | null
  signalCode?: NodeJS.Signals | null
  once?(event: "exit", cb: () => void): unknown
}

export interface KernelChannelOptions {
  channel: RawChannel
  process: KernelProcess
  /** 内核实例身份。**由调用方给**——它要与账本里那条记录用同一个值 */
  kernelInstanceId: string
  /** 当前该记到哪条 run 上。**每次取，不缓存**：一个内核会跨很多轮 */
  runIdOf?: () => string | undefined
  /** 握手消息。**由调用方造**——见下面 `makeExecute` 那段说明 */
  handshake: JupyterMessage
  /**
   * 造一条 `execute_request`。
   *
   * **为什么是注入而不是在这里 import。**
   *
   * `@nteract/messaging` 会把 **rxjs 6 整个拖进来**，而 `wiring.ts` 里
   * `new KernelRuntime()` 是静态的——于是 rxjs 被打进了 **Electron 主进程包**
   * （实测 863 处），**每次启动都付这份解析代价，哪怕用户根本不开内核**。
   *
   * 注入之后：`createKernelChannel` 不碰任何重依赖（单元测试也不必再碰），
   * 而 `launchKernelChannel` 是 async 的，可以在真要起内核时才 `await import()`。
   */
  makeExecute: (code: string, opts?: Record<string, unknown>) => JupyterMessage
  /** 握手超时。超时要响亮失败，不能悄悄当成就绪 */
  handshakeTimeoutMs?: number
  /**
   * 关 socket 之后留给 native 层的收尾时间。
   * **Spike D 实测约 300ms**；给 0 会撞上 SIGABRT。
   */
  nativeDrainMs?: number
  /**
   * 怎么中断。**缺省 `signal`**——Jupyter 自己的默认，也是本机
   * ipykernel 与 IRkernel 的实测值（两者的 kernel.json 都没声明这个字段）。
   */
  interruptMode?: "signal" | "message"
  /** 让测试可以不真的等 */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_HANDSHAKE_TIMEOUT = 20_000
const DEFAULT_NATIVE_DRAIN = 300

/** 哪些消息类型算「发出去会让版本号 +1」——即一次真正的执行 */
const BUMPS_REVISION = new Set(["execute_request"])

/**
 * 等一个已经收到 SIGKILL 的进程真的退出。
 *
 * **等不到也要往下走**：一个僵住的内核不该让关闭动作永远挂着——
 * 那会把「关一个内核」变成「整个应用关不掉」。等不到时如实返回，
 * 后面那一步照旧尽力而为。
 */
function 等它真的退出(
  proc: KernelProcess,
  上限ms: number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  // 假进程（测试用）没有这些字段：**当它已经退出**，不去等一个永远不来的事件
  if (typeof proc.once !== "function") return Promise.resolve()
  // 已经死了就不用等（`exitCode` 与 `signalCode` 任一非空即已退出）
  if ((proc.exitCode ?? null) !== null || (proc.signalCode ?? null) !== null) return Promise.resolve()
  return Promise.race([
    new Promise<void>((r) => proc.once!("exit", () => r())),
    sleep(上限ms),
  ])
}

export function createKernelChannel(opts: KernelChannelOptions): KernelChannel & {
  /** 等握手完成。**必须 await 它之后再依赖 `send` 立刻发出** */
  ready(): Promise<void>
} {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const drainMs = opts.nativeDrainMs ?? DEFAULT_NATIVE_DRAIN

  let revision = 0
  let handshaked = false
  let closed = false
  /** 握手完成前攒着的消息。**不是丢掉，是攒着** */
  const queued: JupyterMessage[] = []
  const listeners = new Map<string, Set<(m: TaggedMessage) => void>>()
  /**
   * 内省请求的 msg_id。**这些的输出永远不发给订阅者。**
   *
   * 这条保证放在适配器里，不放在调用方——放在调用方就意味着
   * **每加一个订阅者都要记得过滤一次**，而漏一次的表现是
   * 用户在 Console 里看见一堆自己没写过的代码在刷屏。
   */
  const internal = new Set<string>()
  /**
   * 这个内核支不支持 `user_expressions`。**试过一次就记住。**
   *
   * 2026-08-10 实测：IRkernel 不支持它（连 `1+1` 都回不出东西），
   * 而且**连 `silent` 也不完全遵守**——第一次尝试仍会广播 `execute_input`。
   * 不记住的话，**每刷新一次变量面板就白跑一次执行**。
   */
  let userExprWorks: boolean | undefined

  const provenance = (): Provenance => {
    const runId = opts.runIdOf?.()
    return {
      kernelInstanceId: opts.kernelInstanceId,
      kernelRevision: revision,
      // **拿不到就不给这个字段**，不是空串——空串会被读成「有一条叫空的 run」
      ...(runId ? { runId } : {}),
    }
  }

  const emit = (raw: unknown): void => {
    const message = raw as JupyterMessage
    if (!message?.header?.msg_type) return // 不是协议消息，忽略
    // **内省的产物一律不外发**——见 `internal` 的说明
    const parentId = message.parent_header?.msg_id
    if (parentId && internal.has(parentId)) return
    const tagged: TaggedMessage = { message, provenance: provenance() }
    for (const key of [message.header.msg_type, "*"]) {
      const set = listeners.get(key)
      if (!set) continue
      // 复制一份再遍历：回调里退订是常见写法，直接遍历会漏掉后面的
      for (const cb of [...set]) cb(tagged)
    }
  }

  const sub = opts.channel.subscribe(emit)

  const rawSend = (message: JupyterMessage): void => {
    if (BUMPS_REVISION.has(message.header.msg_type)) revision += 1
    opts.channel.next(message)
  }

  const on = (msgType: string, cb: (m: TaggedMessage) => void): Unsubscribe => {
    const set = listeners.get(msgType) ?? new Set()
    set.add(cb)
    listeners.set(msgType, set)
    return () => set.delete(cb)
  }

  const send = (message: JupyterMessage): void => {
    if (closed) throw new Error("内核通道已关闭，不能再发消息")
    // **握手前入队**：这时发出去会被内核静默丢弃（Spike D 实测）
    if (!handshaked) {
      queued.push(message)
      return
    }
    rawSend(message)
  }

  /** 等一条以 `parentId` 为父的消息 */
  const waitFor = (parentId: string, replyType: string, timeoutMs: number): Promise<TaggedMessage> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        // **超时要说清等的是什么**，「超时」两个字帮不上任何人
        reject(new Error(`等 ${replyType}（父消息 ${parentId}）超过 ${timeoutMs}ms 没有回音`))
      }, timeoutMs)
      const off = on(replyType, (m) => {
        // **按 parent_header 配对，不按顺序**——并发请求时顺序会乱
        if (m.message.parent_header?.msg_id !== parentId) return
        clearTimeout(timer)
        off()
        resolve(m)
      })
    })

  const request = (
    message: JupyterMessage,
    o: { replyType?: string; timeoutMs?: number } = {},
  ): Promise<TaggedMessage> => {
    const replyType = o.replyType ?? defaultReplyType(message.header.msg_type)
    const timeoutMs = o.timeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT
    // **先挂监听再发**：回复可能比 await 更快到
    const waiting = waitFor(message.header.msg_id, replyType, timeoutMs)
    send(message)
    return waiting
  }

  /**
   * 握手。
   *
   * 直接走 `rawSend`：`send` 在握手完成前会入队，用它握手就死锁了。
   */
  const ready = (() => {
    let started: Promise<void> | undefined
    return (): Promise<void> => {
      if (started) return started
      const timeoutMs = opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT
      started = (async () => {
        const waiting = waitFor(opts.handshake.header.msg_id, "kernel_info_reply", timeoutMs)
        rawSend(opts.handshake)
        await waiting
        handshaked = true
        // **补发攒下的**，顺序保持不变
        while (queued.length > 0) rawSend(queued.shift()!)
      })()
      return started
    }
  })()

  /**
   * 悄悄问一个表达式（S14）。**不弄脏 Console。**
   *
   * `executeRequest` 的第二个参数是选项：`silent` 让内核不广播 iopub、
   * 不计入历史；`user_expressions` 的结果随 `execute_reply` 一起回来。
   *
   * **失败不抛**：变量面板取不到值时该显示「取不到」，
   * 而不是让整个界面炸掉——它只是一个观察窗，不是主路径。
   */
  const probe = async (expression: string, timeoutMs = 10_000): Promise<string | undefined> => {
    try {
      /**
       * **两条路，因为内核的能力不一样。**
       *
       * 首选 `user_expressions`：结果随 `execute_reply` 回来，**根本不上 iopub**。
       * 但 2026-08-10 实测：**IRkernel 不支持它**——连 `1+1` 都回不出东西，
       * 而 ipykernel 回 `"2"`。协议里 `user_expressions` 本来就是可选的。
       *
       * 所以退到第二条：发一条正常的 `execute_request`（`store_history: false`，
       * 不进历史、不推高执行计数），**再由适配器保证它的输出不外发**
       * （见 `internal`）。**这不是静默回退**——两条路都是「问一个值」，
       * 换的只是取回结果的通道，而「不弄脏 Console」这条保证一样成立。
       */
      // 已知不支持就直接走退路，不再白跑一次
      if (userExprWorks === false) return await probeViaExecute(expression, timeoutMs)

      const viaUserExpr = opts.makeExecute("", {
        silent: true,
        store_history: false,
        user_expressions: { v: expression },
      })
      const reply = await request(viaUserExpr, { replyType: "execute_reply", timeoutMs })
      const ue = (reply.message.content as { user_expressions?: Record<string, unknown> }).user_expressions
      const v = ue?.v as { status?: string; data?: Record<string, unknown> } | undefined
      if (v?.status === "ok") {
        const text = v.data?.["text/plain"]
        if (typeof text === "string") {
          userExprWorks = true
          return text
        }
      }
      userExprWorks = false
      return await probeViaExecute(expression, timeoutMs)
    } catch {
      return undefined
    }
  }

  /** 退路：普通执行 + 收 iopub，输出由 `internal` 挡住不外发 */
  const probeViaExecute = (expression: string, timeoutMs: number): Promise<string | undefined> =>
    new Promise((resolve) => {
      const msg = opts.makeExecute(expression, { store_history: false })
      const id = msg.header.msg_id
      internal.add(id)
      let text = ""
      const collect = (raw: unknown): void => {
        const m = raw as JupyterMessage
        if (m?.parent_header?.msg_id !== id) return
        const t = m.header.msg_type
        const c = m.content as Record<string, unknown>
        if (t === "execute_result" || t === "display_data") {
          const d = (c.data ?? {}) as Record<string, unknown>
          if (typeof d["text/plain"] === "string") text += d["text/plain"]
        } else if (t === "stream" && typeof c.text === "string") {
          text += c.text
        } else if (t === "status" && c.execution_state === "idle") {
          done(text.trim() || undefined)
        }
      }
      /** **只收一次**：收完要退订并把 id 从 internal 里移走，否则集合会无限长 */
      const sub2 = opts.channel.subscribe(collect)
      const timer = setTimeout(() => done(undefined), timeoutMs)
      let settled = false
      function done(v: string | undefined): void {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sub2.unsubscribe()
        internal.delete(id)
        resolve(v)
      }
      send(msg)
    })

  /** 执行一段代码。**消息在这里造**——见 `types.ts` 里那段说明 */
  const execute = (code: string): string => {
    const msg = opts.makeExecute(code)
    send(msg)
    return msg.header.msg_id
  }

  /**
   * 打断正在执行的那一段。**不杀内核。**
   *
   * ## 两条路，走错的症状是「点了停止什么也没发生」
   *
   * | `interrupt_mode` | 怎么打断 |
   * |---|---|
   * | `signal`（默认，本机 Python 与 R 都是） | 向**内核进程**发 SIGINT |
   * | `message` | 往 **control 通道**发 `interrupt_request` |
   *
   * ## 为什么它不返回「成没成」
   *
   * 中断之后内核回什么**因语言而异且都合法**：Python 回
   * `execute_reply status=error` + `KeyboardInterrupt`，**R 回 `status=abort`
   * 且没有 ename**（2026-08-10 实测）。Spike D 原来的判据按 Python 的形状写死，
   * 把一个工作正常的 R 内核判成了失败。
   *
   * **唯一与语言无关的判据是「内核还能不能算对一道题」**——
   * 内核串行执行，后一条能跑完就同时证明了死循环停了、内核也没被打死。
   * 那要再发一次执行才知道，不是这个方法能回答的，
   * 所以它不返回 boolean：**返回一个假答案比不返回更坏**。
   */
  const interrupt = (): void => {
    if (closed) throw new Error("内核通道已关闭，不能再中断")
    if ((opts.interruptMode ?? "signal") === "message") {
      /**
       * **走 control 通道**。它与 shell 是两条独立的 socket——
       * 正在执行时 shell 是堵着的，`interrupt_request` 发到 shell 上会排在
       * 那条死循环后面，**等于没发**。
       */
      rawSend({
        header: {
          msg_id: `interrupt-${opts.kernelInstanceId}-${revision}`,
          msg_type: "interrupt_request",
        },
        parent_header: {},
        metadata: {},
        content: {},
        channel: "control",
      })
      return
    }
    try {
      opts.process.kill("SIGINT")
    } catch (err) {
      // **打不中要出声**：进程已经没了的话，「中断」这个动作本身失去了对象
      throw new Error(`发不出中断信号：${message(err)}`)
    }
  }

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    /**
     * **顺序在这里，别动。**
     *   ① 先停内核进程——它还活着的话，socket 关掉会让它对着断口写
     *   ② **等它真的死掉**，而不是发完信号就往下走（2026-08-11 补）
     *   ③ 再退订并关 socket
     *   ④ 留时间给 native 层收尾，否则 `Napi::Error` + SIGABRT
     *
     * ## 第 ② 步是补上的，它修的是一个会打死整个进程的竞态
     *
     * `kill()` 只是**送出信号**，回来时进程往往还活着。于是紧接着的
     * `unsubscribe()` 常常撞上「socket 上还有一条正在收的消息」——
     * zeromq 的 native 层这时抛 `Napi::Error`，而那是**从 C++ 回调里抛的**，
     * JS 这边一个 try/catch 都接不住：**整个进程 SIGABRT**。
     *
     * 症状极难认：e2e 全量跑时随机有一条用例报
     * `electronApplication.firstWindow: Timeout 30000ms`——
     * 因为那个进程根本没活到开窗口。今天这条挂起出现了十几次，
     * 直到把主进程的 stderr 接进测试输出，才看见那一行
     * `libc++abi: terminating due to uncaught exception of type Napi::Error`。
     *
     * **等进程退出之后，socket 上不可能再有新数据**——竞态从根上没了。
     * 仍然保留后面那个固定 drain：zeromq 自己也要一点时间收摊。
     */
    try {
      opts.process.kill("SIGKILL")
    } catch {
      // 已经退出了就没什么可停的。**这不是静默回退**：进程本来就该死
    }
    await 等它真的退出(opts.process, drainMs * 10, sleep)
    try {
      sub.unsubscribe()
      opts.channel.complete()
    } catch {
      // 同上：通道可能已经被对端关了
    }
    listeners.clear()
    await sleep(drainMs)
  }

  return {
    get kernelInstanceId() {
      return opts.kernelInstanceId
    },
    get kernelRevision() {
      return revision
    },
    send,
    on,
    request,
    execute,
    probe,
    interrupt,
    close,
    ready,
    /**
     * 内核进程**意外死亡**时触发(审查 debug H2):OOM 被杀 / 段错误 —— 那时
     * 既没有 idle 也没有我们主动 close,`执行()` 的 promise 会永挂,run_code 那一轮
     * 「发过去了永远没有回音」。把进程的 exit 事件转发上去,让运行时能收口。
     */
    onExit(cb: () => void): () => void {
      opts.process.once?.("exit", cb)
      return () => {
        /* 进程只死一次,once 无需显式移除 */
      }
    },
  }
}

/**
 * 请求类型 → 回复类型。
 *
 * **认不出就响亮失败**，不猜一个——猜错的症状是「等一个永远不会来的回复」，
 * 而那看起来和内核挂了一模一样。
 */
function defaultReplyType(requestType: string): string {
  if (requestType.endsWith("_request")) return `${requestType.slice(0, -"_request".length)}_reply`
  throw new Error(`认不出 "${requestType}" 的回复类型，请显式给 replyType`)
}

/* ── 起一个真内核（②-A · K2）──────────────────────────────────────── */

export interface LaunchOptions {
  /**
   * **直接给解释器路径**（2026-08-10 起的主路径）。
   *
   * 给了它就不查 kernelspec——**你指哪个解释器，就一定跑在哪个解释器上**。
   * 这是作者定的机制：*「只有配置了，我们才能调用。」*
   */
  interpreter?: { language: KernelLanguage; path: string }
  /** kernelspec 的名字。**只在没给 `interpreter` 时用**（旧路径、测试用） */
  kernelName?: string
  runIdOf?: () => string | undefined
  handshakeTimeoutMs?: number
  /** 工作目录。内核里的相对路径以它为准 */
  cwd?: string
}

/** 每次启动一个新身份。**重启即变**——S13 的陈旧判断全靠它 */
let instanceSeq = 0
function newInstanceId(kernelName: string): string {
  instanceSeq += 1
  return `k-${kernelName}-${Date.now().toString(36)}-${instanceSeq}`
}

/** stderr 只留末尾这么多字节。**留尾不留头**：报错信息在最后 */
const STDERR_TAIL = 4000

export interface AttachOptions {
  /** 端口是**本地**能连的（本机内核：进程自己写的；远端：隧道那头） */
  连接信息: KernelConnectionInfo
  process: KernelProcess
  language: KernelLanguage | undefined
  /** 报错时怎么称呼这台内核 */
  label: string
  runIdOf?: () => string | undefined
  handshakeTimeoutMs?: number
  /**
   * 内核实例 id 的前缀。**不给就用 `language`**——本机 kernelspec 那条路
   * 一直用的是 spec 名（比如 `dawn-spike`），与拆出 `attachKernelChannel`
   * 之前的可观测格式一致；换成语言名会让下游按 `k-dawn-spike-` 前缀
   * 匹配实例 id 的地方（比如账本）突然认不出来。
   */
  instanceLabel?: string
  /**
   * 怎么中断。**缺省 `signal`**——与 `launchKernelChannel` 一致。
   * 远端调用方可能想走 `message`（control 通道）：隧道那头的进程桩
   * 未必能发系统信号，这条口子留给它们。
   */
  interruptMode?: "signal" | "message"
  /** 握手失败时拿证据做三种实情的诊断；证据由 `evidence()` 现取（stderr 尾巴 / 远端日志尾巴） */
  diagnose?: (evidence: string) => LaunchDiagnosis | undefined
  evidence?: () => string
}

/**
 * 拿一份 connection.json 接通道 + 握手（远程内核，2026-09-03）。
 * `launchKernelChannel` = spawn 一个进程拿到它写的连接信息 → 调这里；远端 = 隧道之后调这里。
 * enchannel 仍只在本文件出现。
 */
export async function attachKernelChannel(
  opts: AttachOptions,
): Promise<KernelChannel & { ready(): Promise<void>; 连接信息: KernelConnectionInfo }> {
  const [{ createMainChannel }, { executeRequest, kernelInfoRequest }] = await Promise.all([
    import("enchannel-zmq-backend"),
    import("@nteract/messaging"),
  ])
  const channel = createKernelChannel({
    channel: (await createMainChannel(opts.连接信息 as never)) as unknown as RawChannel,
    process: opts.process,
    kernelInstanceId: newInstanceId(opts.instanceLabel ?? opts.language ?? "kernel"),
    interruptMode: opts.interruptMode ?? "signal",
    ...(opts.runIdOf ? { runIdOf: opts.runIdOf } : {}),
    handshake: kernelInfoRequest() as unknown as JupyterMessage,
    makeExecute: (code, o) =>
      (o ? executeRequest(code, o as never) : executeRequest(code)) as unknown as JupyterMessage,
    ...(opts.handshakeTimeoutMs ? { handshakeTimeoutMs: opts.handshakeTimeoutMs } : {}),
  })
  try {
    await channel.ready()
  } catch (err) {
    await channel.close()
    const d = opts.diagnose?.(opts.evidence?.() ?? "")
    throw new UserFacingError(
      d
        ? `${d.message}${"evidence" in d && d.evidence ? `\n${d.evidence}` : ""}`
        : `内核「${opts.label}」起来了，但握手没有回音：${message(err)}`,
    )
  }
  return Object.assign(channel, { 连接信息: opts.连接信息 })
}

/**
 * 起内核 + 建通道 + 握手，**一步到位或响亮失败**。
 *
 * ## 为什么它长在这个文件里
 *
 * `spawnteract` / `enchannel` / `@nteract/messaging` 三个包只准这一个文件碰
 * （`tests/source-hygiene.test.ts` 强制）。**把启动拆到另一个文件，
 * 边界就有两处了**——而这条边界的全部价值就在于「只有一处」。
 *
 * ## 失败时说的是三种实情里的哪一种
 *
 * 起不来的原因有三种，**它们要人做的事完全不同**（见 `specs.ts`）。
 * 所以这里把内核自己吐的 stderr 收下来交给 `diagnoseLaunch`，
 * 而不是笼统地说一句「内核起不来」——那会让人去修一个没坏的东西。
 *
 * **握手失败也走同一条诊断**：内核进程起来了但立刻死掉（比如包缺失）时，
 * 症状恰恰是「等 kernel_info_reply 等到超时」，
 * 而真正的原因在 stderr 里躺着。只报「超时」等于把线索扔了。
 */
export async function launchKernelChannel(
  opts: LaunchOptions,
): Promise<KernelChannel & { ready(): Promise<void>; 连接信息: KernelConnectionInfo }> {
  /**
   * **重依赖只在真要起内核时才加载。**
   * 见 `KernelChannelOptions.makeExecute` 那段——静态 import 会把 rxjs
   * 打进 Electron 主进程包，让每次启动都为一个多数会话用不到的功能买单。
   *
   * `attachKernelChannel` 自己也会再 import 一次 `enchannel-zmq-backend` /
   * `@nteract/messaging`——这里其实用不上它俩，但 `spawnteract` 得留在这份
   * `Promise.all` 里：`launchSpec` 只有这一处用得到。
   */
  const [{ launchSpec }] = await Promise.all([import("spawnteract")])

  /**
   * 两条起法。**给了解释器路径就走那条**，不再查 kernelspec。
   *
   * 保留 kernelspec 那条是因为测试与既有 e2e 在用它；
   * **产品里的主路径是解释器路径**——它不依赖用户装没装 kernelspec，
   * 也不会出现「名字叫 A、实际是环境 B」。
   */
  const byPath = opts.interpreter
  const label = byPath ? byPath.path : (opts.kernelName ?? "")
  let argv: string[]
  let language: KernelLanguage | undefined
  let diagnose: (stderr: string) => LaunchDiagnosis | undefined

  if (byPath) {
    language = byPath.language
    argv = argvForInterpreter(byPath.language, byPath.path)
    diagnose = (e) => diagnoseInterpreter(byPath.language, byPath.path, e)
    const 先查 = diagnose("")
    if (先查) throw new UserFacingError(先查.message)
  } else {
    const discovery = discoverKernelSpecs()
    const 没有 = diagnoseLaunch(opts.kernelName ?? "", discovery)
    if (没有?.kind === "no-spec") throw new UserFacingError(没有.message)
    const spec = discovery.specs.find((x) => x.name === opts.kernelName)!
    argv = spec.argv
    language = spec.language === "R" ? "R" : spec.language === "python" ? "python" : undefined
    diagnose = (e) => diagnoseLaunch(opts.kernelName ?? "", discovery, e)
  }

  let kernel: {
    spawn: KernelProcess & { stderr?: NodeJS.ReadableStream; stdout?: NodeJS.ReadableStream }
    config: unknown
  }
  try {
    /**
     * **用 `launchSpec` 而不是 `launch(名字)`。**
     *
     * `launch(名字)` 会走 spawnteract **自己那套发现**，与我们的
     * `discoverKernelSpecs` 是两条独立路径——于是「DAWN 看得见的内核」
     * 与「DAWN 起得来的内核」可能不是同一批。**两个事实来源，
     * 迟早会在某台机器上分叉**，而症状是「列表里有，点了起不来」。
     *
     * 2026-08-10 实测撞上：我们的发现认 `DAWN_JUPYTER_ROOTS`，
     * spawnteract 不认，于是它报 `No spec available for broken`。
     * 改用 `launchSpec` 之后**我们的发现是唯一的事实来源**。
     */
    kernel = (await launchSpec(
      /**
       * 只传 `argv`。**spawnteract 只替换 `{connection_file}` 一个占位符**
       * （实测读它的源码，`launchSpecFromConnectionInfo` 里只有那一处 `replace`）——
       * 真正的 Jupyter 还会替换 `{resource_dir}`。本机五个 kernelspec 都没用它，
       * 所以现在不受影响；**将来撞上时的症状是 argv 里留着一个没被替换的占位符**，
       * 那时要在这里补，而不是去改发现那一层。
       */
      { argv, display_name: label, language: language ?? "" },
      {
        // **接住 stderr**：诊断全靠它。不接的话内核死于什么原因就永远不知道
        stdio: ["ignore", "pipe", "pipe"],
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      },
    )) as typeof kernel
  } catch (err) {
    const d = diagnose(message(err))
    throw new UserFacingError(d ? d.message : `内核「${label}」起不来：${message(err)}`)
  }

  /** 攒着，**只在真失败时才拿它做判据**——很多内核平时就往 stderr 打噪声 */
  let stderrTail = ""
  kernel.spawn.stderr?.setEncoding?.("utf8")
  kernel.spawn.stderr?.on("data", (d: string) => {
    stderrTail = (stderrTail + d).slice(-STDERR_TAIL)
  })

  /**
   * **stdout 也必须有人读**（审查 debug H8）。内核走 ZMQ,fd1 平时是空的;
   * 但绕过 ipykernel 直写 fd1 的东西(C 扩展、`os.system`/子进程、某些绘图后端的告警)
   * 会攒在管道缓冲里,一旦攒过 ~64KB 又没人读,内核的那次写就**永久阻塞**——
   * 表现为「跑一段带原生输出的代码,内核卡死再不回话」。挂一个 data 处理让它一直流,
   * 顺便留一小段尾巴:握手失败时它偶尔也带着线索。
   */
  let stdoutTail = ""
  kernel.spawn.stdout?.setEncoding?.("utf8")
  kernel.spawn.stdout?.on("data", (d: string) => {
    stdoutTail = (stdoutTail + d).slice(-STDERR_TAIL)
  })

  return attachKernelChannel({
    连接信息: kernel.config as KernelConnectionInfo,
    process: kernel.spawn,
    language,
    label,
    // **本机路径的实例 id 前缀是 kernelspec 名，不是语言名**——拆出 attachKernelChannel 之前就是这样
    instanceLabel: byPath ? byPath.language : (opts.kernelName ?? "kernel"),
    ...(opts.runIdOf ? { runIdOf: opts.runIdOf } : {}),
    ...(opts.handshakeTimeoutMs ? { handshakeTimeoutMs: opts.handshakeTimeoutMs } : {}),
    diagnose,
    // **握手超时的真正原因往往在 stderr 里**，只报「超时」等于把线索扔了
    evidence: () => stderrTail || stdoutTail,
  })
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
