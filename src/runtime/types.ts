/**
 * AgentRuntime 的接口契约（Task 1.4）。
 *
 * **责任边界**：`runtime/*` 只管「怎么跟一个 agent 进程说话」——起、写、读、停。
 * 它不知道会话生命周期、不知道租约、不知道持久化，那些是 `session/*` 的事。
 * 两者只通过本文件相接。
 *
 * 三种实现共用这一套：
 *   native —— 进程内跑 pi 的 agentLoop（Spike A 确认可行）
 *   pty    —— node-pty 起外部 CLI（Spike B 确认可行）
 *   fake   —— 测试替身，不起任何进程
 */
export type SessionId = string

export interface McpServerSpec {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
}

export interface SessionSpec {
  sessionId: SessionId
  workspace: string
  /** per-session 隔离配置目录，绝不使用用户全局配置 */
  sessionDir: string
  /**
   * 仅 native runtime 使用：pi 的 provider id 与 model id。
   *
   * **2026-08-08 返工 R2**：原来是 `{ baseUrl, apiKey, model }`——那要求上层
   * 自己知道服务地址并持有凭证，是自建 provider 抽象的残留。
   * 现在只说「哪个 provider 的哪个模型」，连接与凭证解析都交给 pi。
   */
  native?: { provider: string; model: string }
  /** 注入给该会话的 MCP server（阶段③ 才会非空） */
  mcpServers?: McpServerSpec[]
}

export interface SessionHandle {
  sessionId: SessionId
  pid: number
}

export type AgentEvent =
  | { kind: "started"; sessionId: SessionId; pid: number }
  | { kind: "output"; sessionId: SessionId; data: string }
  /**
   * agent 说完了一轮。**只有 native 会发**——PTY 是字节流，没有轮次概念。
   *
   * 2026-08-08 新增。此前 native 在 `turn_end` 时发一条 `data: "\n"` 的 output
   * 来表示轮次结束，但**那和正文里的换行完全无法区分**——上层要据此切分
   * 对话气泡时只能猜。轮次边界是语义，不能编码进正文。
   */
  | { kind: "turn_end"; sessionId: SessionId }
  /**
   * 系统提示。**既不是对话也不是工具**——混进 turn 会污染对话记录。
   *
   * 协议里 `NoticeItem` 一直存在，但在此之前**没有任何东西能产出它**。
   * 卡死守卫是第一个真实的用例：中断必须带原因出声（规格 7.5）。
   */
  | { kind: "notice"; sessionId: SessionId; text: string }
  /**
   * 一次工具调用的**文件事实**（不变式 5：从 git 事实算，不听 agent 声明）。
   *
   * 在 `tool_end` **之前**到达——它由工具包装器在真正执行完之后立刻算出，
   * 而 pi 的 end 事件还要再走一圈。账本据此更新那条仍然开着的 tool_call Run。
   *
   * **只在拿得到事实时发**。非 git 仓库、只读工具一律不发，
   * 那条 Run 上于是没有这个字段——「不知道」与「没改」是两回事。
   */
  | {
      kind: "tool_files"
      sessionId: SessionId
      toolCallId: string
      filesWritten: string[]
      filesRead: string[]
      mayIncludeUserEdits: boolean
    }
  /**
   * **一整轮真正结束**（用户发话 → 若干次模型响应与工具执行 → 收工）。
   *
   * 与 `turn_end` 不是一回事，这是 2026-08-09 真机实测才看清的：
   * **pi 在每次模型响应后都发一次 `turn_end`**——877 次工具调用对应 877 次
   * `turn_end`。它的语义是「这一段模型输出说完了」，不是「这一轮干完了」。
   *
   * 真正的边界是 `prompt()` 的 promise resolve。搞混这两者会让
   * 「一轮里的第二次工具调用」变成没有父账的孤儿。
   */
  | { kind: "idle"; sessionId: SessionId }
  /**
   * 会话换了模型（①-B″ · U2）。
   *
   * **pi 自己把它记成会话记录里的一等条目**（`{"type":"model_change",...}`，
   * Spike E 实测），我们这里同样让它成为事件而不是让界面自己记一份——
   * 换模型可能来自界面、命令面板、将来的 CLI，**只有事件能让三处保持一致**。
   */
  | { kind: "model"; sessionId: SessionId; provider: string; model: string }
  /**
   * agent 正在用一个工具。**只有 native 会发**——PTY 里工具调用发生在
   * 我们看不见的进程内部（规格 7.33 的可见性分级：PTY 的 `provenanceComplete` 为 false）。
   *
   * 2026-08-08 新增。①-B 的界面「看不见 agent 在干什么」，根因之一就是
   * runtime 层只转发了文本增量，工具调用整个被丢掉了。
   */
  | { kind: "tool_start"; sessionId: SessionId; toolCallId: string; toolName: string; input: unknown }
  | {
      kind: "tool_end"
      sessionId: SessionId
      toolCallId: string
      toolName: string
      isError: boolean
      /** 结果正文（可能已截断）。截断时形如「头 + 说明 + 尾」 */
      text: string
      /** 被截断了。**必须出声**（规格 7.5） */
      truncated: boolean
      /** **原始**字节数，不是截断后的 */
      bytes: number
      /** 全文落盘位置。写盘失败时缺省 */
      fullOutputPath?: string
    }
  | { kind: "exited"; sessionId: SessionId; exitCode: number }

export type EventSink = (event: AgentEvent) => void

/**
 * 上下文用量（①-B″ · U3）。**每个字段各自为真，缺的就缺着。**
 *
 * `bytes` 是**字节，不是 token**——`pi-ai` 没有 tokenizer，
 * 拿字节占比去凑一个 token 分解就是编造。
 */
export interface ContextUsage {
  model?: string
  /** 模型自带的上下文上限（token）。**真数** */
  contextWindow?: number
  /** 三档内容的字节数。**不是 token** */
  bytes: { system: number; tools: number; history: number }
}

export interface AgentRuntime {
  start(spec: SessionSpec): Promise<SessionHandle>
  /** 注册观察者。可多个，互不影响。返回退订函数。 */
  attach(sessionId: SessionId, sink: EventSink): () => void
  write(sessionId: SessionId, data: string): void
  /**
   * 中止当前回合。**只有 native 有**——PTY 的中止是往终端送 Ctrl-C，
   * 那是 `write` 的事，语义完全不同，不该挤进同一个方法。
   */
  abort?(sessionId: SessionId): Promise<void>
  /**
   * 会话中途换模型。**只有 native 有**（①-B″ · U2，能力由 Spike E 验过）。
   *
   * 「正在说话时不许换」这道门开在实现里而不是调用点：
   * 界面、命令面板、将来的 CLI 共用同一道，加入口时不必记得补一次。
   */
  setModel?(sessionId: SessionId, provider: string, model: string): Promise<void>
  /** 上下文用量。只有 native 有；拿不到时返回 undefined（**缺就是缺**） */
  contextUsage?(sessionId: SessionId): ContextUsage | undefined
  /** 插一句引导，不打断整轮。只有 native 有 */
  steer?(sessionId: SessionId, text: string): Promise<void>
  resize?(sessionId: SessionId, cols: number, rows: number): void
  stop(sessionId: SessionId): Promise<void>
}
