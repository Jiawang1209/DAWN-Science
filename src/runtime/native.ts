/**
 * Native 运行时：pi 的 agent loop 适配器（Task 1.10）。
 *
 * 用 `pi-agent-core` 的 `Agent` + `pi-ai` 的 provider 层，让任意 OpenAI 兼容端点
 * （DeepSeek 等）获得完整的工具使用能力。
 *
 * **Spike A 已确认三件事**，因此这里不需要额外的兜底层：
 *   1. 自定义工具可注入，模型能看到并调用
 *   2. **schema 由引擎强制且失败会自动重试**——非法参数根本到不了 handler，
 *      故本文件**不需要**计划 Step 3 提到的「zod 校验 + 重试」补丁
 *   3. 事件流、token 用量、工具调用记录齐全
 *
 * 与 pi 内置 `deepseekProvider()` 的区别：那个从环境变量读 key、且 baseUrl 写死。
 * 本项目的 `SessionSpec.endpoint` 携带显式 baseUrl / apiKey / model
 * （来自 providers.yaml，已由 config/loader 展开 `${ENV}`），
 * 所以走通用的 `createProvider` 路径，靠自定义 `auth.resolve()` 注入那把 key。
 */
import { Agent } from "@earendil-works/pi-agent-core"
import { createModels, createProvider, type Api, type Model } from "@earendil-works/pi-ai"
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy"
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "./types.js"

const DEFAULT_SYSTEM_PROMPT =
  "你是 DAWN Science 工作台里的一个 agent。回答简洁准确，需要时使用提供的工具。"

/**
 * 通用端点的模型元数据。
 *
 * `cost` / `contextWindow` / `maxTokens` 对任意 OpenAI 兼容端点都无法预知，
 * 这里用保守占位值。**后果要说清**：`calculateCost` 会算出 0，上下文压缩的
 * 触发点也会偏保守。阶段 ②-A 引入压缩时需要让 providers.yaml 能声明这些值，
 * 或对已知 provider 走 pi 内置的模型表。
 */
function buildModel(providerId: string, endpoint: NonNullable<SessionSpec["endpoint"]>): Model<Api> {
  return {
    id: endpoint.model,
    name: endpoint.model,
    api: "openai-completions",
    provider: providerId,
    baseUrl: endpoint.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  }
}

interface NativeSession {
  agent: Agent
  unsubscribe: () => void
  pid: number
}

export class NativeRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, NativeSession>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /**
   * native 会话不对应真实进程，pid 是合成的序号，只为满足 `SessionHandle` 契约
   * 与会话表的 `pid` 列。**它不可用于 `process.kill`**，与 PtyRuntime 的 pid 语义不同。
   */
  private nextPid = 1

  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const endpoint = spec.endpoint
    if (!endpoint) {
      throw new Error(`native 运行时需要 endpoint，会话 "${spec.sessionId}" 未提供`)
    }

    // provider 按会话隔离：不同会话可指向不同端点与不同 key，互不干扰
    const providerId = `dawn-${spec.sessionId}`
    const modelDef = buildModel(providerId, endpoint)

    const models = createModels()
    models.setProvider(
      createProvider({
        id: providerId,
        name: `DAWN endpoint (${endpoint.baseUrl})`,
        baseUrl: endpoint.baseUrl,
        // 显式 key 注入点。pi 自带的 envApiKeyAuth 从环境变量读，
        // 而我们的 key 来自 providers.yaml（已由 loader 展开 ${ENV}）。
        auth: {
          apiKey: {
            name: "DAWN endpoint api key",
            resolve: async () => ({
              auth: { apiKey: endpoint.apiKey },
              source: "providers.yaml",
            }),
          },
        },
        models: [modelDef],
        api: openAICompletionsApi(),
      }),
    )

    const model = models.getModel(providerId, endpoint.model)
    if (!model) {
      throw new Error(`端点未声明模型 "${endpoint.model}"`)
    }

    const agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      initialState: { systemPrompt: DEFAULT_SYSTEM_PROMPT, model, tools: [] },
    })

    // 把 pi 的事件流转成本项目的 AgentEvent。
    // 只取 text_delta：那是逐 token 的正文增量，对应终端上看到的流式输出。
    const unsubscribe = agent.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        this.emit({ kind: "output", sessionId: spec.sessionId, data: event.assistantMessageEvent.delta })
      }
      if (event.type === "turn_end") {
        this.emit({ kind: "output", sessionId: spec.sessionId, data: "\n" })
      }
    })

    const pid = this.nextPid++
    this.sessions.set(spec.sessionId, { agent, unsubscribe, pid })
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
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
   * 把 data 作为一轮 prompt 送入会话。
   *
   * 接口是同步的而 `agent.prompt` 是异步的，故此处 fire-and-forget，
   * 但**失败必须出声**——转成一条 output 事件送到终端，而不是静默吞掉。
   */
  write(sessionId: SessionId, data: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    const text = data.trim()
    if (!text) return
    void s.agent.prompt(text).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
    })
  }

  async stop(sessionId: SessionId): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return // 幂等
    s.agent.abort()
    s.unsubscribe()
    this.sessions.delete(sessionId)
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
  }

  /** 等待当前回合结束。CLI 用它决定何时收回提示符。 */
  async waitForIdle(sessionId: SessionId): Promise<void> {
    await this.sessions.get(sessionId)?.agent.waitForIdle()
  }
}
