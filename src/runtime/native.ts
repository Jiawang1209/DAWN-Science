/**
 * Native 运行时：坐 pi 第三层 `createAgentSession()`。
 *
 * **2026-08-08 返工 R2 整体重写。**
 *
 * 旧实现坐在第二层最底下——裸 `Agent` + 手搓 `createProvider({baseUrl, api: openAICompletionsApi()})`
 * + **`tools: []`**。后果三条，每一条都是真实缺陷：
 *   1. **agent 一个工具都没有**，读不了文件也跑不了命令
 *   2. 写死 openai-completions，**anthropic / google 的原生 API 走不通**
 *   3. 模型目录要用户手写进 providers.yaml
 *
 * 现在：provider 与模型目录来自 pi-ai（39 个内置），工具、harness、压缩、skills
 * 来自 pi-agent-core，装配由 pi-coding-agent 的 `createAgentSession()` 完成。
 * 调用签名见 `spikes/FINDINGS.md` 的 Spike A-2 一节。
 *
 * **本文件的职责因此变得很窄**：把 pi 的会话事件翻译成本项目的 `AgentEvent`，
 * 以及把每个会话隔离在自己的 agentDir 里。
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  createAgentSession,
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent"
import type { CredentialStore } from "@earendil-works/pi-ai"
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "./types.js"

/** 工具结果正文的截断长度。完整内容留在 pi 的会话记录里，事件流只带摘要 */
const RESULT_PREVIEW_CHARS = 2000

/**
 * 工具授权门。返回字符串即**拒绝执行**，字符串是给模型看的理由。
 *
 * 挂在这里而不是 pi 的扩展系统，理由见 FINDINGS 的 Spike A-2 · Q5：
 * 扩展只能从 `<agentDir>/extensions/*.ts` 加载并靠 jiti 运行时转译，
 * **打包进 Electron 后是否还通无法先验断言，而授权门静默失效比没有还危险**。
 * 包装工具定义则不碰文件系统与转译器。
 */
export type ToolGate = (toolName: string, params: Record<string, unknown>) => string | undefined

export interface NativeRuntimeOptions {
  /**
   * 按 provider 取凭证。**必须带缓存**——见下方 `ModelRuntime` 的注释。
   *
   * **省略时交给 pi 自己解析**：它会读 `~/.pi/auth.json`，并经 `getEnvApiKey()`
   * 认 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` 这类既有环境变量。
   * 桌面版注入自己的实现（safeStorage），CLI 走默认即可。
   */
  credentials?: CredentialStore
  /** 模型目录缓存的落点。省略则只在内存里 */
  modelsPath?: string
  /** 可选的授权门。给出时内置工具被替换为包装过的版本 */
  gate?: ToolGate
}

interface NativeSession {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"]
  unsubscribe: () => void
  pid: number
}

/** pi 的会话事件（结构化程度足够，但类型不从包里导出，故在此收窄） */
interface PiEvent {
  type?: string
  toolCallId?: string
  toolName?: string
  args?: unknown
  input?: unknown
  result?: { isError?: boolean; content?: { type?: string; text?: string }[] }
  assistantMessageEvent?: { type?: string; delta?: string }
  errorMessage?: string
}

export class NativeRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, NativeSession>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /**
   * native 会话不对应真实进程，pid 是合成的序号，只为满足 `SessionHandle` 契约
   * 与会话表的 `pid` 列。**它不可用于 `process.kill`**，与 PtyRuntime 的 pid 语义不同。
   */
  private nextPid = 1
  /**
   * **全进程共享一个 ModelRuntime。**
   *
   * Spike A-2 实测：单次会话里 pi 会调用 `credentials.read()` **202 次**——
   * 它遍历全部 39 个内置 provider 探测可用性，且不止一轮。
   * 每个会话各建一个 ModelRuntime 就会把这个代价乘以会话数。
   */
  private modelRuntime: Promise<ModelRuntime> | undefined

  constructor(private readonly opts: NativeRuntimeOptions = {}) {}

  private runtime(): Promise<ModelRuntime> {
    this.modelRuntime ??= ModelRuntime.create({
      ...(this.opts.credentials ? { credentials: this.opts.credentials } : {}),
      // 显式给 null 表示不落盘；给路径则由 pi 缓存远端模型目录
      modelsPath: this.opts.modelsPath ?? null,
    })
    return this.modelRuntime
  }

  /**
   * 等当前回合跑完。
   *
   * CLI 的管道模式需要它：`echo ... | dawn run` 在 stdin EOF 时要收摊，
   * 但**不能在模型还没答完时就切断**。`write()` 刻意不 await（见其注释），
   * 所以「跑完了没有」必须另有一问。
   */
  async waitForIdle(sessionId: SessionId): Promise<void> {
    await this.sessions.get(sessionId)?.session.waitForIdle()
  }

  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  /** 把 pi 的工具定义套上授权门。不给 gate 时返回 undefined，走 pi 的内置工具。 */
  private gatedTools(cwd: string): unknown[] | undefined {
    const gate = this.opts.gate
    if (!gate) return undefined
    const wrap = (definition: Record<string, unknown>) => {
      const original = (definition.execute as (...a: unknown[]) => Promise<unknown>).bind(definition)
      const name = String(definition.name)
      return {
        ...definition,
        async execute(
          toolCallId: string,
          params: Record<string, unknown>,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) {
          const reason = gate(name, params)
          if (reason !== undefined) {
            // **回一条 isError 结果，不要抛异常**——抛异常会中断整轮，
            // 模型学不到「这条被拒了」。Spike A-2 实测确认。
            return { content: [{ type: "text", text: reason }], isError: true, details: undefined }
          }
          return original(toolCallId, params, signal, onUpdate, ctx)
        },
      }
    }
    return [
      wrap(createReadToolDefinition(cwd) as unknown as Record<string, unknown>),
      wrap(createBashToolDefinition(cwd) as unknown as Record<string, unknown>),
      wrap(createEditToolDefinition(cwd) as unknown as Record<string, unknown>),
      wrap(createWriteToolDefinition(cwd) as unknown as Record<string, unknown>),
    ]
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const native = spec.native
    if (!native) {
      throw new Error(`native 运行时需要 provider 与 model，会话 "${spec.sessionId}" 未提供`)
    }

    const modelRuntime = await this.runtime()
    const model = modelRuntime.getModel(native.provider, native.model)
    if (!model) {
      // 无静默回退：模型不在 pi 的目录里就立即失败，并说清它有哪些
      const available = modelRuntime
        .getModels()
        .filter((m) => m.provider === native.provider)
        .map((m) => m.id)
      throw new Error(
        `provider "${native.provider}" 没有模型 "${native.model}"。` +
          `该 provider 可用的模型：${available.join(", ") || "(空——可能是模型目录尚未同步)"}`,
      )
    }

    // per-session agentDir：会话的设置、记录、扩展全部隔离在自己的目录里，
    // **绝不落到用户的 ~/.pi**（不变式 #11，Spike B 的教训）
    const agentDir = join(spec.sessionDir, "pi")
    mkdirSync(agentDir, { recursive: true })

    const customTools = this.gatedTools(spec.workspace)
    const { session } = await createAgentSession({
      cwd: spec.workspace,
      agentDir,
      model,
      modelRuntime,
      // 有门时必须关掉内置工具，**否则模型会绕过门去用原始的 bash**（Spike A-2 实测）
      ...(customTools ? { noTools: "builtin" as const, customTools: customTools as never } : {}),
    })

    const unsubscribe = session.subscribe((raw) => this.translate(spec.sessionId, raw as PiEvent))

    const pid = this.nextPid++
    this.sessions.set(spec.sessionId, { session, unsubscribe, pid })
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  /** pi 的会话事件 → 本项目的 AgentEvent。**只翻译，不解释。** */
  private translate(sessionId: SessionId, e: PiEvent): void {
    switch (e.type) {
      case "message_update":
        if (e.assistantMessageEvent?.type === "text_delta") {
          this.emit({ kind: "output", sessionId, data: e.assistantMessageEvent.delta ?? "" })
        }
        return
      case "tool_execution_start":
        this.emit({
          kind: "tool_start",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName: String(e.toolName ?? "?"),
          input: e.args ?? e.input,
        })
        return
      case "tool_execution_end": {
        const content = e.result?.content ?? []
        this.emit({
          kind: "tool_end",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName: String(e.toolName ?? "?"),
          isError: Boolean(e.result?.isError),
          text: content.map((c) => c.text ?? "").join("").slice(0, RESULT_PREVIEW_CHARS),
        })
        return
      }
      case "turn_end":
        this.emit({ kind: "turn_end", sessionId })
        return
      case "error":
        // 失败必须出声：转成一条 output 送到界面，而不是静默吞掉（规格 7.5）
        if (e.errorMessage) {
          this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${e.errorMessage}\n` })
        }
        return
      default:
        return
    }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) {
      set = new Set()
      this.sinks.set(sessionId, set)
    }
    const target = set
    target.add(sink)
    return () => {
      target.delete(sink)
    }
  }

  /**
   * 送一轮 prompt。
   *
   * **不 await**：`prompt()` 要跑完一整轮才 resolve，而本方法的契约（`AgentRuntime.write`）
   * 是同步的——调用方是租约守卫，它只负责「准不准写」，不该被一轮对话阻塞。
   * 失败经事件流出声，不静默吞。
   */
  write(sessionId: SessionId, data: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    void s.session.prompt(data).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
    })
  }

  async stop(sessionId: SessionId): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    // 先中止在跑的一轮，再退订，最后释放——顺序反了会在 dispose 之后收到事件
    await s.session.abort().catch(() => {})
    s.unsubscribe()
    s.session.dispose()
    this.sessions.delete(sessionId)
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
  }
}
