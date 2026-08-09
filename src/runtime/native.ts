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
import { StuckGuard, type GuardedCall } from "./stuck-guard.js"
import { budgetToolResult } from "./tool-output.js"
import { ProvenanceProbe } from "./provenance.js"
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
  /**
   * 记录每次工具调用改了哪些文件（不变式 5）。
   *
   * **默认开**：它是防幻觉的地基，关掉等于放弃「产出从 git 事实算」。
   * 只在明确不需要时置 false（例如纯对话的性能测试）。
   */
  provenance?: boolean
}

interface NativeSession {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"]
  unsubscribe: () => void
  pid: number
  /**
   * 最近一次 `prompt()` 的 promise（已挂 catch，永不 reject）。
   *
   * **`waitForIdle` 必须先等它。** pi 自己的 `session.waitForIdle()` 判的是
   * 「此刻有没有在跑」，而 `write()` 刻意不 await `prompt()`——于是在 prompt
   * 真正开始之前的那一小段时间里，pi 认为自己是空闲的，`waitForIdle()` 立刻返回。
   */
  pending: Promise<void> | undefined
  /** 该会话的隔离目录。工具输出的全文写在它下面 */
  sessionDir: string
  /**
   * 卡死守卫。**每会话一个**——两个会话各自打转，互不相干。
   * pi 自己不管这件事，模型退化时会一路烧到迭代上限。
   */
  stuck: StuckGuard
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
    const s = this.sessions.get(sessionId)
    if (!s) return
    // **顺序要紧。** 先等我们自己发出去的那一轮——见 `NativeSession.pending` 的注释：
    // prompt 还没开始时 pi 认为自己空闲，只问它会立刻拿到「已空闲」。
    // 2026-08-09 由 R5 的真链路测试抓到：`waitForIdle` 在 0 个请求、1 个事件时就返回了。
    await s.pending
    await s.session.waitForIdle()
  }

  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  /** 把 pi 的工具定义套上授权门。不给 gate 时返回 undefined，走 pi 的内置工具。 */
  private gatedTools(cwd: string, sessionId: SessionId): unknown[] | undefined {
    const gate = this.opts.gate
    const provenance = this.opts.provenance !== false
    // 两样都不要就别包——包装本身也有成本
    if (!gate && !provenance) return undefined
    const probe = provenance ? new ProvenanceProbe(cwd) : undefined
    const emit = (e: AgentEvent) => this.emit(e)
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
          if (gate) {
            const reason = gate(name, params)
            if (reason !== undefined) {
              // **回一条 isError 结果，不要抛异常**——抛异常会中断整轮，
              // 模型学不到「这条被拒了」。Spike A-2 实测确认。
              return { content: [{ type: "text", text: reason }], isError: true, details: undefined }
            }
          }
          // **before 快照必须在真正执行之前完成**，所以要 await。
          // 这正是 Spike A-2 选「包装工具定义」而非 pi 文件扩展的原因之一：
          // 包装器天然是同步点，而普通事件订阅不阻塞
          const handle = await probe?.begin(name)
          try {
            return await original(toolCallId, params, signal, onUpdate, ctx)
          } finally {
            if (handle) {
              const facts = await handle.finish()
              emit({ kind: "tool_files", sessionId, toolCallId, ...facts })
            }
          }
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

    const model = await this.resolveModel(native.provider, native.model)

    // per-session agentDir：会话的设置、记录、扩展全部隔离在自己的目录里，
    /**
     * **绝不落到用户的 ~/.pi**（不变式 #11，Spike B 的教训）。
     *
     * **每会话一个 agentDir，这一点后来又多了一条理由**（Spike E，2026-08-09）：
     * pi 的 `session.setModel()` 会把选择写成 agentDir 级的默认值
     * （`agentDir/settings.json` 里的 `defaultProvider` / `defaultModel`）。
     * 两个会话共用一个 agentDir 的话，**在 A 里换模型就会改掉 B 的默认值**——
     * 正是「一个会话的东西渗进另一个」。
     *
     * 现在它被关在会话里。**要把 agentDir 提到项目级或全局之前，先想清楚这一条。**
     */
    const agentDir = join(spec.sessionDir, "pi")
    mkdirSync(agentDir, { recursive: true })

    const modelRuntime = await this.runtime()
    const customTools = this.gatedTools(spec.workspace, spec.sessionId)
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
    this.sessions.set(spec.sessionId, {
      session,
      unsubscribe,
      pid,
      pending: undefined,
      sessionDir: spec.sessionDir,
      stuck: new StuckGuard(),
    })
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
      case "tool_execution_start": {
        const toolName = String(e.toolName ?? "?")
        const input = e.args ?? e.input
        this.emit({
          kind: "tool_start",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName,
          input,
        })
        // **先发事件再判定**：这次调用真的发生了，界面上就该看得见它，
        // 哪怕它正是压垮骆驼的那一根
        this.guardAgainstStuckLoop(sessionId, [{ name: toolName, input }])
        return
      }
      case "tool_execution_end": {
        const content = e.result?.content ?? []
        const toolName = String(e.toolName ?? "?")
        const full = content.map((c) => c.text ?? "").join("")
        // **此前这里是 `.slice(0, 2000)`：硬砍、不出声、不留路径。**
        // 现在全文写盘、摘要进事件流、字节数如实上报（规格 7.5）
        const sessionDir = this.sessions.get(sessionId)?.sessionDir
        const out = sessionDir
          ? budgetToolResult(full, { sessionDir, toolName })
          : { text: full, truncated: false, bytes: Buffer.byteLength(full, "utf8") }
        this.emit({
          kind: "tool_end",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName,
          isError: Boolean(e.result?.isError),
          text: out.text,
          truncated: out.truncated,
          bytes: out.bytes,
          ...(out.fullOutputPath ? { fullOutputPath: out.fullOutputPath } : {}),
        })
        return
      }
      case "turn_end":
        // **不在这里重置守卫。** pi 每次模型响应后都发一次 turn_end，
        // 在这里重置等于每次工具调用后清零——守卫永远数不到阈值。
        // 实测：877 次工具调用 = 877 次 turn_end，守卫一次都没触发
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
    // 新的一轮开始：上一轮的重复不该算到这一轮头上
    s.stuck.reset()
    // 记下这一轮，供 `waitForIdle` 等待。catch 就地挂上，所以它永不 reject
    const run = s.session
      .prompt(data)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
      })
      .finally(() => {
        // **一整轮真正结束。** 这是唯一可靠的边界——见 AgentEvent.idle 的说明
        this.emit({ kind: "idle", sessionId })
      })
    // 串起来而不是覆盖：连发两轮时，等待必须覆盖两轮，不能只等最后一轮
    s.pending = s.pending ? s.pending.then(() => run) : run
    void s.pending
  }

  /**
   * 卡死判定。触发则**先出声再中止**。
   *
   * 顺序要紧：静默中止会让用户看到一个突然停下的会话且不知道为什么——
   * 那比继续烧钱更难排查（规格 7.5）。
   */
  private guardAgainstStuckLoop(sessionId: SessionId, calls: GuardedCall[]): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    const reason = s.stuck.check(calls)
    if (!reason) return
    s.stuck.reset()
    this.emit({ kind: "notice", sessionId, text: reason })
    void this.abort(sessionId).catch(() => {
      // 中止失败也不能再吞——但此刻原因已经发出去了，用户至少知道发生了什么
    })
  }

  /** 中止当前回合。会话仍然活着，可以继续对话 */
  /**
   * 把 provider + model 名解析成 pi 的 Model 对象。
   *
   * **无静默回退**：不在 pi 的目录里就立即失败，并说清该 provider 有哪些。
   * `start()` 与 `setModel()` 共用它——两处各写一份错误信息，
   * 迟早会有一处说得比另一处含糊。
   */
  private async resolveModel(provider: string, modelId: string) {
    const modelRuntime = await this.runtime()
    const model = modelRuntime.getModel(provider, modelId)
    if (model) return model

    const all = modelRuntime.getModels()
    const known = all.filter((m) => m.provider === provider)
    if (known.length === 0) {
      const providers = [...new Set(all.map((m) => m.provider))]
      throw new Error(
        `没有 provider "${provider}"。已知的：${providers.join(", ") || "(空——模型目录尚未同步)"}`,
      )
    }
    throw new Error(
      `provider "${provider}" 没有模型 "${modelId}"。` +
        `该 provider 可用的模型：${known.map((m) => m.id).join(", ")}`,
    )
  }

  /**
   * 会话中途换模型（①-B″ · U2）。
   *
   * **能力由 Spike E 在真链路上验过**：`flash → deep`，且下一次请求确实打到新模型
   * （从假后端记下的请求体证明，不是"调用没抛异常"）。
   *
   * ## 「正在说话时不许换」这道门为什么在这一层
   *
   * Spike E 查出 `session.isStreaming` **在 prompt 真正开始之前是 `false`**——
   * 与本项目早先在 `waitForIdle` 上栽的是同一件事。所以判断依据是
   * **运行时自己跟踪的 `pending`**，不是问 pi。
   *
   * 而且门开在这里，界面、CLI、命令面板三个入口共用同一道——
   * 放到界面里就意味着每加一个入口要记得补一次。
   *
   * ## 没配凭证时的错误要翻成人话
   *
   * pi 抛的是 `No API key for <provider>/<model>`（Spike E 实测）。
   * 原样丢给用户等于让他自己猜下一步该干什么。
   */
  async setModel(sessionId: SessionId, provider: string, modelId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动，无法换模型`)
    if (s.pending) {
      throw new Error("这一轮还没说完。等它结束或先中止，再换模型")
    }

    const model = await this.resolveModel(provider, modelId)
    try {
      await s.session.setModel(model)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/no api key/i.test(msg)) {
        throw new Error(`provider "${provider}" 还没有配置 API key——在「设置」里填好之后再换`)
      }
      throw e
    }
    this.emit({ kind: "model", sessionId, provider, model: modelId })
  }

  async abort(sessionId: SessionId): Promise<void> {
    await this.sessions.get(sessionId)?.session.abort()
  }

  /**
   * 插一句引导，不打断整轮。
   *
   * 与 `write` 的区别：后者是「说完了，该你了」，前者是「你继续，但注意这个」。
   */
  async steer(sessionId: SessionId, text: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    await s.session.steer(text)
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
