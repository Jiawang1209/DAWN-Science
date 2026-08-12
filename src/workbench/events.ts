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
  /**
   * 现在几点（epoch 毫秒）。**可注入只为可测**——
   * 工具调用的「跑了多久」要一个稳定的时钟才能断言。
   */
  now?: () => number
}

interface Entry {
  /**
   * `cli` 与 `native` 一样吐结构化事件，**只有 `pty` 是字节流**——
   * 下面 `output` 分支判的正是这一件事。保留 `cli` 这个取值而不是映射成
   * `native`，是因为**丢掉它就再也答不出「这个会话是谁在跑」**。
   */
  kind: "native" | "pty" | "cli" | "kernel"
  revision: number
  items: TranscriptItem[]
  terminal: string
  terminalTrimmed: boolean
  state: "alive" | "exited"
  exitCode: number | undefined
  /** 当前正在累积的 agent 发言的 id。turn_end 时清空 */
  openTurnId: string | undefined
  /**
   * **当前**内核实例（②-A · K5 · S13）。每收到一条内核输出就更新。
   *
   * 界面拿它与每条输出自带的那个一比，就知道那条是不是**上一个内核**算出来的。
   * **缺省 = 还没有内核**，不是「不陈旧」。
   */
  kernelInstanceId: string | undefined
  turnSeq: number
  /**
   * 这一轮开始想的时刻（epoch 毫秒）。**想完就清空**。
   * 只用来算「想了多久」——那个数字要写在「思考」那一栏上。
   */
  思考起于: number | undefined
  /**
   * 此刻由谁在答（2026-08-12）。**换过服务才有值**——
   * 没换过时 agent 名本来就是对的。
   */
  当前模型: string | undefined
}

export class SessionTranscripts {
  private readonly entries = new Map<SessionId, Entry>()
  private readonly subscribed = new Set<SessionId>()
  private readonly listeners = new Set<(u: SessionUpdate) => void>()

  constructor(private readonly opts: SessionTranscriptsOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  /** 会话创建时登记。`kind` 决定字节进终端还是进对话，之后不会变。 */
  track(sessionId: SessionId, kind: "native" | "pty" | "cli" | "kernel"): void {
    if (this.entries.has(sessionId)) return
    this.entries.set(sessionId, {
      kind,
      revision: 0,
      items: [],
      terminal: "",
      terminalTrimmed: false,
      kernelInstanceId: undefined,
      state: "alive",
      exitCode: undefined,
      openTurnId: undefined,
      turnSeq: 0,
      思考起于: undefined,
      当前模型: undefined,
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

  /**
   * 用户自己发的话。**只有 PTY 忽略**：终端本来就会回显，再补一条是重复。
   *
   * **门要正面点名那个例外，不要列举「谁是正常的」。**
   * 2026-08-09（①-C）：这里原本写的是 `e.kind !== "native"`——
   * 只有两种 kind 时它等价于「PTY 忽略」，加了 `cli` 之后**含义悄悄变了**，
   * 把 cli 也挡了。而 cli 没有终端回显，**用户的话就此消失**：
   * 作者试用时报的正是这个（「看不到我的输入的内容，只能看到反馈的内容」）。
   *
   * **类型系统抓不到这一类**——它不是穷尽性检查，是运行时的字符串比较。
   */
  userTurn(sessionId: SessionId, text: string): void {
    const e = this.entries.get(sessionId)
    if (!e || e.kind === "pty") return
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

      /**
       * 内核的一条结构化输出（②-A · K4 · S11）。
       *
       * **一条一个条目，不合并。** 合并省下的那点条目数，
       * 代价是**丢掉「什么时候到的」**——而流式输出里，
       * 「先出了图还是先报的错」正是人要看的东西。
       *
       * `status` 不进 transcript：它是**执行状态**，不是输出。
       * 塞进去会让 Console 里每执行一次多两条 busy/idle 噪声。
       */
      case "kernel_output": {
        /**
         * **`status` 也要更新「当前实例」，只是不进 transcript。**
         *
         * 重启之后第一条到达的往往是 `status: starting`——若只在别的条目上更新，
         * 「当前实例」会在重启后停在旧值，于是**旧输出不会被标成陈旧**，
         * 而那正是这条特性要拆穿的谎言本身。
         */
        e.kernelInstanceId = event.entry.provenance.kernelInstanceId
        if (event.entry.kind === "status") return
        const p = event.entry.provenance
        this.putItem(sessionId, e, {
          type: "kernelOutput",
          id: `kout-${++e.turnSeq}`,
          kernelInstanceId: p.kernelInstanceId,
          kernelRevision: p.kernelRevision,
          // **拿不到就不给这个字段**，不是空串
          ...(p.runId ? { runId: p.runId } : {}),
          output: toProtocolOutput(event.entry),
        })
        return
      }

      case "notice":
        // 系统提示独立成条。**不并进 agent 的发言**——那会让用户以为是模型说的
        this.putItem(sessionId, e, {
          type: "notice",
          id: `notice-${++e.turnSeq}`,
          text: event.text,
        })
        return

      /**
       * 会话中途换了模型（2026-08-11）。
       *
       * 此前运行时发了这个事件，**中枢没有任何一个分支接它**——于是它被静默丢掉，
       * 对话记录里看不出「从这里开始换了一家」。
       *
       * 换到另一家之后**上下文还是同一份**，但答话的是另一个模型。
       * 不在记录里留一条，往回翻的人没有任何办法知道这件事——
       * 而这正是作者要的那个功能（*「一个对话之间，可以切换不同的 API」*）
       * 最容易变得说不清的地方。
       */
      case "thinking": {
        /**
         * **思考累进当前这一轮，与正文分开**（2026-08-12）。
         *
         * 作者看 Hermes：*「有一个 Thought briefly，可以点击展开。」*
         * 它是模型对自己说的话——混进 `text` 就等于把草稿当答案念出来。
         */
        if (!e.openTurnId) {
          e.turnSeq += 1
          e.openTurnId = `a${e.turnSeq}`
        }
        // **第一个增量就是起点**：想了多久要从这里算
        e.思考起于 ??= this.now()
        const id = e.openTurnId
        const 旧 = e.items.find((x) => x.id === id)
        // 前面那条「只想没说」的并进来——同一轮里的思考只该有一处
        const 并来的 = 旧 ? {} : this.吸收只想没说的(e, id)
        const 想的 =
          (并来的.thinking ?? "") + (旧?.type === "turn" ? (旧.thinking ?? "") : "") + event.delta
        this.putItem(sessionId, e, {
          type: "turn",
          id,
          who: "agent",
          text: 旧?.type === "turn" ? 旧.text : "",
          final: false,
          ...(想的 ? { thinking: 想的 } : {}),
          // **并过来的时长也要带上**：漏了它，前一段思考就白算了
          ...(并来的.thinkingMs === undefined ? {} : { thinkingMs: 并来的.thinkingMs }),
          ...(e.当前模型 ? { by: e.当前模型 } : {}),
        })
        return
      }

      case "model":
        // **从这一刻起的每一轮都记在它头上**（历史那些不动）
        e.当前模型 = event.provider
        this.putItem(sessionId, e, {
          type: "notice",
          id: `model-${++e.turnSeq}`,
          text: `已换到 ${event.provider} · ${event.model}——上下文不变，接下来由它来答`,
        })
        return

      /**
       * 这一段花了多少 token（2026-08-10）。
       *
       * **落在「还开着的那一段」上，没有就落在最后一条 agent 发言上**——
       * `turn_usage` 与 `turn_end` 的先后顺序不固定（pi 实测是 `turn_end` 先到）。
       *
       * **一条都找不到就丢掉**，不新建一个空发言：一个只有数字没有内容的
       * 气泡在对话里毫无意义。
       */
      case "turn_usage": {
        if (e.kind === "pty") return
        const target =
          (e.openTurnId ? e.items.find((i) => i.type === "turn" && i.id === e.openTurnId) : undefined) ??
          [...e.items].reverse().find((i) => i.type === "turn" && i.who === "agent")
        if (!target || target.type !== "turn") return
        this.putItem(sessionId, e, { ...target, usage: event.usage })
        return
      }

      case "turn_end": {
        // 同上：**只有 PTY 没有回合概念**（字节流），cli 与 native 都有
        if (e.kind === "pty") return
        // **收尾之前先停表**：清掉 openTurnId 之后就找不到那一条了
        this.思考停表(sessionId, e)
        // 收尾当前发言。没有正在累积的发言时什么都不做——
        // 一个空的 turn 进了记录，界面上就是一个空气泡
        const open = e.openTurnId
        e.openTurnId = undefined
        if (!open) return
        const item = e.items.find((i) => i.type === "turn" && i.id === open)
        if (item && item.type === "turn") {
          /**
           * **把这一段的 token 用量钉在这条发言上**（2026-08-10）。
           *
           * 作者：*「我们现在每次消耗的 token，其实也应该展示出来。」*
           * 项目概览里的成本栏回答的是「这个项目一共花了多少」，
           * 而人在对话里想知道的是**这一句花了多少**——两个问题。
           *
           * **没有就不给这个字段**：`usage` 缺席表示「不知道」，
           * 与「花了 0 个 token」在界面上说的话完全不同。
           */
          this.putItem(sessionId, e, { ...item, final: true })
        }
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
        // **要调工具了，说明它想完了**（见 `思考停表`）
        this.思考停表(sessionId, e)
        this.putItem(sessionId, e, {
          type: "tool",
          id: event.toolCallId || `tool${e.revision + 1}`,
          name: event.toolName,
          input: event.input,
          status: "running",
          // **时刻在这里打，不在界面上掐表**：重新订阅一个已在运行的会话时，
          // 界面会从零数起，于是它很确定地说「刚开始」——理由见协议里的注释
          startedAt: this.now(),
        })
        return

      case "tool_end": {
        const id = event.toolCallId || `tool${e.revision + 1}`
        const 先前 = e.items.find((i) => i.id === id)
        // 没见过 start 的 end 也照记——**宁可多一条，不可丢一条**
        this.putItem(sessionId, e, {
          type: "tool",
          id,
          name: event.toolName,
          input: 先前?.type === "tool" ? 先前.input : undefined,
          status: event.isError ? "error" : "ok",
          result: event.text,
          // **截断的三件套一起走。** 只传正文等于把「这是残缺品」这个事实丢掉，
          // 界面就只能猜——那正是修复前的样子（规格 7.5）
          resultTruncated: event.truncated,
          resultBytes: event.bytes,
          ...(event.fullOutputPath ? { fullOutputPath: event.fullOutputPath } : {}),
          /**
           * **开始时刻从那条 running 上接过来**，接不到就不写。
           *
           * 没接到时如实缺省，而不是拿「现在」冒充开始时刻——
           * 那会让一条跑了二十分钟的命令显示成「耗时 0 秒」。
           */
          ...(先前?.type === "tool" && 先前.startedAt !== undefined
            ? { startedAt: 先前.startedAt }
            : {}),
          endedAt: this.now(),
        })
        return
      }
    }
  }

  /**
   * 把恢复出来的历史铺回去（会话续接，2026-08-11）。
   *
   * **整份替换，然后推一帧快照**——不是一条条 `putItem`：
   * 那样界面会看到几十次 revision 跳动，而它们描述的是同一件事
   * 「这段对话原来长这样」。
   *
   * **不经过记账员。** 这些轮次上一次运行时已经记过账了，
   * 再记一遍就是把同一件事写两回（不变式 5：账本是事实层）。
   */
  restore(sessionId: SessionId, items: TranscriptItem[]): void {
    const e = this.entries.get(sessionId)
    if (!e) return
    // **已经有内容就不动**：这段对话本次运行里已经在说话了，
    // 拿一份历史盖上去会把刚说的那几句抹掉
    if (e.items.length > 0) return
    e.items = items
    this.bump(sessionId, e, { type: "snapshot", snapshot: this.snapshot(sessionId, e) })
  }

  /**
   * 远端会话换目录了（②-B · R4′）。
   *
   * **必须推**：模型 `cd` 之后头上那一条要立刻跟上，否则人看到的是上一个目录，
   * 而那正是「以为在 A 目录、其实在 B 目录」的来源。
   */
  setCwd(sessionId: SessionId, cwd: string): void {
    const e = this.entries.get(sessionId)
    // **没追踪的会话就不推**：凭空推一条会让界面以为有这么个会话
    if (!e) return
    this.bump(sessionId, e, { type: "cwd", cwd })
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
    /**
     * **正文一开始，思考就算结束**——但停表只有一份实现（`思考停表`）。
     *
     * 这里原先另写了一份：它拿 `existing.thinkingMs` 当「已经停过」，
     * 于是把 `思考停表` 刚算好的**两段之和覆盖回了第一段**，
     * 作者那种「想 → 调工具 → 再想」的轮次因此少报。
     * **同一件事两份实现，迟早有一份落后于另一份。**
     */
    this.思考停表(sessionId, e)
    const 停好的 = e.items.find((i) => i.id === id)
    const 想了 = 停好的?.type === "turn" ? 停好的.thinkingMs : undefined
    const 想的内容 = 停好的?.type === "turn" ? 停好的.thinking : undefined

    // 推整条而不是增量：界面按 id 覆盖即可，**少一层客户端拼接状态**
    this.putItem(sessionId, e, {
      type: "turn",
      id,
      who: "agent",
      text,
      final: false,
      // **思考要带着走**：不带的话，正文的第一个字就把它冲掉了
      ...(想的内容 ? { thinking: 想的内容 } : {}),
      ...(想了 === undefined ? {} : { thinkingMs: 想了 }),
      ...(e.当前模型 ? { by: e.当前模型 } : {}),
    })
  }

  /**
   * **把「只想了一下、还没说话」那一条并进新的这一条**（2026-08-12）。
   *
   * 作者：*「你其实出现了两次。」* 他那一轮是
   * **想 → 调工具 → 再想 → 回答**，于是记录里有两条 agent turn：
   * 第一条**只有思考没有正文**，在界面上就是一个空气泡 + 一行用量 + 一颗复制键；
   * 第二条又画一次思考块。**同一轮里的思考应当只有一处。**
   *
   * 所以新的一条开张时，把前面那条「只想没说」的吸收掉：
   * 思考文本接起来、时长相加、那条记录removed。
   *
   * **只吸收「没有正文」的那种**——已经说过话的那条是真的一轮发言，
   * 吞掉它就是删掉了模型说过的话。
   */
  private 吸收只想没说的(e: Entry, 新id: string): { thinking?: string; thinkingMs?: number } {
    const i = e.items.findIndex(
      (x) => x.type === "turn" && x.who === "agent" && x.id !== 新id && !x.text && x.thinking,
    )
    if (i < 0) return {}
    const 旧 = e.items[i] as Extract<TranscriptItem, { type: "turn" }>
    e.items.splice(i, 1)
    return {
      ...(旧.thinking === undefined ? {} : { thinking: 旧.thinking }),
      ...(旧.thinkingMs === undefined ? {} : { thinkingMs: 旧.thinkingMs }),
    }
  }

  /**
   * **思考到此为止**（2026-08-12 修）。
   *
   * 停表的时机原先只有「正文的第一个字」。作者那次是
   * *思考 → 调工具 → 再回答*——**正文落在了另一条 turn 上**，
   * 于是先前那条的思考永远没停：他看到的是「86s 正在思考」，而答案早就出来了。
   *
   * 所以凡是「这一轮的思考不可能再继续」的时刻都要停：
   * 开始调工具、这一轮收尾、或者正文开始。**三个都得算**。
   */
  private 思考停表(sessionId: SessionId, e: Entry): void {
    if (e.思考起于 === undefined) return
    const ms = this.now() - e.思考起于
    e.思考起于 = undefined
    const id = e.openTurnId
    if (!id) return
    const item = e.items.find((x) => x.id === id)
    if (item?.type !== "turn" || !item.thinking) return
    /**
     * **同一轮里想过两段就相加**（2026-08-12）。
     *
     * 「想 → 调工具 → 再想 → 回答」是一轮，两段思考并成了一块显示，
     * 那块上的数字就该是**两段之和**——只留前一段等于少报。
     *
     * 而 `思考起于` 只在真有新一段时才有值，所以这里不会被反复累加：
     * 停过一次之后它就是 undefined，上面那句直接返回了。
     */
    this.putItem(sessionId, e, { ...item, thinkingMs: (item.thinkingMs ?? 0) + ms })
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
    /**
     * **校验不合格就丢掉这一条，但绝不把异常抛回调用方。**
     *
     * 2026-08-10 踩过：这里原本直接 `parse`，一条字段多了的更新让它抛出，
     * 而这个方法是被 runtime 的事件回调同步调到的——**那一抛顺着
     * `emit` 窜回 pi 的事件循环，把后面的文本增量全掐掉了**。
     * 症状是「回复再也不出现」，与真正的错处（多了几个字段）看起来毫无关系。
     *
     * 「畸形更新不该流到界面」仍然成立，所以它被丢掉；
     * **但它必须出声**（规格 7.5），而且 revision 已经加过——
     * 界面会看到跳号并自行重新同步，那正是为跳号准备的那条路。
     */
    let update: ReturnType<typeof SessionUpdateSchema.parse>
    try {
      update = SessionUpdateSchema.parse({
        workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
        sessionId,
        revision: e.revision,
        ...body,
      })
    } catch (err) {
      console.error(
        `[中枢] 会话 ${sessionId} 的一条更新不合协议，已丢弃（revision ${e.revision} 因此跳号）：`,
        err instanceof Error ? err.message : String(err),
      )
      return
    }
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
      ...(e.kernelInstanceId ? { kernelInstanceId: e.kernelInstanceId } : {}),
    }
  }
}

/**
 * `ConsoleEntry` → 协议里的 `kernelOutput.output`。
 *
 * **两者刻意不是同一个类型**：运行时那边带着 `provenance`（每条都有），
 * 而协议里溯源提到条目顶层——**同一份事实在一条记录里只存一次**。
 * 存两份的后果不是浪费，是**它们会不一致**，而那时没人知道该信哪个。
 */
function toProtocolOutput(
  entry: Exclude<import("../kernel/outputs.js").ConsoleEntry, { kind: "status" }>,
): Extract<TranscriptItem, { type: "kernelOutput" }>["output"] {
  if (entry.kind === "stream") {
    return {
      kind: "stream",
      stream: entry.stream,
      text: entry.text,
      ...(entry.truncated ? { truncated: entry.truncated } : {}),
    }
  }
  if (entry.kind === "error") {
    return { kind: "error", ename: entry.ename, evalue: entry.evalue, traceback: entry.traceback }
  }
  return {
    kind: entry.kind,
    mediaType: entry.mediaType,
    data: entry.data,
    bytes: entry.bytes,
    ...(entry.tooLarge ? { tooLarge: true } : {}),
    ...(entry.truncated ? { truncated: entry.truncated } : {}),
    alsoAvailable: entry.alsoAvailable,
  }
}
