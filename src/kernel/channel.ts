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
import type {
  JupyterMessage,
  KernelChannel,
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
}

export interface KernelChannelOptions {
  channel: RawChannel
  process: KernelProcess
  /** 内核实例身份。**由调用方给**——它要与账本里那条记录用同一个值 */
  kernelInstanceId: string
  /** 当前该记到哪条 run 上。**每次取，不缓存**：一个内核会跨很多轮 */
  runIdOf?: () => string | undefined
  /** 握手消息。由调用方用 `@nteract/messaging` 的 `kernelInfoRequest()` 造 */
  handshake: JupyterMessage
  /** 握手超时。超时要响亮失败，不能悄悄当成就绪 */
  handshakeTimeoutMs?: number
  /**
   * 关 socket 之后留给 native 层的收尾时间。
   * **Spike D 实测约 300ms**；给 0 会撞上 SIGABRT。
   */
  nativeDrainMs?: number
  /** 让测试可以不真的等 */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_HANDSHAKE_TIMEOUT = 20_000
const DEFAULT_NATIVE_DRAIN = 300

/** 哪些消息类型算「发出去会让版本号 +1」——即一次真正的执行 */
const BUMPS_REVISION = new Set(["execute_request"])

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

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    /**
     * **顺序在这里，别动。**
     *   ① 先停内核进程——它还活着的话，socket 关掉会让它对着断口写
     *   ② 再退订并关 socket
     *   ③ 留时间给 native 层收尾，否则 `Napi::Error` + SIGABRT
     */
    try {
      opts.process.kill("SIGKILL")
    } catch {
      // 已经退出了就没什么可停的。**这不是静默回退**：进程本来就该死
    }
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
    close,
    ready,
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
