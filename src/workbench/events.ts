/**
 * 会话事件中枢（Task 2.17）。
 *
 * 站在 `AgentRuntime` 的事件流与协议事件之间，做三件事：
 *
 *   1. **编号**——每会话一条单调递增的 seq，历史与增量共用同一套。
 *      共用是重连不重复也不丢字的前提：若历史与推送各有各的编号，
 *      客户端就无法判断「这条我是不是已经有了」。
 *   2. **翻译**——native 的逐 token 增量变成带 `turnId` 的 turn 事件，
 *      PTY 的字节原样成为 bytes 事件。**两者形状不同不是偶然**：
 *      对话有轮次，字节流没有。
 *   3. **背压**——每会话一个按字符计的环形缓冲，溢出丢最旧的，
 *      **并发一条 `dropped` 说明丢了多少**。绝不静默截断（规格 7.5）。
 *
 * ## 未订阅就不推
 *
 * `subscribe()` 之前的事件只进缓冲，不过 IPC。理由是背压的第一道闸应当在
 * **源头**：一个没人在看的 PTY 每秒吐几百 KB，把它推过 IPC 再让渲染进程扔掉，
 * 代价全白付。
 *
 * ## 本文件不认识 Electron
 *
 * 它只提供 `onEvent(cb)`，由 `electron/main.ts` 把 cb 接到 webContents。
 * 与 `WorkbenchServer` 一样，这让它能在 Node 里直接测。
 */
import { SessionEventSchema, type SessionEvent, type SubscribeResult } from "../protocol/events.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../protocol/version.js"
import type { AgentEvent, SessionId } from "../runtime/types.js"

/**
 * 事件的载荷部分：信封三件套由中枢补齐。
 *
 * 必须**分配式** Omit——直接 `Omit<联合, K>` 会先把联合塌成公共键，
 * 于是 `who` / `data` / `state` 全部消失，只剩 `kind`。
 */
type EventBody = SessionEvent extends infer T
  ? T extends SessionEvent
    ? Omit<T, "workbenchProtocolVersion" | "sessionId" | "seq">
    : never
  : never

export interface SessionEventHubOptions {
  /**
   * 每会话缓冲的**字符**上限。沿用 ①-A `session/stream.ts` 的取值口径——
   * JS 字符串是 UTF-16，内存占用与字符数成正比，比 UTF-8 字节数更准。
   */
  maxChars: number
}

interface Buffer {
  kind: "native" | "pty"
  events: SessionEvent[]
  /** events 中正文的字符总数。只算 turn.text 与 bytes.data */
  chars: number
  nextSeq: number
  /** 当前这一轮 agent 发言的 id。turn_end 时轮换 */
  turnSeq: number
}

/** 只有正文占预算。`state` / `dropped` 计 0——这也是 dropped 不会套娃的原因。 */
function weigh(e: SessionEvent): number {
  if (e.kind === "turn") return e.text.length
  if (e.kind === "bytes") return e.data.length
  return 0
}

export class SessionEventHub {
  private readonly maxChars: number
  private readonly buffers = new Map<SessionId, Buffer>()
  private readonly subscribed = new Set<SessionId>()
  private readonly listeners = new Set<(e: SessionEvent) => void>()

  constructor(opts: SessionEventHubOptions) {
    this.maxChars = opts.maxChars
  }

  /** 会话创建时登记。**kind 决定事件形状**，之后不会变。 */
  track(sessionId: SessionId, kind: "native" | "pty"): void {
    if (this.buffers.has(sessionId)) return
    this.buffers.set(sessionId, { kind, events: [], chars: 0, nextSeq: 1, turnSeq: 1 })
  }

  /** 推送出口。`electron/main.ts` 把它接到 webContents。 */
  onEvent(cb: (e: SessionEvent) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * 订阅并取回历史。
   *
   * **未追踪的会话直接抛错**，不返回一个空历史假装正常——
   * 空历史会被读成「这个会话什么都没说过」，那和「这个会话不存在」是两回事。
   */
  subscribe(sessionId: SessionId, fromSeq?: number): SubscribeResult {
    const buf = this.buffers.get(sessionId)
    if (!buf) throw new Error(`会话 "${sessionId}" 未在本进程中活动，没有事件可订阅`)
    this.subscribed.add(sessionId)

    const from = fromSeq ?? 1
    const events = buf.events.filter((e) => e.seq >= from)
    // 缓冲区里最早还留着的；全被丢光时用「下一条将要发出的」，
    // 语义是「从这里起你还能拿到」
    const earliestSeq = buf.events[0]?.seq ?? buf.nextSeq
    const truncated = from < earliestSeq && buf.nextSeq > 1

    return {
      sessionId,
      events,
      latestSeq: buf.nextSeq - 1,
      truncated,
      // schema 规定 truncated 时必填。不截断时也给出去无害，但保持最小：
      // 只在需要时带上，避免客户端误以为它总是「历史起点」
      ...(truncated ? { earliestSeq } : {}),
    }
  }

  unsubscribe(sessionId: SessionId): void {
    this.subscribed.delete(sessionId)
  }

  /**
   * 用户自己发的话。**也要进事件流**，否则切回旧会话只剩下半边对话。
   *
   * **PTY 会话直接忽略**：终端本来就会回显用户敲的键，再补一条是重复。
   * 这个判断放在中枢而不是调用方，因为 kind 是中枢已知的事实，
   * 让每个调用方各自去查一遍只会多出几处可以写错的地方。
   */
  userTurn(sessionId: SessionId, text: string): void {
    const buf = this.buffers.get(sessionId)
    if (!buf || buf.kind !== "native") return
    this.push(sessionId, buf, {
      kind: "turn",
      who: "user",
      text,
      turnId: `u${buf.nextSeq}`,
      // 用户的一句话一次说完，没有流式增量
      final: true,
    })
  }

  /** 把 runtime 的事件翻译进事件流。 */
  ingest(sessionId: SessionId, event: AgentEvent): void {
    const buf = this.buffers.get(sessionId)
    if (!buf) return

    switch (event.kind) {
      case "started":
        this.push(sessionId, buf, { kind: "state", state: "alive" })
        return
      case "exited":
        this.push(sessionId, buf, { kind: "state", state: "exited", exitCode: event.exitCode })
        return
      case "output":
        if (buf.kind === "pty") {
          this.push(sessionId, buf, { kind: "bytes", data: event.data })
        } else {
          this.push(sessionId, buf, {
            kind: "turn",
            who: "agent",
            text: event.data,
            turnId: `a${buf.turnSeq}`,
            final: false,
          })
        }
        return
      case "turn_end":
        // PTY 没有轮次概念，收到也不该造一个出来
        if (buf.kind !== "native") return
        this.push(sessionId, buf, {
          kind: "turn",
          who: "agent",
          text: "",
          turnId: `a${buf.turnSeq}`,
          final: true,
        })
        buf.turnSeq += 1
        return
    }
  }

  /** 会话彻底不要了时清掉。历史随之消失——这是内存，不是账本。 */
  forget(sessionId: SessionId): void {
    this.buffers.delete(sessionId)
    this.subscribed.delete(sessionId)
  }

  dispose(): void {
    this.buffers.clear()
    this.subscribed.clear()
    this.listeners.clear()
  }

  private push(sessionId: SessionId, buf: Buffer, body: EventBody): void {
    const event = SessionEventSchema.parse({
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      sessionId,
      seq: buf.nextSeq,
      ...body,
    })
    buf.nextSeq += 1
    buf.events.push(event)
    buf.chars += weigh(event)
    this.emit(event)

    // 溢出：丢最旧的，累计丢了多少字符，再发一条 dropped 说明。
    // dropped 自身计重为 0，所以这里不会触发第二轮丢弃（无套娃）。
    let droppedChars = 0
    while (buf.chars > this.maxChars && buf.events.length > 1) {
      const gone = buf.events.shift()!
      const w = weigh(gone)
      buf.chars -= w
      droppedChars += w
    }
    if (droppedChars > 0) {
      const notice = SessionEventSchema.parse({
        workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
        sessionId,
        seq: buf.nextSeq,
        kind: "dropped",
        droppedChars,
      })
      buf.nextSeq += 1
      buf.events.push(notice)
      this.emit(notice)
    }
  }

  private emit(event: SessionEvent): void {
    if (!this.subscribed.has(event.sessionId)) return
    // 复制一份再遍历：监听者可能在回调里退订
    for (const cb of [...this.listeners]) cb(event)
  }
}
