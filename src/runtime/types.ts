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
      /** 结果正文（已截断）。完整结果留在 pi 的会话记录里 */
      text: string
    }
  | { kind: "exited"; sessionId: SessionId; exitCode: number }

export type EventSink = (event: AgentEvent) => void

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
  /** 插一句引导，不打断整轮。只有 native 有 */
  steer?(sessionId: SessionId, text: string): Promise<void>
  resize?(sessionId: SessionId, cols: number, rows: number): void
  stop(sessionId: SessionId): Promise<void>
}
