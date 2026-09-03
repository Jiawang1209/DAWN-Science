/**
 * 内核通道的类型契约（②-A · K1）。
 *
 * **这个文件里没有 rxjs，整个 `src/` 里也只有 `channel.ts` 一处碰它。**
 * 理由见 `docs/superpowers/plans/2026-08-10-phase2a-science-kernel.md` §2：
 * `@nteract/messaging` 要 rxjs ^6，`enchannel-zmq-backend@10` 要 ^7，
 * 两份都会装上。**那是消不掉的成本，只能隔离**——隔离的边界就是这里。
 */

/** Jupyter wire protocol v5.3 的消息信封。字段名照协议，不改写成驼峰 */
export interface JupyterMessage {
  header: {
    msg_id: string
    msg_type: string
    username?: string
    session?: string
    date?: string
    version?: string
  }
  parent_header: { msg_id?: string; msg_type?: string } | Record<string, never>
  metadata: Record<string, unknown>
  content: Record<string, unknown>
  channel?: string
  buffers?: unknown[]
}

/**
 * 出适配器那一刻绑上的溯源三件套。
 *
 * **「诞生那一刻」就是这里**——S12 要求*「输出从诞生那一刻起就绑定溯源状态，
 * 不是事后补」*，而适配器是消息进入 DAWN 的唯一入口，所以这个钩子只能挂在这。
 *
 * **三个量各管一件事，不共用一个计数器**（照 Rho 的四个单调量）：
 * 合并任意两个，都会在某个「重启 + 重跑」的组合下给出错误的陈旧判断。
 */
export interface Provenance {
  /** 内核实例身份。**重启即变**——用来回答「这个结果是哪个内核实例算出来的」 */
  kernelInstanceId: string
  /** 单调递增，每发出一次执行请求 +1。S13 的陈旧标记靠它 */
  kernelRevision: number
  /** 账本上那条 run。**拿不到就没有这个字段**，不是空串 */
  runId?: string
}

/** 原消息 + 溯源。**不是把字段拍平进消息里**——协议信封要保持原样可转发 */
export interface TaggedMessage {
  message: JupyterMessage
  provenance: Provenance
}

export type Unsubscribe = () => void

/**
 * 适配器对内暴露的接口。**没有 Observable**。
 *
 * `request` 按 `parent_header.msg_id` 配对——Jupyter 的回复靠它认爹，
 * 不是靠顺序（并发请求时顺序会乱）。
 */
export interface KernelChannel {
  /** 内核实例身份，重启即变 */
  readonly kernelInstanceId: string
  /** 当前版本号。每发一次执行请求 +1 */
  readonly kernelRevision: number
  /**
   * 发一条消息。
   *
   * **握手完成前会入队，不会发出去**——见 `channel.ts` 的说明：
   * 内核就绪前发出的 `execute_request` 会被**静默丢弃**（Spike D 实测）。
   */
  send(message: JupyterMessage): void
  /** 订阅某个 `msg_type`。`"*"` 收全部 */
  on(msgType: string, cb: (m: TaggedMessage) => void): Unsubscribe
  /** 发一条并等它的回复（按 parent_header 配对） */
  request(message: JupyterMessage, opts?: { replyType?: string; timeoutMs?: number }): Promise<TaggedMessage>
  /**
   * 执行一段代码，返回这一轮的 `msg_id`。
   *
   * **调用方不该自己构造 Jupyter 消息。** 2026-08-10：`runtime/kernel.ts`
   * 第一版直接 import 了 `@nteract/messaging` 来造 `execute_request`，
   * 被 rxjs 扫描当场抓住——**边界从一处变成了两处**，
   * 而这条边界的全部价值就在于「只有一处」。
   * 消息构造归适配器，调用方只说「执行这段代码」。
   */
  execute(code: string): string
  /**
   * 悄悄问内核一个表达式的值，**不弄脏 Console**（②-A · K5 · S14）。
   *
   * 走 Jupyter 的 `silent: true` + `user_expressions`：
   * **结果从 `execute_reply` 回来，不经 iopub 广播**，
   * 于是它不会在对话里冒出来、也不会推高执行计数。
   *
   * 直接 `execute` 一段内省代码是做不到这一点的——那会让用户看见
   * 一堆他没写过的代码在自己刷屏，**而变量面板刷新一次就刷一次**。
   *
   * @returns `text/plain` 形式的结果；拿不到就是 `undefined`（**缺就是缺**）
   */
  probe(expression: string, timeoutMs?: number): Promise<string | undefined>
  /**
   * 打断正在执行的那一段。**不杀内核。**
   *
   * 两条路由 kernelspec 的 `interrupt_mode` 决定（signal / message），
   * 见 `channel.ts`。**调用方不该关心是哪一条**。
   *
   * **它不返回「成没成」**：中断成没成的唯一判据是
   * *「内核还能不能算对一道题」*，那要再发一次执行才知道，
   * 不是这个方法能回答的。返回一个 boolean 会诱导调用方去信一个假答案。
   */
  interrupt(): void
  /**
   * 关停。**顺序是正式代码，不是收尾**——见 `channel.ts`。
   * 反复调用是安全的。
   */
  close(): Promise<void>
  /**
   * 内核进程**意外死亡**时触发一次（审查 debug H2）:OOM 被杀 / 段错误。
   * 运行时据此收口那一轮,否则 `执行()` 的 promise 永挂、run_code 永远没有回音。
   * 可选:假 channel(测试)可以不实现。
   */
  onExit?(cb: () => void): Unsubscribe
}

/**
 * connection.json 的形状（远程内核，2026-09-03）。ipykernel / IRkernel 起来时自己写的那份，
 * 五个端口 + HMAC key。远端那份的端口是服务器上的；隧道之后换成本地端口再交给 enchannel。
 */
export interface KernelConnectionInfo {
  ip: string
  transport: string
  key: string
  signature_scheme: string
  kernel_name?: string
  shell_port: number
  iopub_port: number
  stdin_port: number
  control_port: number
  hb_port: number
}
