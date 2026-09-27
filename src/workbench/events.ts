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
import {
  没说话,
  SessionUpdateSchema,
  type KernelState,
  type QueuedMessage,
  type SessionSnapshot,
  type SessionUpdate,
  type SubagentInfo,
  type TranscriptItem,
} from "../protocol/events.js"
import { 子转录id, 拆子转录id, 是子转录id, 同一个子转录, 子目录段 } from "../protocol/subagent-id.js"
import type { 子转录事件 } from "../subagent/protocol.js"
import { 活动一句 } from "../subagent/activity.js"
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
  /**
   * 每段会话在内存里最多留几段**跑完了、没人看着**的子转录（2026-09-27 审查）。超了按最久没用的丢——
   * 它们都能从盘上重建（`openSubagent`）；一段派了几百个子 agent 的长对话不该让中枢无界地长。缺省 {@link 子转录留存上限}
   */
  子转录留存上限?: number
}

/** 见 {@link SessionTranscriptsOptions.子转录留存上限} */
export const 子转录留存上限 = 20

/** 一整轮真正结束（runtime 的 `idle`）。`失败` = 这一轮收尾前出过的第一句「失败了」 */
export interface 回合收尾 {
  sessionId: SessionId
  kind: "native" | "pty" | "cli" | "kernel" | "acp"
  失败?: string
}

interface Entry {
  /**
   * `cli` 与 `native` 一样吐结构化事件，**只有 `pty` 是字节流**——
   * 下面 `output` 分支判的正是这一件事。保留 `cli` 这个取值而不是映射成
   * `native`，是因为**丢掉它就再也答不出「这个会话是谁在跑」**。
   */
  kind: "native" | "pty" | "cli" | "kernel" | "acp"
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
  /**
   * **正等着人回答的那次权限询问**（A2，只有 acp 会有）。
   *
   * 它不是一条转录条目：转录是「发生过什么」，而这个是**一个还没结果的问题**，
   * 有生命周期（答了就没了），而且屏幕上要能点。
   * 混进转录的话，答完之后那张卡还留在历史里、按钮还能按——
   * 而那时它按下去什么也不会发生。
   *
   * **缺省 = 没有人在问**，不是「问过了」。
   */
  /**
   * 这一段可以调的开关（A3，只有 acp 有）。**缺省 = 这条运行时没有这回事**，
   * 与「有但是空的」不是一回事——界面据此决定不画那个菜单。
   */
  /** 这段会话的团队（team-board）。缺省 = 没建过 */
  team?: import("../protocol/events.js").TeamSnapshot | undefined
  /**
   * 这段对话挂着的内核状态列表（笔记本，2026-08-26）。缺省 = 没有内核——
   * 不是 native 会话，或还没起过内核。与 `team` 同一纪律：整份换掉。
   */
  kernels?: KernelState[] | undefined
  /** 待发单（2026-09-23）。缺省 = 没有待发；整份换掉 */
  queued?: QueuedMessage[] | undefined
  /**
   * 这一轮收尾之前出过的第一句「失败了」（带 `failed` 的 notice，桌面通知 2026-09-27）。`idle` 时交给 `on回合收尾` 并清空。
   * 缺省 = 这一轮没失败过。**失败之后这一轮又往前走了**（出字、想、调工具）就清掉：pi 自己会重试
   * （限流 / 过载的自动重试、超上限压完再试同一轮），重试成了那一轮就是做完了，不是出错了。
   */
  本轮失败?: string | undefined
  /**
   * 同一次收尾里**更早那句人话**那段出过的失败（2026-09-28 审查）。pi 的 followUp 链：第一句失败、排着的第二句接着出字，
   * 一整条链只有最后一个 `idle`——「往前走了就清」只该清第二句那段自己的失败，第一句的失败得留到收尾照报。
   * 人那句进来（`userTurn`）时把 `本轮失败` 挪到这里；它不被「往前走」清掉，`idle` 时优先交出去。
   */
  链上失败?: string | undefined
  configOptions:
    | {
        id: string
        name: string
        description?: string
        category?: string
        kind: "select" | "boolean"
        current: string
        options: { value: string; name: string; description?: string }[]
      }[]
    | undefined
  pendingPermission:
    | { requestId: string; title: string; options: { optionId: string; name: string; kind: string }[] }
    | undefined
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
  /** 正在压缩的那条标记的 id（2026-09-27）。`compaction_end` 收它；没有（没有 start 的 end）就新起一条 */
  压缩中: string | undefined
  /**
   * 这是一段子 agent 的转录（2026-09-27，spec §4.3）。**它的更新不给「全听」**：飞书 / 微信的「答完了」通知
   * 与定时任务的完成判定只认真会话——子转录第一句是「你」、最后一句是 agent 的 final，不挡的话每派一个子 agent 手机就响一次。
   */
  子转录?: true | undefined
  /** 子转录的头信息（谁、任务、状态、交回的结果、能不能接着问）。只有子转录有 */
  子agent?: SubagentInfo | undefined
  /** 最近一次被用到（建、订、看、推）的次序号。子转录超额时丢最久没用的（LRU） */
  用过: number
}

export class SessionTranscripts {
  private readonly entries = new Map<SessionId, Entry>()
  private readonly subscribed = new Set<SessionId>()
  /**
   * **钉住的会话**（远程助理，2026-08-21）：界面订没订都推。
   * 微信通道要一直听着它绑的那段，而 `subscribed` 跟着界面走——人切到别的会话，
   * 界面退订，通道就聋了。两个集合分开，谁都不替谁做决定。
   */
  private readonly pinned = new Set<SessionId>()
  private readonly listeners = new Set<(u: SessionUpdate) => void>()
  /**
   * **不受订阅门管的听众**（远程助理的通知，2026-08-21）：每一段会话的每一条更新都给。
   * 订阅那道门是给界面省事的（没打开的会话不推）；通知恰恰要听的是没打开的那些。
   */
  private readonly 全听 = new Set<(u: SessionUpdate) => void>()
  /**
   * **一整轮真正结束时**叫的人（桌面通知，2026-09-27）。与 `全听` 分开：`idle` 不产生任何转录条目、也不跳 revision——
   * 它不是一条更新，是一个时刻。此前 `ingest` 里没有 `case "idle"`，它被静静吃掉了。
   */
  private readonly 收尾听众 = new Set<(v: 回合收尾) => void>()
  /** LRU 的时钟：只增不减的次序号，不是墙钟（同一毫秒里的先后也要分得清） */
  private 次序 = 0

  constructor(private readonly opts: SessionTranscriptsOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  /** 会话创建时登记。`kind` 决定字节进终端还是进对话，之后不会变。 */
  track(
    sessionId: SessionId,
    kind: "native" | "pty" | "cli" | "kernel" | "acp",
    opts?: { 子转录?: true; 已结束?: true },
  ): void {
    if (this.entries.has(sessionId)) return
    this.entries.set(sessionId, {
      kind,
      revision: 0,
      items: [],
      terminal: "",
      terminalTrimmed: false,
      kernelInstanceId: undefined,
      // 读盘重建的子转录（2026-09-27 审查）：那一段早就不在跑了，快照要说 exited——界面据此不画「正在干活」
      state: opts?.已结束 ? "exited" : "alive",
      exitCode: undefined,
      openTurnId: undefined,
      configOptions: undefined,
      team: undefined,
      pendingPermission: undefined,
      turnSeq: 0,
      思考起于: undefined,
      当前模型: undefined,
      压缩中: undefined,
      用过: ++this.次序,
      ...(opts?.子转录 ? { 子转录: true as const } : {}),
    })
  }

  /**
   * 中枢里指着同一个运行目录的那段子转录的 id（2026-09-27 审查）：先认原样的，再认安全化之后相同的
   * （`call.1` 与 `call_1` 落在同一个目录，只该有一段）。没有就是 undefined
   */
  找子转录(id: SessionId): SessionId | undefined {
    if (this.entries.has(id)) return id
    if (!是子转录id(id)) return undefined
    for (const [k, e] of this.entries) if (e.子转录 && 同一个子转录(k, id)) return k
    return undefined
  }

  /** 推送出口。`electron/main.ts` 把它接到 webContents。 */
  onUpdate(cb: (u: SessionUpdate) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** 此刻的转录条目，**不订阅、不改状态**（提示词增强读对话历史用）。没追踪的回空 */
  peekItems(sessionId: SessionId): readonly TranscriptItem[] {
    return this.entries.get(sessionId)?.items ?? []
  }

  /** 每一段会话、每一条更新，**不看订没订**。通知用 */
  onAnyUpdate(cb: (u: SessionUpdate) => void): () => void {
    this.全听.add(cb)
    return () => {
      this.全听.delete(cb)
    }
  }

  /**
   * 一整轮真正结束（桌面通知用）。**不看订没订**，与 `onAnyUpdate` 同一个理由。
   * 子转录不叫（与 `全听` 同一条，见 `Entry.子转录`）；压缩、回退都不经过 `idle`，自然也不叫。
   */
  on回合收尾(cb: (v: 回合收尾) => void): () => void {
    this.收尾听众.add(cb)
    return () => {
      this.收尾听众.delete(cb)
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
    // 界面**不认这句话的字**：「坞里那段真没了」看的是 `backend.ts` subscribeSession 挂的 `details.gone`（Task 6 复审 F1）
    if (!e) throw new Error(`会话 "${sessionId}" 未在本进程中活动，没有记录可订阅`)
    this.subscribed.add(sessionId)
    e.用过 = ++this.次序
    return this.snapshot(sessionId, e)
  }

  /** 只看一眼，不订阅（侧边读主对话用）。不在本进程 → undefined，由调用方如实说 */
  peek(sessionId: SessionId): SessionSnapshot | undefined {
    const e = this.entries.get(sessionId)
    if (e) e.用过 = ++this.次序
    return e ? this.snapshot(sessionId, e) : undefined
  }

  /**
   * 退订。**子转录顺手放掉**（2026-09-27 审查）：退订的是一段跑完了、没在答的子转录 → 忘掉它；
   * 退订的是主会话 → 它名下跑完了、没在答、没人看着的子转录一起忘。都能从盘上重建（`openSubagent`），
   * 留着就是一段跟着整个进程活下去的内存。还在跑的、在答的、有人看着的一律留着——它们的下一句还要推。
   */
  unsubscribe(sessionId: SessionId): void {
    this.subscribed.delete(sessionId)
    if (是子转录id(sessionId)) {
      const e = this.entries.get(sessionId)
      if (e && this.可放掉(sessionId, e)) this.忘掉(sessionId)
      return
    }
    for (const [k, e] of [...this.entries]) {
      if (e.子转录 && 拆子转录id(k)?.会话 === sessionId && this.可放掉(k, e)) this.忘掉(k)
    }
  }

  /** 跑完了、没在答、没人订、没被钉住的子转录——丢了也能从盘上建回来 */
  private 可放掉(id: SessionId, e: Entry): boolean {
    const a = e.子agent
    return !!e.子转录 && !!a && a.status !== "running" && !a.asking && !this.subscribed.has(id) && !this.pinned.has(id)
  }

  /** 这段会话名下跑完了的子转录超过上限时，丢最久没用的那几段（只丢 {@link 可放掉} 的） */
  private 收紧子转录(会话: SessionId, 留: SessionId): void {
    const 上限 = this.opts.子转录留存上限 ?? 子转录留存上限
    const 跑完的: [SessionId, Entry][] = []
    for (const [k, e] of this.entries) {
      if (e.子转录 && e.子agent && e.子agent.status !== "running" && 拆子转录id(k)?.会话 === 会话) 跑完的.push([k, e])
    }
    if (跑完的.length <= 上限) return
    let 多 = 跑完的.length - 上限
    for (const [k, e] of 跑完的.sort((a, b) => a[1].用过 - b[1].用过)) {
      if (多 <= 0) break
      // 刚收尾 / 刚建起来的那一段不丢：后端下一步就要订它
      if (k === 留 || !this.可放掉(k, e)) continue
      this.忘掉(k)
      多--
    }
  }

  pin(sessionId: SessionId): void {
    this.pinned.add(sessionId)
  }

  unpin(sessionId: SessionId): void {
    this.pinned.delete(sessionId)
  }

  /** 会话彻底不要了时清掉。这是内存，不是账本。子转录跟着父会话走（2026-09-27）——它们也只是内存 */
  forget(sessionId: SessionId): void {
    this.忘掉(sessionId)
    this.忘掉子转录(sessionId)
  }

  private 忘掉(id: SessionId): void {
    this.entries.delete(id)
    this.subscribed.delete(id)
    this.pinned.delete(id)
  }

  /**
   * 忘掉这段会话的子转录：不给调用就是全部，给了就是那一次调用那一组。
   * **按拆出来的字段比，不按前缀**（2026-09-27 审查）：前缀 `S#sub:a:` 会连 `a:0` 那次调用（`S#sub:a:0:1`）一起吞掉；
   * toolCallId 按盘上那一段比（`call.1` 与 `call_1` 是同一组）。
   */
  private 忘掉子转录(会话: SessionId, toolCallId?: string, 每段?: (toolCallId: string, index: number, e: Entry) => void): void {
    for (const [id, e] of [...this.entries]) {
      if (!e.子转录) continue
      const 拆 = 拆子转录id(id)
      if (!拆 || 拆.会话 !== 会话) continue
      if (toolCallId !== undefined && 子目录段(拆.toolCallId) !== 子目录段(toolCallId)) continue
      每段?.(拆.toolCallId, 拆.序号, e)
      this.忘掉(id)
    }
  }

  dispose(): void {
    this.entries.clear()
    this.subscribed.clear()
    this.listeners.clear()
    // pinned 与 全听 也要清(审查 debug F12):此前漏了这两个,微信/飞书注册的 onAnyUpdate 回调
    // 在 dispose 后还挂着——退出/重装配时旧通道回调仍会被后续事件触发,pinned 集也残留。
    this.pinned.clear()
    this.全听.clear()
    this.收尾听众.clear()
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
  /**
   * @param images 这一轮附的图，**缩略图的 `data:` URL**（协议 4.14）。
   *   不是原图：转录会被反复读、会随快照整个发过来，
   *   塞原图进去等于每次切会话都搬一遍几 MB。
   */
  userTurn(sessionId: SessionId, text: string, images?: readonly string[]): void {
    const e = this.entries.get(sessionId)
    if (!e || e.kind === "pty") return
    // 新的一句人话：前一句那段的失败已经定了，不许被这一句的进展清掉
    if (e.本轮失败 !== undefined) {
      e.链上失败 ??= e.本轮失败
      e.本轮失败 = undefined
    }
    e.turnSeq += 1
    this.putItem(sessionId, e, {
      type: "turn",
      id: `u${e.turnSeq}`,
      who: "user",
      text,
      final: true,
      ...(images && images.length > 0 ? { images: [...images] } : {}),
    })
  }

  /** 还在「正在压缩」的那条收成 cancelled（没有就什么都不做） */
  private 收掉悬着的压缩(sessionId: SessionId, e: Entry): void {
    const id = e.压缩中
    if (id === undefined) return
    e.压缩中 = undefined
    const 旧 = e.items.find((x) => x.id === id)
    this.putItem(sessionId, e, {
      type: "compaction",
      id,
      status: "cancelled",
      ...(旧 && 旧.type === "compaction" && 旧.reason ? { reason: 旧.reason } : {}),
    })
  }

  /** 把 runtime 的事件并进记录。 */
  ingest(sessionId: SessionId, event: AgentEvent): void {
    const e = this.entries.get(sessionId)
    if (!e) return

    // 失败之后这一轮又往前走了（pi 自动重试 / 超上限压完再试成了）：那句失败不再代表这一轮（桌面通知，2026-09-27）。
    // 压缩那一对不算「往前走」——它既不清、也不记
    if (e.本轮失败 !== undefined && (event.kind === "output" || event.kind === "thinking" || event.kind === "tool_start")) {
      e.本轮失败 = undefined
    }

    switch (event.kind) {
      case "started":
        return // 会话建好时状态已是 alive，不必再推一条

      case "exited":
        // 压缩压到一半会话就停了：pi 的 end 可能在 dispose 之后才到、再也收不到——
        // 那条「正在压缩…」不许永远挂着（2026-09-27 审查抓的），收成「停下了，没有改动」
        this.收掉悬着的压缩(sessionId, e)
        // 退出不经过 idle：这一段记着的失败到此作废（退出码另有一条通知），不许留到下一次起来之后的第一声收尾
        e.本轮失败 = undefined
        e.链上失败 = undefined
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
          /**
           * 这条输出是哪台内核吐的（②，协议 5.5）。
           *
           * **只有普通对话挂内核那条路会填**：一段对话可以同时挂 Python 与 R，
           * 不标的话两台的输出混在一起就没有判据了。
           * `kind: kernel` 那条既有的路一段会话只有一个内核，**不填即原样**。
           */
          ...(event.language ? { language: event.language } : {}),
          output: toProtocolOutput(event.entry),
        })
        return
      }

      /**
       * 这一段可以调的开关变了（A3）。**整份换掉**——
       * 它给的就是整份新的，合并只会多一种「合错了」的失效方式。
       */
      /** 团队变了（team-board）：整份换掉，推一条 `team` 更新；快照里也带着 */
      case "team_changed": {
        e.team = event.team
        this.bump(sessionId, e, { type: "team", team: event.team })
        return
      }

      case "config_options": {
        e.configOptions = event.options.map((o) => ({
          ...o,
          options: o.options.map((x) => ({ ...x })),
        }))
        this.bump(sessionId, e, { type: "snapshot", snapshot: this.snapshot(sessionId, e) })
        return
      }

      /**
       * agent 在问「能不能」（A2）。**挂成待答的那一格，不进转录。**
       *
       * 理由见 `pendingPermission` 那条注释：它是一个还没结果的问题，
       * 不是「发生过什么」。
       */
      case "permission_settled":
        this.清权限询问(sessionId)
        return

      case "permission_request":
        this.收权限询问(sessionId, {
          requestId: event.requestId,
          title: event.title,
          options: event.options.map((o) => ({ ...o })),
        })
        return

      case "notice":
        // 这一轮失败了：记下第一句，`idle` 时交给桌面通知（2026-09-27）。条目照常进转录
        if (event.failed) e.本轮失败 ??= event.text
        // 系统提示独立成条。**不并进 agent 的发言**——那会让用户以为是模型说的
        this.putItem(sessionId, e, {
          type: "notice",
          id: `notice-${++e.turnSeq}`,
          text: event.text,
          // 带上「这一轮没做成」：界面据它收掉「正在等回话」——这句报错就是这一轮的回音（2026-09-28）
          ...(event.failed ? { failed: true as const } : {}),
        })
        return

      /**
       * **一次压缩是转录里的一条**（2026-09-27，spec §2.3）。start 立一条 running，end 把**同一条**收成
       * done / failed / cancelled（按 id 覆盖）。没有 start 的 end（pi 超上限、压完重试过一次仍放不下时只发 end）新起一条——
       * 失败必须出声，不能因为没见过开头就丢。
       */
      case "compaction_start": {
        // 上一条还悬着又来一次 start（pi 今天不会这样）：先把旧的收掉，别让它永远「正在压缩」
        this.收掉悬着的压缩(sessionId, e)
        const id = `compact-${++e.turnSeq}`
        e.压缩中 = id
        this.putItem(sessionId, e, { type: "compaction", id, status: "running", reason: event.reason })
        return
      }
      case "compaction_end": {
        const id = e.压缩中 ?? `compact-${++e.turnSeq}`
        e.压缩中 = undefined
        this.putItem(sessionId, e, {
          type: "compaction",
          id,
          status: event.status,
          reason: event.reason,
          ...(event.tokensBefore !== undefined ? { tokensBefore: event.tokensBefore } : {}),
          ...(event.tokensAfter !== undefined ? { tokensAfter: event.tokensAfter } : {}),
          ...(event.summary ? { summary: event.summary } : {}),
          ...(event.error ? { error: event.error } : {}),
          ...(event.retried ? { retried: true as const } : {}),
          ...(event.usage ? { usage: event.usage } : {}),
        })
        return
      }

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
        const 并来的 = 旧 ? {} : this.吸收只想没说的(sessionId, e, id)
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
        this.收尾当前发言(sessionId, e)
        return
      }

      /**
       * **一整轮真正结束**（桌面通知，2026-09-27）。不产生条目、不 bump——只叫 `on回合收尾` 的人。
       * 失败那句交出去就清掉：下一轮从干净开始。
       * **子转录不叫**：与 `全听` 同一条（子 agent 不发通知，spec）。它今天也收不到 idle（子进程的过程里没有这一种），这里是防御。
       * 压缩（`compaction_*`）与回退（`truncateAt`）都不经过这里：pi 的自动压缩与重试都在同一次 `prompt()` 里，idle 只在它真正 resolve 时发一次。
       */
      case "idle": {
        /**
         * **整轮都结束了，还开着的那条发言一并收尾**（2026-09-28）。不是每条失败路都先发 `turn_end`：
         * codex 的 `fatal()` 只发 notice + idle——说到一半出错，那条发言就永远 `final: false`，界面据它算的「这一轮在跑」恒为真
         * （停止键不消失、模型菜单锁死）。`idle` 时什么都不在流了，收尾是安全的；与 `turn_end` 同一份实现，幂等。
         */
        if (e.kind !== "pty") this.收尾当前发言(sessionId, e)
        const 失败 = e.链上失败 ?? e.本轮失败
        e.本轮失败 = undefined
        e.链上失败 = undefined
        if (e.子转录) return
        const v: 回合收尾 = { sessionId, kind: e.kind, ...(失败 === undefined ? {} : { 失败 }) }
        for (const cb of [...this.收尾听众]) cb(v)
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
        // 子转录（2026-09-27）：start 开一段；end 不碰它（它由 `subagent_event` 的 settled 收尾，先于 end 到）
        if (event.kind === "subagent_start") this.开子转录(sessionId, event.toolCallId, event.index, event.agent, event.task)
        return
      }

      /**
       * 子 agent 的一条过程 / 跑完了（2026-09-27，spec §4.3）。过程翻进它那段子转录（与会话同一套归并——
       * 文本增量并进同一条发言，不是一段一条）；`tool_start` 顺手换掉 chip 上那一句——**只换还在跑、且不是接着问的**：
       * 接着问是旁边问的，不是主 agent 的事，跑完的 chip 不能被它重新点亮。
       */
      case "subagent_event": {
        const 子 = this.找子转录(子转录id(sessionId, event.toolCallId, event.index)) ?? 子转录id(sessionId, event.toolCallId, event.index)
        const ce = this.entries.get(子)
        const ev = event.event
        if (ce) {
          if (ev.kind === "settled") this.子agent收尾(子, ce, ev, event.toolCallId)
          else this.ingest(子, { ...ev, sessionId: 子 } as AgentEvent)
        }
        if (ev.kind === "tool_start" && !ce?.子agent?.asking) {
          this.chip换一句(sessionId, e, event.toolCallId, event.index, 活动一句(ev.toolName, ev.input))
        }
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

      case "tool_files":
        // 有新建才推（spec 2026-08-26-产物 §3）：清单本身走 listArtifacts 查，这里只说「变了」
        if (event.filesCreated.length > 0) this.bump(sessionId, e, { type: "artifactsChanged" })
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
          // 被停下的（停止 / 调整方向）：没做完，算 error；`interrupted` 让界面写「已中断」而不是「失败」
          status: event.isError || event.interrupted ? "error" : "ok",
          ...(event.interrupted ? { interrupted: true as const } : {}),
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
   * 回退这一轮（2026-09-27）：从这条（一条用户发言）起（含）往后都撤掉——**你在笔记本里自己敲的 `cell` 项留着**：
   * 内核没回退，它们仍是内核里的事实，笔记本那一格还要画它们（`$笔记本cells` 从转录里取）。
   * 那句之后的压缩标记（`compaction`）跟着撤：pi 的新分支上也没有它。正在压的那条被撤掉了就忘掉它的 id
   * （运行时在压的时候拒回退，这里只是不留一根悬着的指针）。
   * 整份换掉、推一帧快照——与 `restore()` 同一个理由：几十条 dropItem 描述的是同一件事。找不到那条返回 false。
   */
  truncateAt(
    sessionId: SessionId,
    itemId: string,
    /** 被撤掉的子转录里**正在答续问的**那几个（2026-09-27 审查）：调用方据此把那一问停掉——chip 都没了，它答完也没处放 */
    撤掉在答的?: (toolCallId: string, index: number) => void,
  ): boolean {
    const e = this.entries.get(sessionId)
    if (!e) return false
    const i = e.items.findIndex((x) => x.id === itemId)
    if (i < 0) return false
    // 撤掉的 chip 组，它们的子转录一起忘（2026-09-27）：chip 没了就再也点不开，留着只是一段够不着的内存
    for (const x of e.items.slice(i)) {
      if (x.type !== "subagents") continue
      this.忘掉子转录(sessionId, x.id.slice("sub:".length), (tc, n, ce) => {
        if (ce.子agent?.asking) 撤掉在答的?.(tc, n)
      })
    }
    e.items = [...e.items.slice(0, i), ...e.items.slice(i).filter((x) => x.type === "cell")]
    e.openTurnId = undefined
    e.思考起于 = undefined
    if (e.压缩中 !== undefined && !e.items.some((x) => x.id === e.压缩中)) e.压缩中 = undefined
    this.bump(sessionId, e, { type: "snapshot", snapshot: this.snapshot(sessionId, e) })
    return true
  }

  /**
   * 往对话里留一条**系统提示**（T3-b，2026-08-12）。
   *
   * 第一个用处是「已归入项目 ~/xxx」。**这一行不能省**：设完工作目录之后，
   * 这段对话会自己从侧栏的「会话」栏跳到「项目」栏——
   * **看得见的东西自己动了，就必须出声**，否则人会以为它丢了。
   * （这是「看不见的能力等于不存在」的反面，同一条纪律。）
   *
   * 走 `notice` 而不是 `turn`：它既不是谁说的话，也不是一次工具调用，
   * 混进对话记录会污染「谁说了什么」。
   */
  notice(sessionId: SessionId, text: string): void {
    const e = this.entries.get(sessionId)
    // **没追踪的会话就不推**：凭空推一条会让界面以为有这么个会话
    if (!e) return
    this.putItem(sessionId, e, { type: "notice", id: `notice-${++e.turnSeq}`, text })
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

  /**
   * 你在内核里自己敲了一段（笔记本，2026-08-26）。返回 cell id；
   * **只有 native 会话有内核**——pty/cli 没有，返回 undefined。
   */
  beginCell(sessionId: SessionId, language: "python" | "R", code: string): string | undefined {
    const e = this.entries.get(sessionId)
    if (!e || e.kind !== "native") return undefined
    const id = `cell-${++e.turnSeq}`
    this.putItem(sessionId, e, {
      type: "cell",
      id,
      language,
      code,
      status: "running",
      startedAt: this.now(),
    })
    return id
  }

  /** 那段 cell 跑完了：按 id 找到它，改状态、盖上跑完的时刻。`interrupted` 是被人按「中断」停下的 */
  finishCell(sessionId: SessionId, id: string, 结果: { status: "ok" | "error"; runId?: string; interrupted?: true }): void {
    const e = this.entries.get(sessionId)
    const it = e?.items.find((i) => i.id === id)
    if (!e || !it || it.type !== "cell") return
    this.putItem(sessionId, e, {
      ...it,
      status: 结果.status,
      endedAt: this.now(),
      ...(结果.runId ? { runId: 结果.runId } : {}),
      ...(结果.interrupted ? { interrupted: true } : {}),
    })
  }

  /**
   * 对话挂着的内核变了（笔记本，2026-08-26）。**整份换掉**——与 `team` 同一纪律，
   * 服务端给的就是当前完整的一份，合并只会多一种「合错了」的失效方式。
   */
  setKernels(sessionId: SessionId, kernels: KernelState[]): void {
    const e = this.entries.get(sessionId)
    if (!e) return
    // **空表不进快照**：与协议注释同一纪律——缺省 = 没有内核，
    // 空数组会被读成「起过、但一台都没有」，那不是「没有内核」这件事本身。
    // 更新照样推空表：客户端要知道内核收掉了，得清掉自己那份状态。
    e.kernels = kernels.length ? kernels : undefined
    this.bump(sessionId, e, { type: "kernels", kernels })
  }

  /**
   * 待发单变了（2026-09-23）。**整份换掉**；空单不进快照（缺省 = 没有待发），但照样推一条——
   * 客户端要知道单子空了，得把自己那份清掉。
   */
  setQueued(sessionId: SessionId, queued: QueuedMessage[]): void {
    const e = this.entries.get(sessionId)
    if (!e) return
    e.queued = queued.length ? queued : undefined
    this.bump(sessionId, e, { type: "queued", queued })
  }

  /**
   * 收尾当前发言（`turn_end`，以及 `idle` 兜底）。**幂等**：没有正在累积的发言时什么都不做——
   * 一个空的 turn 进了记录，界面上就是一个空气泡。
   */
  private 收尾当前发言(sessionId: SessionId, e: Entry): void {
    // **收尾之前先停表**：清掉 openTurnId 之后就找不到那一条了
    this.思考停表(sessionId, e)
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
  private 吸收只想没说的(sessionId: SessionId, e: Entry, 新id: string): { thinking?: string; thinkingMs?: number } {
    const i = e.items.findIndex(
      (x) => x.type === "turn" && x.who === "agent" && x.id !== 新id && 没说话(x) && x.thinking,
    )
    if (i < 0) return {}
    const 旧 = e.items[i] as Extract<TranscriptItem, { type: "turn" }>
    e.items.splice(i, 1)
    // **告诉实时流的订阅者把它删掉**（审查 debug F3）:它已经被推过去了,不发 dropItem 的话
    // 客户端那头还留着这条孤立的思考——「你出现了两次」。快照那一路不含它,只需补实时流这一条。
    this.bump(sessionId, e, { type: "dropItem", id: 旧.id })
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

  private 开子转录(会话: SessionId, toolCallId: string, index: number, agent: string, task: string): void {
    const id = 子转录id(会话, toolCallId, index)
    this.track(id, "native", { 子转录: true })
    const ce = this.entries.get(id)!
    ce.子agent = { agent, task, status: "running", canAsk: false, askWhy: "running" }
    this.userTurn(id, task)
    this.bump(id, ce, { type: "subagent", subagent: ce.子agent })
  }

  private 子agent收尾(id: SessionId, ce: Entry, ev: Extract<子转录事件, { kind: "settled" }>, toolCallId: string): void {
    // 还开着的那段发言收口：子进程被杀时没有 turn_end，不收的话那条永远「还在说」
    this.ingest(id, { kind: "turn_end", sessionId: id })
    const 旧 = ce.子agent
    if (!旧) return
    const 团队 = toolCallId.startsWith("team:")
    if (ev.followUp) {
      // 接着问的那一轮：主 agent 那一轮的 status / result 不动（答复不回主 agent，D3）；失败出声
      if (!ev.ok) this.notice(id, `这一问没答完：${ev.error ?? "没有给出原因"}`)
      const { asking: _a, askWhy: _w, ...留 } = 旧
      ce.子agent = 团队 ? { ...留, canAsk: false, askWhy: "team" } : { ...留, canAsk: true }
    } else {
      const { error: _e, askWhy: _w, ...留 } = 旧
      ce.子agent = {
        ...留,
        status: ev.ok ? "ok" : "error",
        ...(ev.ok ? {} : { error: ev.error ?? "子 agent 失败，但没有给出原因" }),
        ...(ev.result ? { result: ev.result } : {}),
        canAsk: !团队,
        ...(团队 ? { askWhy: "team" as const } : {}),
      }
    }
    this.bump(id, ce, { type: "subagent", subagent: ce.子agent })
    const 会话 = 拆子转录id(id)?.会话
    if (会话) this.收紧子转录(会话, id)
  }

  private chip换一句(sessionId: SessionId, e: Entry, toolCallId: string, index: number, activity: string): void {
    const id = `sub:${toolCallId}`
    const prior = e.items.find((i) => i.id === id)
    if (prior?.type !== "subagents") return
    const at = prior.agents.findIndex((a) => a.index === index)
    const a = prior.agents[at]
    if (!a || a.status !== "running" || a.activity === activity) return
    this.putItem(sessionId, e, { type: "subagents", id, agents: prior.agents.map((x, i) => (i === at ? { ...x, activity } : x)) })
  }

  /**
   * 你在坞里接着问（2026-09-27，spec §2.3）：那句进子转录、标 `asking`。**不能问就回 false**，调用方据此报 `conflict`——
   * 在答的时候、还在跑的时候、团队成员都不行。**查与标是同一步**（同步、中间不让出）：两次并发的续问只有一次拿得到。
   */
  子agent续问开始(id: SessionId, text: string): boolean {
    const ce = this.entries.get(id)
    if (!ce?.子agent?.canAsk) return false
    const { askWhy: _w, ...留 } = ce.子agent
    ce.子agent = { ...留, asking: true, canAsk: false, askWhy: "asking" }
    this.userTurn(id, text)
    this.bump(id, ce, { type: "subagent", subagent: ce.子agent })
    return true
  }

  /** 读盘建起来的子转录（后端 `openSubagent`）写头信息；后端发现续不了时也用它改 `canAsk` */
  设子agent(id: SessionId, info: SubagentInfo): void {
    const ce = this.entries.get(id)
    if (!ce) return
    ce.子agent = info
    this.bump(id, ce, { type: "subagent", subagent: info })
    const 会话 = 拆子转录id(id)?.会话
    if (会话) this.收紧子转录(会话, id)
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
    e.用过 = ++this.次序
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
    // 子转录不给全听（2026-09-27，见 Entry.子转录）
    if (!e.子转录) for (const cb of [...this.全听]) cb(update)
    if (!this.subscribed.has(sessionId) && !this.pinned.has(sessionId)) return
    // 复制一份再遍历：监听者可能在回调里退订
    for (const cb of [...this.listeners]) cb(update)
  }

  /**
   * agent 在问「能不能」（A2）。**只留最新的那一次。**
   *
   * 同时挂两张卡的话，人分不清哪张对应哪次调用——而 ACP 那边一轮里
   * 至多问一次（它要等你答了才继续）。真出现第二次时以新的为准，
   * 旧的那次已经被运行时按取消回掉了。
   */
  收权限询问(
    sessionId: SessionId,
    p: { requestId: string; title: string; options: { optionId: string; name: string; kind: string }[] },
  ): void {
    const e = this.entries.get(sessionId)
    if (!e) return
    e.pendingPermission = p
    // **走整份快照**：协议里的 `snapshot` 那一支就是为「整体状态变了」准备的，
    // 而权限询问一轮至多一次，不值得为它新增一种更新
    this.bump(sessionId, e, { type: "snapshot", snapshot: this.snapshot(sessionId, e) })
  }

  /** 答完了（或取消了）：**卡要消失**。留着的话按钮还能按，而按了什么都不会发生 */
  清权限询问(sessionId: SessionId): void {
    const e = this.entries.get(sessionId)
    if (!e?.pendingPermission) return
    e.pendingPermission = undefined
    this.bump(sessionId, e, { type: "snapshot", snapshot: this.snapshot(sessionId, e) })
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
      ...(e.configOptions?.length ? { configOptions: e.configOptions } : {}),
      ...(e.pendingPermission ? { pendingPermission: e.pendingPermission } : {}),
      ...(e.team ? { team: e.team } : {}),
      ...(e.kernels ? { kernels: e.kernels } : {}),
      ...(e.queued ? { queued: e.queued } : {}),
      ...(e.子agent ? { subagent: e.子agent } : {}),
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
