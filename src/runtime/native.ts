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
import { createSubagentTool } from "../subagent/tool.js"
import { RUN_AS_NODE } from "../subagent/protocol.js"
import type { CredentialStore } from "@earendil-works/pi-ai"
import type {
  AgentEvent,
  AgentRuntime,
  ContextUsage,
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
  /**
   * 子 agent 入口的可执行文件路径（`dist/electron/subagent-child.js`）。
   *
   * **给了才注册 `subagent` 工具。** 省略时模型看不到这个工具——
   * CLI 与单元测试走这一支。这不是开关，是**能力的前提**：
   * 没有那个文件就没有子进程可起，注册一个必然失败的工具比不注册更坏。
   */
  subagentChildEntry?: string
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
  /**
   * 此刻有几轮在飞。
   *
   * **不能用 `pending` 判断「正在说话」**——它是一条只增不清的链
   * （连发两轮时等待必须覆盖两轮，所以它 resolve 之后仍然是个真值）。
   * 2026-08-09 换模型的守卫就栽在这里：第一句话之后 `pending` 永远为真，
   * 于是**任何时候都换不了模型**，而界面只表现为"点了没反应"。
   */
  inFlight: number
  /**
   * 最近一条助手消息报的 token 用量。**provider 给的真数。**
   *
   * 取自助手消息而不是工具结果——后者的 `usage` 是工具自身的，
   * pi 的文档明说它 *"Not used for main LLM context accounting"*。
   */
  lastUsage: { input?: number; output?: number; cacheRead?: number } | undefined
  /** 已经报过的那条用量在 `messages` 里的下标。**按下标判重，不按数值** */
  usageIndexReported: number | undefined
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
  /**
   * 完整的一条消息。**助手消息上带 `usage`，那是模型真实的 token 用量**。
   *
   * **不要用 `AgentToolResult.usage`**——pi 的文档明写着
   * *"Usage from the final tool execution itself… **Not used for main LLM
   * context accounting**."* 计划里原本指的就是那一个，是错的。
   */
  message?: { role?: string; usage?: { input?: number; output?: number; cacheRead?: number } }
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

  /**
   * 丢掉缓存的 `ModelRuntime`，下次用时重新读 `models.json`（2026-08-10）。
   *
   * 用户在设置里改了某个 provider 的地址之后要用上新地址，
   * 而 `ModelRuntime` 在 create 那一刻就把目录读进去了。
   *
   * **已经在跑的会话不受影响**——它们手里是旧的那一份。
   * 这是诚实的：改地址不该把正在说话的会话半路改道。
   */
  resetModelCatalog(): void {
    this.modelRuntime = undefined
  }

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
              // **算不出来就不发。** 发一个空的 `filesWritten` 会让那条 Run
              // 说出「确认没改任何文件」，而实情是「不知道」——两者不得混为一谈
              // （`types.ts` 的 `tool_files` 注释：只在拿得到事实时发）
              if (facts) emit({ kind: "tool_files", sessionId, toolCallId, ...facts })
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

  /**
   * 内置工具 + `subagent`（①-B″ · S1）。
   *
   * **`subagent` 刻意不套授权门的包装器。** 那个包装器做两件事：过门、拍 git 快照。
   * 两件在这里都不对——
   *   - 门是**按工具名**判的，而子 agent 真正要管的是「它自己能用哪些工具」，
   *     那一层在子进程里（`tools` 白名单）。在父侧对 `subagent` 这个名字放行或拦下，
   *     管不到子进程里发生的事，**给的是一种虚假的安全感**。
   *   - 快照更明确地错：`subagent` 期间会有多个子进程并发改文件，
   *     父侧拍一个 before/after 只能得到「这一批一共改了什么」，
   *     而账本要的是**逐个子 agent**的事实。那属于阶段 ④ 的 worktree 隔离。
   *
   * 所以子 agent 的溯源**现在是缺的，而且是知情地缺的**——账本上有它的 Run，
   * 但那条 Run 没有 `files_written`。按不变式 5 的规矩，
   * **缺省读作「不知道」，这正是此刻的实情。**
   */
  private toolsFor(spec: SessionSpec, native: { provider: string; model: string }): unknown[] | undefined {
    const base = this.gatedTools(spec.workspace, spec.sessionId)
    const entry = this.opts.subagentChildEntry
    if (!entry) return base

    const tool = createSubagentTool({
      sessionId: spec.sessionId,
      projectRoot: spec.workspace,
      emit: (e) => this.emit(e),
      childOf: () => ({
        // Spike F：**不能写死 `"node"`**——打包之后用户机器上不一定有它
        command: process.execPath,
        args: [entry],
        env: { [RUN_AS_NODE]: "1" },
      }),
      context: {
        provider: native.provider,
        model: native.model,
        cwd: spec.workspace,
        ...(this.opts.modelsPath ? { modelsPath: this.opts.modelsPath } : {}),
        // 每个子任务一个 agentDir，**关在这个会话的目录里**（不变式 #11）
        agentDirOf: (i) => join(spec.sessionDir, "subagents", String(i)),
      },
    })

    // 门只包内置工具时 base 可能是 undefined；那时也要把 subagent 带上
    return [...(base ?? []), tool]
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
    const customTools = this.toolsFor(spec, native)
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
      inFlight: 0,
      lastUsage: undefined,
      usageIndexReported: undefined,
      sessionDir: spec.sessionDir,
      stuck: new StuckGuard(),
    })
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  /**
   * 从 pi 的**会话状态**里取最近一条带用量的条目（2026-08-10）。
   *
   * ## 为什么不是从事件里拿
   *
   * 这段代码此前写的是「助手消息事件上带 `usage`」——**那个形状不存在**。
   * 于是 `lastUsage` 一直是空的，上下文面板一直显示「已用尚未采集」，
   * 而覆盖它的那条 e2e 断言的是 `toContainText("12")`，
   * **匹配到的其实是上下文窗口 `128,000` 里的 `12`**，绿了将近一天。
   *
   * 真正的来源是 `session.state.messages[*].usage`（真链路探出来的，形如
   * `{input, output, cacheRead, cacheWrite, reasoning, totalTokens, cost}`）。
   *
   * @returns 最后一条带用量的条目的下标与值。**一条都没有就 undefined**
   */
  private latestUsage(
    sessionId: SessionId,
  ): { index: number; usage: { input?: number; output?: number; cacheRead?: number } } | undefined {
    const s = this.sessions.get(sessionId)
    /**
     * **一路都要防空。** 这里在每条事件上都会被调到，而事件可能早于
     * `session` 就位——`s?.session.state` 在 `session` 还没有时会直接抛，
     * 而这一抛会**打断整条事件流**，症状是回复再也不出现。
     * （2026-08-10 就是这么把「切会话不丢历史」弄红的。）
     */
    const state = s?.session?.state as { messages?: unknown[] } | undefined
    const msgs = (state?.messages ?? []) as Record<string, unknown>[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const u = msgs[i]?.["usage"] as
        | { input?: number; output?: number; cacheRead?: number }
        | undefined
      if (!u || typeof u !== "object") continue
      /**
       * **跳过全零的那些。** pi 的条目里有一部分是记账用的空壳
       * （`{input:0,output:0,…}`），取到它就会把「这一轮花了多少」
       * 报成 0——而 0 与「不知道」在界面上说的话完全不同，
       * 更何况这里真实答案并不是 0。
       */
      if ((u.input ?? 0) + (u.output ?? 0) === 0) continue
      return { index: i, usage: u }
    }
    return undefined
  }

  /**
   * 这一段用了多少 token，发一条事件。
   *
   * **按条目下标判重**：同一条用量不该在两次 `turn_end` 上各报一次
   * （pi 每次模型响应都发 `turn_end`，而没有新模型调用的那些不该重复计数）。
   * 数值判重不行——两次调用花一样多是完全可能的。
   */
  private emitUsageIfNew(sessionId: SessionId): void {
    const latest = this.latestUsage(sessionId)
    if (!latest) return
    const s = this.sessions.get(sessionId)
    if (!s || s.usageIndexReported === latest.index) return
    s.usageIndexReported = latest.index
    s.lastUsage = latest.usage
    /**
     * **只发我们声明过的那三个字段。**
     *
     * pi 给的对象还带着 `cacheWrite` / `reasoning` / `totalTokens` / `cost`，
     * 而协议里 `usage` 是 `.strict()` 的——原样转发会让中枢那边
     * `SessionUpdateSchema.parse` 抛出，**而那一抛会顺着 emit 窜回 pi 的
     * 事件循环，把后面的文本增量全掐掉**（2026-08-10 的回归就是这么来的：
     * 症状是「回复再也不出现」，看起来与用量毫无关系）。
     *
     * 挑字段而不是放宽 schema：**我们只声明我们真的理解的东西。**
     */
    const u = latest.usage
    this.emit({
      kind: "turn_usage",
      sessionId,
      usage: {
        ...(u.input !== undefined ? { input: u.input } : {}),
        ...(u.output !== undefined ? { output: u.output } : {}),
        ...(u.cacheRead !== undefined ? { cacheRead: u.cacheRead } : {}),
      },
    })
  }

  /** pi 的会话事件 → 本项目的 AgentEvent。**只翻译，不解释。** */
  private translate(sessionId: SessionId, e: PiEvent): void {
    /**
     * **每条事件都试着冲一次用量。**
     *
     * 用量落进 `session.state.messages` 的时机与 `turn_end` 的先后不固定
     * （实测：`turn_end` 先到，用量条目后落）。只在 `turn_end` 冲就会永远差一步。
     * 判重靠条目下标，所以重复调用的代价近似为零。
     */
    this.emitUsageIfNew(sessionId)

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
        this.emitUsageIfNew(sessionId)
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
    s.inFlight += 1
    // 记下这一轮，供 `waitForIdle` 等待。catch 就地挂上，所以它永不 reject
    const run = s.session
      .prompt(data)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
      })
      .finally(() => {
        s.inFlight -= 1
        /**
         * **成本：我们知道 token，不知道钱。**
         *
         * provider 报的是 token（`s.lastUsage`，上下文栏用的就是它），
         * **金额一处都没有**——要得到金额只能自己维护一张价目表再乘一遍，
         * 那是估算，而账本上的估算会被当成事实（不变式 5 禁止编造）。
         *
         * 所以如实说「不可见 + 为什么」，而不是让成本栏永远停在
         * 「尚未记录」——那句话是错的：**我们记了，只是记不到钱。**
         */
        this.emit({
          kind: "cost",
          sessionId,
          cost: { visible: false, reason: "该 provider 只报 token，不报金额；token 用量见上下文栏" },
        })
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
   * 上下文用量（①-B″ · U3）。
   *
   * ## 只报能精确量的，不估算
   *
   * `pi-ai` 里**没有 tokenizer**。字节数可以精确量，token 不能——
   * 把字节占比乘上一个 token 总数假装成分解，就是编造，
   * 而**分解不准比不分解更坏：它会让人据此做错决定**。
   *
   * 所以这里回两样各自为真的东西：
   *   - `contextWindow`：模型自带的上限，**真数**
   *   - `bytes`：系统提示词 / 工具 schema / 对话历史三档的**字节数，不是 token**
   *
   * `usedTokens` 来自 provider 报的真 usage（`s.lastUsage`，见 `translate`）。
   * **拿不到就不给这个字段**，界面显示「尚未采集」，不拿字节去凑。
   *
   * （这段注释一度写着「usage 目前一处都没采集」，而同一个文件下面就在采——
   * 那是接线之前留下的，2026-08-10 随成本接线一并更正。）
   */
  contextUsage(sessionId: SessionId): ContextUsage | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) return undefined
    const st = s.session.state as {
      systemPrompt?: string
      tools?: unknown[]
      messages?: unknown[]
      model?: { contextWindow?: number; id?: string }
    }
    const size = (v: unknown): number =>
      v === undefined ? 0 : Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v), "utf8")
    return {
      // `exactOptionalPropertyTypes`：**缺省与「值为 undefined」不是一回事**，
      // 所以拿不到就不给这个字段，而不是给一个 undefined
      ...(st.model?.id ? { model: st.model.id } : {}),
      ...(st.model?.contextWindow ? { contextWindow: st.model.contextWindow } : {}),
      // **真 token，来自 provider。** 缺就不给这个字段——
      // 界面据此显示「尚未采集」，而不是显示 0
      // **从会话状态取**，不读那个从来没被填上的 `lastUsage` 缓存
      ...(( ) => {
        const u = this.latestUsage(sessionId)?.usage
        return u?.input !== undefined ? { usedTokens: u.input + (u.cacheRead ?? 0) } : {}
      })(),
      bytes: {
        system: size(st.systemPrompt),
        tools: size(st.tools),
        history: size(st.messages),
      },
    }
  }

  /**
   * 该 provider 在 pi 的模型目录里**真正有哪些模型**（①-B″ · U2）。
   *
   * **与 `getProviders` 的 `providers[].models` 不是一回事**：那一份是
   * 「providers.yaml 里声明过的 agent 各自用了哪个模型」，为凭证界面设计的。
   * 模型选择器要问的是这一份——**两者语义不同，合并会让两边都说不清**。
   *
   * 认不出 provider 时返回空数组：**「不知道」由调用方决定怎么表达**，
   * 这一层不该替它编一个默认值。
   */
  async availableModels(provider: string): Promise<string[]> {
    const rt = await this.runtime()
    return rt
      .getModels()
      .filter((m) => m.provider === provider)
      .map((m) => m.id)
  }

  /**
   * pi 认识的全部 provider（2026-08-10）。
   *
   * 作者：*「配置里面目前只有一个 deepseek，pi-ai 里面不是可以兼容很多吗？
   * 应该都加进去。」* 此前凭证界面只列 `providers.yaml` 里声明过的那几个——
   * **那是「我配过谁」，不是「我能配谁」**，两者差着 38 个。
   *
   * **来源是 pi 的模型目录，不是一份我手打的清单。**
   * 手打的清单会在 pi 更新目录的第二天就开始撒谎，而且没有人会发现——
   * 界面上少一个 provider 不报错，它只是**不存在**。
   */
  async knownProviders(): Promise<string[]> {
    const rt = await this.runtime()
    return [...new Set(rt.getModels().map((m) => m.provider))].sort()
  }

  /**
   * 地址 pi 不自带的那几个 provider（2026-08-10）。
   *
   * 实测 40 个里有 8 个：Bedrock / Azure / Vertex / Cloudflare×2 /
   * opencode×2 / radius——它们跟账号、区域、项目走，pi 没法替你填。
   * **界面据此给输入框**；不给的话，填了 key 也连不上而没人知道为什么。
   */
  async providersNeedingBaseUrl(): Promise<string[]> {
    const rt = await this.runtime()
    const provs = (rt as unknown as { getProviders?: () => unknown }).getProviders?.()
    if (!provs) return []
    const list: Record<string, unknown>[] = Array.isArray(provs)
      ? (provs as Record<string, unknown>[])
      : Object.entries(provs as Record<string, Record<string, unknown>>).map(([id, v]) => ({
          id,
          ...v,
        }))
    return list
      .filter((p) => !p["baseUrl"])
      .map((p) => String(p["id"] ?? p["name"] ?? ""))
      .filter(Boolean)
      .sort()
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
    if (s.inFlight > 0) {
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
