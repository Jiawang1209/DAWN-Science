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

/** 一条对话发言。native 会话由 pi 的文本增量累积而成 */
const TurnItem = z
  .object({
    type: z.literal("turn"),
    id: z.string().min(1),
    who: z.enum(["user", "agent"]),
    text: z.string(),
    /** 这一轮说完了没有。未完时界面可显示还在输入 */
    final: z.boolean(),
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

export const TranscriptItemSchema = z.discriminatedUnion("type", [
  TurnItem,
  ToolItem,
  NoticeItem,
  SubagentsItem,
  KernelOutputItem,
])
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>

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
  z.object({ ...envelope, type: z.literal("bytes"), data: z.string() }).strict(),
  z
    .object({
      ...envelope,
      type: z.literal("state"),
      state: z.enum(["alive", "exited"]),
      exitCode: z.int().optional(),
    })
    .strict(),
  /** 全量重放。客户端发现 revision 跳号后由服务端补发，或订阅时的首帧 */
  z.object({ ...envelope, type: z.literal("snapshot"), snapshot: SessionSnapshotSchema }).strict(),
])
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>
