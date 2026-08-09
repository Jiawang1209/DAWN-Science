/**
 * 会话记录中枢（返工 R4 重写）。
 *
 * 每会话持有一份 **transcript + revision**：订阅给全量快照，之后推增量。
 * 旧版是「环形缓冲 + seq + 丢弃出声」——那套纪律为一个本不该存在的问题而设，
 * 理由写在 `protocol/events.ts` 的文件头。
 *
 * 职责三件：
 *   1. **累积**——pi 的文本增量攒成一条 turn，工具调用攒成一条 tool
 *   2. **编号**——每次变更 revision +1，快照与增量共用同一个计数
 *   3. **推送**——只推给已订阅的会话；未订阅期间照常记录，订阅后能补看
 *
 * **本文件不认识 Electron**，只提供 `onUpdate(cb)`，由 `electron/main.ts` 接到 webContents。
 */
import { SessionUpdateSchema, type SessionSnapshot, type SessionUpdate, type TranscriptItem } from "../protocol/events.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../protocol/version.js"
import type { AgentEvent, SessionId } from "../runtime/types.js"

/**
 * 更新的载荷部分：信封三件套由中枢补齐。
 *
 * 必须**分配式** Omit——直接 `Omit<联合, K>` 会先把联合塌成公共键，
 * 于是 `item` / `data` / `state` 全部消失，只剩 `type`。
 * （这个坑在旧版事件中枢里踩过一次，同样的写法同样的原因。）
 */
type UpdateBody = SessionUpdate extends infer T
  ? T extends SessionUpdate
    ? Omit<T, "workbenchProtocolVersion" | "sessionId" | "revision">
    : never
  : never

export interface SessionTranscriptsOptions {
  /**
   * PTY scrollback 的字符上限。
   *
   * **只对终端生效**——对话 transcript 不设上限：它的长度由对话轮数决定，
   * 而那本来就是有界的；终端字节流没有天然边界，才需要一个上限。
   */
  terminalMaxChars: number
}

interface Entry {
  /**
   * `cli` 与 `native` 一样吐结构化事件，**只有 `pty` 是字节流**——
   * 下面 `output` 分支判的正是这一件事。保留 `cli` 这个取值而不是映射成
   * `native`，是因为**丢掉它就再也答不出「这个会话是谁在跑」**。
   */
  kind: "native" | "pty" | "cli"
  revision: number
  items: TranscriptItem[]
  terminal: string
  terminalTrimmed: boolean
  state: "alive" | "exited"
  exitCode: number | undefined
  /** 当前正在累积的 agent 发言的 id。turn_end 时清空 */
  openTurnId: string | undefined
  turnSeq: number
}

export class SessionTranscripts {
  private readonly entries = new Map<SessionId, Entry>()
  private readonly subscribed = new Set<SessionId>()
  private readonly listeners = new Set<(u: SessionUpdate) => void>()

  constructor(private readonly opts: SessionTranscriptsOptions) {}

  /** 会话创建时登记。`kind` 决定字节进终端还是进对话，之后不会变。 */
  track(sessionId: SessionId, kind: "native" | "pty" | "cli"): void {
    if (this.entries.has(sessionId)) return
    this.entries.set(sessionId, {
      kind,
      revision: 0,
      items: [],
      terminal: "",
      terminalTrimmed: false,
      state: "alive",
      exitCode: undefined,
      openTurnId: undefined,
      turnSeq: 0,
    })
  }

  /** 推送出口。`electron/main.ts` 把它接到 webContents。 */
  onUpdate(cb: (u: SessionUpdate) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * 订阅并取回全量快照。
   *
   * **未追踪的会话直接抛错**，不返回空快照假装正常——
   * 空快照会被读成「这个会话什么都没说过」，那和「这个会话不存在」是两回事。
   */
  subscribe(sessionId: SessionId): SessionSnapshot {
    const e = this.entries.get(sessionId)
    if (!e) throw new Error(`会话 "${sessionId}" 未在本进程中活动，没有记录可订阅`)
    this.subscribed.add(sessionId)
    return this.snapshot(sessionId, e)
  }

  unsubscribe(sessionId: SessionId): void {
    this.subscribed.delete(sessionId)
  }

  /** 会话彻底不要了时清掉。这是内存，不是账本。 */
  forget(sessionId: SessionId): void {
    this.entries.delete(sessionId)
    this.subscribed.delete(sessionId)
  }

  dispose(): void {
    this.entries.clear()
    this.subscribed.clear()
    this.listeners.clear()
  }

  /** 用户自己发的话。**PTY 忽略**：终端本来就会回显，再补一条是重复。 */
  userTurn(sessionId: SessionId, text: string): void {
    const e = this.entries.get(sessionId)
    if (!e || e.kind !== "native") return
    e.turnSeq += 1
    this.putItem(sessionId, e, {
      type: "turn",
      id: `u${e.turnSeq}`,
      who: "user",
      text,
      final: true,
    })
  }

  /** 把 runtime 的事件并进记录。 */
  ingest(sessionId: SessionId, event: AgentEvent): void {
    const e = this.entries.get(sessionId)
    if (!e) return

    switch (event.kind) {
      case "started":
        return // 会话建好时状态已是 alive，不必再推一条

      case "exited":
        e.state = "exited"
        e.exitCode = event.exitCode
        this.bump(sessionId, e, {
          type: "state",
          state: "exited",
          ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
        })
        return

      case "output":
        if (e.kind === "pty") {
          e.terminal += event.data
          if (e.terminal.length > this.opts.terminalMaxChars) {
            e.terminal = e.terminal.slice(-this.opts.terminalMaxChars)
            // 如实标注，**但不发故障事件**——终端本来就是有限回滚的
            e.terminalTrimmed = true
          }
          this.bump(sessionId, e, { type: "bytes", data: event.data })
        } else {
          this.appendAgentText(sessionId, e, event.data)
        }
        return

      case "notice":
        // 系统提示独立成条。**不并进 agent 的发言**——那会让用户以为是模型说的
        this.putItem(sessionId, e, {
          type: "notice",
          id: `notice-${++e.turnSeq}`,
          text: event.text,
        })
        return

      case "turn_end": {
        if (e.kind !== "native") return
        // 收尾当前发言。没有正在累积的发言时什么都不做——
        // 一个空的 turn 进了记录，界面上就是一个空气泡
        const open = e.openTurnId
        e.openTurnId = undefined
        if (!open) return
        const item = e.items.find((i) => i.type === "turn" && i.id === open)
        if (item && item.type === "turn") this.putItem(sessionId, e, { ...item, final: true })
        return
      }

      /**
       * 子 agent 的 chip 组（①-B″ · S1）。
       *
       * **一次工具调用一条记录**，里面装一组 chip——形态学自 Codex 桌面版的
       * `subagent-activity-chip-group`：*「chip 组，不是树、也不是日志」*。
       * 每个子 agent 各占一条就是日志，N 个并发时会把对话淹掉。
       *
       * 两个事件走同一条路：**先取出那条记录，改一格，再放回去**。
       * `putItem` 按 id 覆盖，所以这里必须自己合并，不能只放新来的那一格。
       */
      case "subagent_start":
      case "subagent_end": {
        const id = `sub:${event.toolCallId}`
        const prior = e.items.find((i) => i.id === id)
        const agents = [
          ...(prior?.type === "subagents" ? prior.agents : []),
        ]
        const at = agents.findIndex((a) => a.index === event.index)

        const next =
          event.kind === "subagent_start"
            ? {
                index: event.index,
                agent: event.agent,
                task: event.task,
                status: "running" as const,
              }
            : {
                // **没见过 start 的 end 也照记**——宁可多一条，不可丢一条。
                // 那时名字与任务都不知道，如实留空而不是编一个
                index: event.index,
                agent: at >= 0 ? agents[at]!.agent : "(未知)",
                task: at >= 0 ? agents[at]!.task : "",
                status: event.ok ? ("ok" as const) : ("error" as const),
                ...(event.ok ? {} : { error: event.error ?? "子 agent 失败，但没有给出原因" }),
              }

        if (at >= 0) agents[at] = next
        else agents.push(next)
        // **按 index 排，不按完成先后**——chip 在界面上不该跳来跳去
        agents.sort((a, b) => a.index - b.index)

        this.putItem(sessionId, e, { type: "subagents", id, agents })
        return
      }

      case "tool_start":
        this.putItem(sessionId, e, {
          type: "tool",
          id: event.toolCallId || `tool${e.revision + 1}`,
          name: event.toolName,
          input: event.input,
          status: "running",
        })
        return

      case "tool_end": {
        const id = event.toolCallId || `tool${e.revision + 1}`
        // 没见过 start 的 end 也照记——**宁可多一条，不可丢一条**
        this.putItem(sessionId, e, {
          type: "tool",
          id,
          name: event.toolName,
          input: e.items.find((i) => i.type === "tool" && i.id === id)?.type === "tool"
            ? (e.items.find((i) => i.id === id) as Extract<TranscriptItem, { type: "tool" }>).input
            : undefined,
          status: event.isError ? "error" : "ok",
          result: event.text,
          // **截断的三件套一起走。** 只传正文等于把「这是残缺品」这个事实丢掉，
          // 界面就只能猜——那正是修复前的样子（规格 7.5）
          resultTruncated: event.truncated,
          resultBytes: event.bytes,
          ...(event.fullOutputPath ? { fullOutputPath: event.fullOutputPath } : {}),
        })
        return
      }
    }
  }

  /** agent 的文本增量：累积进当前发言，推送**累积后的整条**。 */
  private appendAgentText(sessionId: SessionId, e: Entry, delta: string): void {
    if (!e.openTurnId) {
      e.turnSeq += 1
      e.openTurnId = `a${e.turnSeq}`
    }
    const id = e.openTurnId
    const existing = e.items.find((i) => i.id === id)
    const text = existing?.type === "turn" ? existing.text + delta : delta
    // 推整条而不是增量：界面按 id 覆盖即可，**少一层客户端拼接状态**
    this.putItem(sessionId, e, { type: "turn", id, who: "agent", text, final: false })
  }

  /** 写入或覆盖一条 item（按 id），并推送。 */
  private putItem(sessionId: SessionId, e: Entry, item: TranscriptItem): void {
    const i = e.items.findIndex((x) => x.id === item.id)
    if (i >= 0) e.items[i] = item
    else e.items.push(item)
    this.bump(sessionId, e, { type: "item", item })
  }

  /** revision +1 并推送。**校验在这里做一次**，畸形更新不该流到界面。 */
  private bump(
    sessionId: SessionId,
    e: Entry,
    body: UpdateBody,
  ): void {
    e.revision += 1
    const update = SessionUpdateSchema.parse({
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      sessionId,
      revision: e.revision,
      ...body,
    })
    if (!this.subscribed.has(sessionId)) return
    // 复制一份再遍历：监听者可能在回调里退订
    for (const cb of [...this.listeners]) cb(update)
  }

  private snapshot(sessionId: SessionId, e: Entry): SessionSnapshot {
    return {
      sessionId,
      kind: e.kind,
      revision: e.revision,
      items: [...e.items],
      terminal: e.terminal,
      terminalTrimmed: e.terminalTrimmed,
      state: e.state,
      ...(e.exitCode === undefined ? {} : { exitCode: e.exitCode }),
    }
  }
}
