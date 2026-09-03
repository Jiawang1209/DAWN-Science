/**
 * 会话快照与增量更新（返工 R4 重写）。
 *
 * ## 为什么推倒重来
 *
 * 旧设计是 **seq + 环形缓冲 + `dropped` + `truncated` + `earliestSeq`**：
 * 每会话一条单调递增的序号，缓冲溢出时发一条 `dropped` 说明丢了多少，
 * 重连时若 `fromSeq` 超出窗口就回 `truncated` 并要求界面显示「更早的输出已丢失」。
 *
 * 那一整套纪律**是为一个本不该存在的问题设计的**。只要服务端持有一份完整的
 * transcript，重连时给全量就行，根本不存在「丢了一段要道歉」这回事。
 *
 * 新设计借自 `pi-protocol`：**snapshot + revision**。
 *   - 订阅 → 全量 `SessionSnapshot`（含 `revision`）
 *   - 之后收增量，每条带 `revision`
 *   - **发现 revision 跳号 → 重新取一次快照**
 *
 * 差别不只是简单：**旧设计只能「出声」，新设计能「自愈」。**
 * 跳号在旧设计里是一条无法补救的警告，在新设计里是一次重新同步。
 *
 * ## 终端 scrollback 是例外，而且它不是异常
 *
 * PTY 的字节流没有天然边界，仍需上限。但**终端本来就是有限回滚的**——
 * xterm 自己也只留 5000 行。快照如实标注 `terminalTrimmed`，
 * **不发事件、不要求界面道歉**：把正常契约当成故障来播报，是把噪音当成诚实。
 */
import { z } from "zod"
import { RemoteStateSchema } from "./entities.js"

/** 一条对话发言。native 会话由 pi 的文本增量累积而成 */
const TurnItem = z
  .object({
    type: z.literal("turn"),
    id: z.string().min(1),
    who: z.enum(["user", "agent"]),
    text: z.string(),
    /** 这一轮说完了没有。未完时界面可显示还在输入 */
    final: z.boolean(),
    /**
     * **这一轮是谁答的**（2026-08-12）。
     *
     * 作者截图里那句「DeepSeek」是 `session.agentId`——**建会话时绑死的那个**，
     * 就地换服务之后它不跟着变，于是 kimi 答的话被标成了 DeepSeek。
     * **界面在说谎，而且是最容易被当真的那种**：作者正是拿它当「没换过去」的证据。
     *
     * 不能简单改成「一律显示当前那家」——**那会把历史也改写**：
     * 前面那些确实是 DeepSeek 答的。所以是**每一轮各自记下当时是谁**。
     *
     * **缺省 = 还没换过**，那时 agent 名本来就是对的，退回去用它。
     */
    by: z.string().min(1).optional(),
    /**
     * 这一轮**随消息送出去的图片**（协议 4.14，2026-08-13）。
     *
     * 作者：*「能否放入到对话窗口里面？」*——发完之后，对话里得看得见
     * 自己附了什么。只有一句文字的话，**「我到底附上没有」这个问题
     * 在发出去之后就再也答不了了**。
     *
     * 存的是**缩略图**（`data:` URL），不是原图：
     * 转录会被反复读、会随快照整个发过来，**塞原图进去等于每次切会话
     * 都搬一遍几 MB**。而这里要回答的只是「附的是哪几张」。
     *
     * 缺省 = 这一轮没有图。空数组同义。
     */
    images: z.array(z.string().min(1)).optional(),
    /**
     * 这一轮的**思考过程**（2026-08-12）。
     *
     * 作者看 Hermes 的形态：一个可点开的「Thought briefly」，
     * 展开是它当时在想什么。
     *
     * **与 `text` 分开存**：`text` 是它对你说的话，这个是它对自己说的。
     * 合在一起就等于把草稿当答案念出来。
     * **缺省 = 这个模型没有思考，或者这一轮没想** —— 不是空字符串。
     */
    thinking: z.string().min(1).optional(),
    /** 想了多久（毫秒）。**只有想完了才有**——还在想时界面自己掐表 */
    thinkingMs: z.int().nonnegative().optional(),
    /**
     * 这一段模型输出花了多少 token（3.2，2026-08-10）。
     *
     * **缺席 = 不知道**，不是 0——例如用自有订阅额度的 agent、
     * 或者这一段本来就没有新的模型调用。界面据此说的话完全不同。
     */
    usage: z
      .object({
        input: z.int().min(0).optional(),
        output: z.int().min(0).optional(),
        cacheRead: z.int().min(0).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/**
 * 一次工具调用。
 *
 * **①-B 的界面看不见 agent 在干什么，根因就是没有这个条目**——
 * runtime 只转发文本增量，工具调用整个被丢掉了。
 */
const ToolItem = z
  .object({
    type: z.literal("tool"),
    id: z.string().min(1),
    name: z.string().min(1),
    input: z.unknown(),
    status: z.enum(["running", "ok", "error"]),
    /** 结果正文（可能已截断）。running 时没有 */
    result: z.string().optional(),
    /**
     * 结果被截断了。**必须出声**（规格 7.5）。
     *
     * 此前 runtime 层硬砍 2000 字符且不留任何痕迹，界面却在认真地说
     * 「还有 N 行」——那个「全文」本身就是残缺品。
     */
    resultTruncated: z.boolean().optional(),
    /**
     * **进入本项目时**的字节数，不是我们截断后的。界面靠它说真话。
     *
     * **注意它不等于命令的真实输出量**：pi 的 bash 工具自己先截过一次
     * （实测 20 万字节的输出交到我们手上时是 5.1 万）。所以这个数的准确含义是
     * 「pi 交给我们多少」，而不是「命令产出了多少」——**标错含义比不标更坏**。
     */
    resultBytes: z.number().int().nonnegative().optional(),
    /** 全文落盘位置。写盘失败时缺省——那时正文里会说明内容已丢失 */
    fullOutputPath: z.string().min(1).optional(),
    /**
     * 开始与结束的时刻（epoch 毫秒）。
     *
     * ## 为什么要放进协议，而不是界面自己掐表
     *
     * 作者定下 **bash 不设默认超时**：远端一条 `bwa index` 跑二十分钟是正常的，
     * 中止交给人按。**但那样一来，「还在跑」与「卡死了」在界面上长得一模一样**——
     * 唯一能把两者分开的信息就是**它已经跑了多久**。
     *
     * 界面自己记开始时刻在一种情况下会说谎：**重新订阅一个已在运行的会话**
     * （换页、重开窗口）。那时这条工具调用已经跑了十分钟，界面却从零开始数，
     * 于是它告诉人「刚开始」——这正是本项目最忌的那种错：**看起来很确定地错**。
     * 所以时刻由后端在事件发生的那一刻打上，随快照一起回放。
     */
    startedAt: z.number().int().nonnegative().optional(),
    /** 结束时刻。有它才停表；**缺它不等于还在跑**，看 `status` */
    endedAt: z.number().int().nonnegative().optional(),
  })
  .strict()

/** 错误与系统提示。**它们既不是对话也不是工具**，混进 turn 会污染对话记录 */
const NoticeItem = z
  .object({
    type: z.literal("notice"),
    id: z.string().min(1),
    text: z.string().min(1),
  })
  .strict()

/**
 * 一次 `subagent` 工具调用里的**一组**子 agent（①-B″ · S1）。
 *
 * **一条记录装一组，不是一个子 agent 一条。**
 *
 * 计划 §6 记下的形态来自 Codex 桌面版的 `subagent-activity-chip-group`：
 * *"**chip 组，不是树、也不是日志。**"* 它回答的是「N 个并发子 agent
 * 怎么显示才不淹掉对话」——一行紧凑的状态芯片，点开才展开细节。
 * 每个子 agent 各占一条就是日志，正是要避开的那种。
 */
const SubagentsItem = z
  .object({
    type: z.literal("subagents"),
    /** `sub:<toolCallId>`。**与 ToolItem 的 id 刻意不同**——两者同时存在，撞了会互相覆盖 */
    id: z.string().min(1),
    agents: z.array(
      z
        .object({
          /** 这一批里的第几个。**顺序按它排**，不按完成先后——chip 不该跳来跳去 */
          index: z.int().min(0),
          agent: z.string().min(1),
          task: z.string(),
          status: z.enum(["running", "ok", "error"]),
          /** 失败原因。**`error` 状态下必须有**——不带原因的失败等于没报 */
          error: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict()

/**
 * 内核的一条输出（②-A · K4 · S11）。
 *
 * ## 为什么不复用 `TurnItem`
 *
 * `TurnItem` 装的是一段**文本**。内核的输出**不是文本**：
 * 一张图、一段带 traceback 的报错、一行 stdout 在这里是**三种不同的东西**。
 * 压进一个文本字段就等于回到 Rho **明令禁止**的那条路——
 * *「禁止用 xterm.js 做 R Console」*，理由不是审美：
 * **ANSI 字节流里的输出不可查询、不可溯源、不可审计。**
 *
 * ## 每一条都带溯源，且是出适配器那一刻绑上的
 *
 * S12 的原话：*「输出从诞生那一刻起就绑定溯源状态，不是事后补」*。
 * 三个量各管一件事，**不共用一个计数器**——合并任意两个，
 * 都会在某个「重启 + 重跑」的组合下给出错误的陈旧判断。
 */
const KernelOutputItem = z
  .object({
    type: z.literal("kernelOutput"),
    id: z.string().min(1),
    /** 内核实例。**重启即变**——陈旧标记（S13）靠它 */
    kernelInstanceId: z.string().min(1),
    /** 产生这条输出时的版本号 */
    kernelRevision: z.int().min(0),
    /** 账本上那条 run。**拿不到就没有这个字段**，不是空串 */
    runId: z.string().optional(),
    /**
     * 这条输出是**哪门语言的内核**吐的（②，2026-08-14）。
     *
     * 一段普通对话可以同时挂着 Python 与 R 两台内核（作者定的），
     * 而事件回来时只带内核自己的 sessionId——**不标的话，两台的输出
     * 混在同一条转录里就没有判据了**（本项目咬过三次的那个形状）。
     *
     * **可选**：`kind: kernel` 那条既有的路一段会话只有一个内核，
     * 不需要标，也就不填——**缺席读作「这条转录只有一个内核」**，
     * 不是「不知道哪来的」。
     *
     * 作者的观察让这条更值钱而不是更啰嗦：日常交流里语言几乎总是明说的
     * （*「使用 R 语言帮我 xxx」*），所以**真正需要它的正是模型自己挑的那少数几次**
     * ——那时你得看得见它挑了哪门。
     */
    language: z.enum(["python", "R"]).optional(),
    output: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("stream"),
          /** **两者要分开**——把报错混进正常输出会让人漏看 */
          stream: z.enum(["stdout", "stderr"]),
          text: z.string(),
          /** 截断要说清**省了多少**（规格 7.5），不是「已截断」三个字 */
          truncated: z.object({ originalBytes: z.int(), keptBytes: z.int() }).strict().optional(),
        })
        .strict(),
      z
        .object({
          /** `result` 是表达式的值，`display` 是代码主动要求显示的。**语义不同** */
          kind: z.enum(["result", "display"]),
          mediaType: z.string().min(1),
          /** **超上界时为空串**，靠 `tooLarge` + `bytes` 说清为什么 */
          data: z.string(),
          bytes: z.int().min(0),
          tooLarge: z.boolean().optional(),
          truncated: z.object({ originalBytes: z.int(), keptBytes: z.int() }).strict().optional(),
          /** 这份输出还带了哪些别的 mime。**摆出来**，人才知道有别的形态可选 */
          alsoAvailable: z.array(z.string()),
        })
        .strict(),
      z
        .object({
          kind: z.literal("error"),
          ename: z.string(),
          evalue: z.string(),
          
/** 原始 traceback，**带 ANSI 转义**。渲染层再处理，不在协议里丢信息 */
          traceback: z.array(z.string()),
        })
        .strict(),
    ]),
  })
  .strict()

/**
 * 你在对话挂着的内核里自己敲的一段（笔记本，2026-08-26）。
 * **agent 跑的不用它**——那是 `tool` 项 `run_code` + 紧随其后的 `kernelOutput`。
 */
const CellItem = z
  .object({
    type: z.literal("cell"),
    id: z.string().min(1),
    language: z.enum(["python", "R"]),
    code: z.string(),
    status: z.enum(["running", "ok", "error"]),
    startedAt: z.int().nonnegative(),
    /** 跑完的时刻。running 时没有 */
    endedAt: z.int().nonnegative().optional(),
    /** 账本上那条 run。**拿不到就没有这个字段**，不是空串 */
    runId: z.string().min(1).optional(),
    /**
     * 这段是被人按「中断」停下的（7.27）。**只有 true 一种取值**：没被中断就没有这个字段，
     * 而不是 `false`——「跑完了」与「没记录」在这里是同一件事，不需要第三态。
     */
    interrupted: z.literal(true).optional(),
  })
  .strict()

/** 一台内核的状态（笔记本，2026-08-26）。由 `挂载.ts` 从内核事件里跟踪 */
export const KernelStateSchema = z
  .object({
    language: z.enum(["python", "R"]),
    state: z.enum(["starting", "idle", "busy", "exited"]),
  })
  .strict()
export type KernelState = z.infer<typeof KernelStateSchema>

export const TranscriptItemSchema = z.discriminatedUnion("type", [
  TurnItem,
  ToolItem,
  NoticeItem,
  SubagentsItem,
  KernelOutputItem,
  CellItem,
])
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>

/** 团队快照（team-board，7.22）。字段照 `src/team/types.ts`；协议这一侧只管形状 */
export const TeamSnapshotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    goal: z.string(),
    captainSessionId: z.string(),
    createdAt: z.number(),
    finishedAt: z.number().optional(),
    members: z.array(
      z
        .object({
          name: z.string(),
          agent: z.string(),
          role: z.string().optional(),
          provider: z.string().optional(),
          model: z.string().optional(),
          status: z.enum(["idle", "working", "removed"]),
          sessionDir: z.string(),
          turns: z.number(),
          joinedAt: z.number(),
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          id: z.string(),
          subject: z.string(),
          description: z.string().optional(),
          status: z.enum(["pending", "claimed", "in_progress", "completed", "failed", "cancelled"]),
          assignee: z.string().optional(),
          dependencies: z.array(z.string()),
          output: z.string().optional(),
          attempt: z.number(),
          attemptId: z.string().optional(),
          createdAt: z.number(),
          updatedAt: z.number(),
        })
        .strict(),
    ),
    messages: z.array(
      z
        .object({ id: z.string(), from: z.string(), to: z.string(), content: z.string(), ts: z.number(), deliveredAt: z.number().optional() })
        .strict(),
    ),
    taskSeq: z.number(),
  })
  .strict()
export type TeamSnapshot = z.infer<typeof TeamSnapshotSchema>

export const SessionSnapshotSchema = z
  .object({
    sessionId: z.string().min(1),
    kind: z.enum([
      "native",
      "pty",
      /**
       * 外部 CLI 的 headless 模式（①-C）。**与 `pty` 是两件事**：
       * `pty` 是字节流终端，`cli` 拿到的是结构化事件——界面正靠这个判别式
       * 决定画对话还是画终端。
       */
      "cli",
      /**
       * Jupyter 内核（②-A · K4）。**与前三种都不同**：
       * 它的输出是**结构化条目**（图/表/报错各是一种东西），
       * 不是文本流也不是字节流——界面据此画结构化 Console 而不是终端。
       *
       * Rho 明令禁止用 xterm.js 做 REPL，理由不是审美：
       * **ANSI 字节流里的输出不可查询、不可溯源、不可审计。**
       */
      "kernel",
      /** ACP agent（2026-08-16）。与 `cli` 的区别是**它会主动问权限**——
          界面据此多画一样东西（权限卡），所以不能混进 `cli` */
      "acp",
    ]),
    /** 单调递增。**0 表示还什么都没发生**，增量的 revision 从 1 起 */
    revision: z.int().min(0),
    items: z.array(TranscriptItemSchema),
    /** PTY 的 scrollback。native 会话恒为空串 */
    terminal: z.string(),
    /** scrollback 已达上限、更早的部分被裁掉。**如实标注，但这不是故障** */
    terminalTrimmed: z.boolean(),
    state: z.enum(["alive", "exited"]),
    exitCode: z.int().optional(),
    /**
     * **当前**内核实例的身份（②-A · K5 · S13）。只有 `kind: kernel` 有。
     *
     * ## 它存在，是为了拆穿 notebook 最经典的谎言
     *
     * *「单元格显示的结果，可能来自三次重启之前的状态。」*
     * 每条输出都记着**它诞生时**的 `kernelInstanceId`；界面拿它与这里这个一比，
     * 就知道那条输出是不是上一个内核算出来的——**那时它描述的状态已经不存在了**。
     *
     * **缺省 = 还没有内核**（会话刚建、或已退出），不是「不陈旧」。
     * 拿不到就不做陈旧判断，**不猜**。
     */
    kernelInstanceId: z.string().optional(),
    /**
     * **正等着人回答的那次权限询问**（A2，2026-08-16，只有 acp 会有）。
     *
     * 它不是转录条目：转录是「发生过什么」，这个是**一个还没结果的问题**——
     * 有生命周期（答了就没了），而且屏幕上要能点。混进转录的话，
     * 答完之后那张卡还留在历史里、按钮还能按，而那时按下去什么都不会发生。
     *
     * `options` **原样来自 agent**：`optionId` 是回答时要带回去的那个 id，
     * `name` 是给人看的字，`kind` 是它的性质（`allow_once` 之类）。
     * **我们不编自己的一套**——编了的话回过去的 id 它不认。
     */
    /**
     * 这一段会话**可以调的那些开关**（A3，2026-08-16，只有 acp 有）。
     *
     * ACP 里没有「换模型」这个操作——它有的是一串开关，
     * 每一条是「选一个」或「开/关」，而**模型只是 `category` 的一个取值**
     * （还有 `mode`、`thought_level`…，而且规范允许出现我们没见过的）。
     *
     * 所以这里**照单全收**，不挑出「模型」那一条特殊对待：
     * 挑的话，agent 加了新开关我们就看不见了，
     * 而那正是 ACP 比 `cli` 多出来的东西。
     *
     * **一个都没有时整个字段缺席**（不是空数组）——界面据此决定不画那个菜单。
     */
    configOptions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            description: z.string().optional(),
            /** `model` / `mode` / `thought_level` / 未知。**只影响排版** */
            category: z.string().optional(),
            kind: z.enum(["select", "boolean"]),
            /** select：当前选中的 value id；boolean：`"1"` 或 `""` */
            current: z.string(),
            options: z.array(
              z
                .object({
                  value: z.string().min(1),
                  name: z.string().min(1),
                  description: z.string().optional(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    pendingPermission: z
      .object({
        requestId: z.string().min(1),
        title: z.string().min(1),
        options: z
          .array(
            z.object({ optionId: z.string().min(1), name: z.string().min(1), kind: z.string() }).strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
    /**
     * 这段会话带的团队（team-board，7.22，学自 dsh-agent-teams）。**真相在磁盘**，这里是一份快照：
     * 成员、任务（含依赖、attempt、结果）、邮箱。缺省 = 这段会话没建过团队。
     */
    team: TeamSnapshotSchema.optional(),
    /**
     * 这段对话挂着的内核状态列表（笔记本，2026-08-26）。**一段普通对话可以同时挂
     * Python 与 R 两台**，各自的 starting/idle/busy/exited 由 `挂载.ts` 从内核事件里跟踪。
     *
     * **缺省 = 这段会话没有内核**（不是 native 会话，或还没起过内核）；
     * 不给一份空数组——空数组会被读成「起过、但一台都没有」，那不是实情。
     */
    kernels: z.array(KernelStateSchema).optional(),
  })
  .strict()
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>

/** 更新信封的公共字段 */
const envelope = {
  workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
  sessionId: z.string().min(1),
  /** 本次更新之后的 revision。**从 1 起**——0 是快照的初值，不会作为增量出现 */
  revision: z.int().min(1),
}

/**
 * 服务端推给界面的增量。
 *
 * `item` 是**按 id 覆盖**的：同一条 turn 在流式过程中会多次更新，
 * 界面按 id 替换即可，不必自己拼接增量。这比旧设计的「文本增量靠 turnId 归拢」
 * 少了一层客户端状态。
 */
export const SessionUpdateSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("item"), item: TranscriptItemSchema }).strict(),
  /**
   * **删掉一条 item**（审查 debug F3）。服务端有时会把一条已经推给订阅者的 item 摘掉——
   * 典型是「只想了一下、还没说话」的那条被并进了新的一条(events.ts `吸收只想没说的`)。
   * 没有这个事件时,实时流里那条孤立的思考还留在客户端,症状是作者报的「你出现了两次」。
   * 客户端收到它就按 id 把那条从转录里删掉;快照那一路本来就不含它,所以只补实时流这一条。
   */
  z.object({ ...envelope, type: z.literal("dropItem"), id: z.string().min(1) }).strict(),
  /**
   * 本会话的产物变了（2026-08-26）：某次工具调用新建了文件。
   * **只说「变了」，数据走 `listArtifacts`**——与 `dropItem` 同一纪律，事件里不塞清单。
   */
  z.object({ ...envelope, type: z.literal("artifactsChanged") }).strict(),
  z.object({ ...envelope, type: z.literal("bytes"), data: z.string() }).strict(),
  z
    .object({
      ...envelope,
      type: z.literal("state"),
      state: z.enum(["alive", "exited"]),
      exitCode: z.int().optional(),
    })
    .strict(),
  /**
   * 远端会话的**当前目录变了**（②-B · R4′）。
   *
   * 它走会话这条通道（有 `sessionId`，是这段对话自己的事）。
   * 必须推：模型 `cd` 之后头上那一条要立刻跟上，否则人看到的是上一个目录——
   * **而那正是「以为在 A 目录、其实在 B 目录」的来源**。
   */
  z.object({ ...envelope, type: z.literal("cwd"), cwd: z.string().min(1) }).strict(),
  /** 团队变了（team-board，7.22）：整份换掉——它给的就是整份新的，合并只会多一种「合错了」 */
  z.object({ ...envelope, type: z.literal("team"), team: TeamSnapshotSchema }).strict(),
  /**
   * 这段对话挂着的内核状态变了（笔记本，2026-08-26）：**整份换掉**，与 `team` 同一纪律——
   * 服务端给的就是当前完整的一份，合并只会多一种「合错了」。
   */
  z.object({ ...envelope, type: z.literal("kernels"), kernels: z.array(KernelStateSchema) }).strict(),
  /** 全量重放。客户端发现 revision 跳号后由服务端补发，或订阅时的首帧 */
  z.object({ ...envelope, type: z.literal("snapshot"), snapshot: SessionSnapshotSchema }).strict(),
])
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>

/**
 * 连接状态的推送（②-B · R3）。**独立于会话那条通道。**
 *
 * 一台服务器不属于任何会话——它可能一个会话都还没有，
 * 也可能同时托着好几个。塞进 `SessionUpdate` 就得给它编一个假的 `sessionId`，
 * 而**编出来的 id 迟早会被人当真**。
 *
 * 这条通道存在的理由只有一个：**断线必须自己出声**。
 * 靠界面轮询的话，从断开到被发现之间那段时间里，
 * 界面显示的是「连着」——**那是一个看起来很确定的谎**。
 */
export const RemoteUpdateSchema = z
  .object({
    workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
    connectionId: z.string().min(1),
    state: RemoteStateSchema,
  })
  .strict()
export type RemoteUpdate = z.infer<typeof RemoteUpdateSchema>

/**
 * 服务器名单里某条记录变了（远程内核，2026-09-03）。**同一条 IPC 通道，第三种载荷。**
 *
 * 与 `RemoteUpdate` 分开而不是给它加个可选字段：那条的语义是「这一台此刻连着没有」，
 * 而这条说的是「库里那行字被改了，去重拉一次名单」——**改它的人可能根本不是界面**
 * （`run_code` 在服务器上探到唯一一条解释器时会自己写进去）。
 * 混成一条的话，界面就得靠「哪个字段在」去猜是哪件事，而那是没有判据的。
 *
 * 载荷里**不带那条记录本身**：名单是后端说了算的东西，推一份可能已经过期的副本
 * 只会让屏上那份与库里那份分家。这条推送只是一句「去问一次」。
 */
export const RemoteListChangedSchema = z
  .object({
    workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
    remoteList: z.literal("changed"),
  })
  .strict()
export type RemoteListChanged = z.infer<typeof RemoteListChangedSchema>

/**
 * **这条发言等于没说话**（2026-08-12）。
 *
 * 模型「想一下就去调工具」会留下一条没有正文的发言。判断它的规则
 * 此前在两处各写了一份，而且**判据不一样**：
 * 事件中枢用 `!text`（空串才算），界面用 `!text.trim()`（空白也算）。
 *
 * 于是模型吐出一个换行时，两边打架：**中枢不合并、界面又把它画成一块孤零零
 * 的思考**——作者因此在一次回答里看到两个「0s 想了一下」。
 *
 * **藏在两个文件里的同一个判断，迟早有一个落后于另一个。** 所以它只有一份。
 */
export function 没说话(item: { type: string; text?: string | undefined; images?: readonly unknown[] | undefined }): boolean {
  // 只有图、没有字的那一句也是说了话（2026-08-23 审查抓的：此前在转录里隐形）
  return item.type === "turn" && !(item.text ?? "").trim() && !(item.images && item.images.length > 0)
}
