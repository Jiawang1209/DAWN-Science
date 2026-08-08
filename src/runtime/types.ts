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
  /** 仅 native runtime 使用 */
  endpoint?: { baseUrl: string; apiKey: string; model: string }
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
  | { kind: "exited"; sessionId: SessionId; exitCode: number }

export type EventSink = (event: AgentEvent) => void

export interface AgentRuntime {
  start(spec: SessionSpec): Promise<SessionHandle>
  /** 注册观察者。可多个，互不影响。返回退订函数。 */
  attach(sessionId: SessionId, sink: EventSink): () => void
  write(sessionId: SessionId, data: string): void
  resize?(sessionId: SessionId, cols: number, rows: number): void
  stop(sessionId: SessionId): Promise<void>
}
