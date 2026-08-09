/**
 * Provider 注册表的类型与校验。
 *
 * **2026-08-08 返工 R2：删掉 `endpoints` 段。**
 *
 * 原设计是两段式——`endpoints`（baseUrl + apiKey + models 清单）与 `agents`。
 * 它要求用户手写模型服务的连接信息，**那是自建 LLM provider 抽象**，
 * 正是规格 §4 非目标清单里明令不做的一条。
 *
 * pi-ai 内置 39 个 provider，各自带 baseUrl、API 形态与生成的模型目录。
 * 配置只需说「用哪个 provider 的哪个模型」，连接细节交给 pi。
 * 顺带修好的两件事：
 *   - **anthropic / google 的原生 API 现在走得通**——旧实现写死 `openAICompletionsApi()`
 *   - **模型目录不必手维护**——旧配置里 models 清单要人跟着 provider 一起更新
 *
 * 凭证按 **provider** 存（原来按 endpoint），由 app 的凭证库管，配置文件里不出现。
 *
 * 这里用 zod。与工具 schema 的分工不变：**zod 管配置校验，TypeBox 管 agent 工具 schema**。
 */
import { z } from "zod"

/** agent 被授予的能力。授权是显式的白名单，不做能力推断（规格 4.1 否决第三条）。 */
export const CapabilitySchema = z.enum(["fs_write", "exec", "mcp", "hooks", "chat"])
export type Capability = z.infer<typeof CapabilitySchema>

/**
 * 进程内跑 pi 的编码 agent，直连 pi 内置 provider。
 *
 * `provider` 必须是 pi 认识的 id（`knownProviders()`），**由 loader 在加载期校验**——
 * 拼错一个 provider 名不该留到建会话时才崩。
 */
const NativeAgentSchema = z
  .object({
    kind: z.literal("native"),
    /** pi 的内置 provider id，如 deepseek / anthropic / openai */
    provider: z.string().min(1),
    /**
     * 必须钉具体版本的 model id。Spike A 实测：pi 的 deepseek provider 只认
     * deepseek-v4-flash / deepseek-v4-pro，别名 deepseek-chat 不在注册表内。
     * 且指向会漂移的别名与本项目「可追溯」的核心主张冲突。
     */
    model: z.string().min(1),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()

/** 在 PTY 里起一个外部 CLI（claude / codex 等），我方只管进程与隔离配置。 */
const PtyAgentSchema = z
  .object({
    kind: z.literal("pty"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()

/**
 * 外部 CLI 的 **headless 模式**（①-C）：我方驱动它、并翻译它吐出的结构化事件。
 *
 * ## 与 `pty` 的区别不是形态，是语义
 *
 * `pty` 拿到的是**终端字节流**——ANSI 转义、边框、spinner。那里面没有
 * 「工具调用」这个概念，所以一个 PTY 托管的 claude 会话在账本上只能是
 * **一条 `pty_session` Run**：它读了什么、改了什么、花了多少，一概不知道。
 * **不是我们没记，是拿不到。**
 *
 * `cli` 拿到的是**结构化事件**（Spike G 实测）：
 * ```
 * claude  --print --output-format stream-json --input-format stream-json
 * codex   exec --json  /  exec resume <thread_id> --json
 * ```
 * 于是它的工具调用、消息、用量能落进已有的那一套——transcript、
 * `tool_call:<工具名>` 的 Run、变更 pane、成本栏。
 * **不变式 3 与 5 第一次能覆盖外部 CLI。**
 *
 * ## 所以刻意新增一种，而不是复用 `pty`
 *
 * 形态像不等于语义同。复用会让「这个会话有没有终端」这个判断从此不可靠，
 * 而界面正靠它决定画对话还是画终端。
 *
 * **`pty` 没有被取代**：它作为**通用终端**保留（跑任意命令，也可手动起
 * 那两个 CLI 的 TUI）——作者定的定位。
 */
const CliAgentSchema = z
  .object({
    kind: z.literal("cli"),
    /** 可执行文件名或路径，如 `claude` / `codex` */
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    /**
     * 默认用哪个模型。**缺省 = 用 CLI 自己的默认**，不替它选一个。
     */
    model: z.string().min(1).optional(),
    /**
     * 模型选择器里能选哪些。**只能由配置声明**（Spike H）。
     *
     * pi 那边有模型目录（`availableModels(provider)`），**两个 CLI 都没有
     * 对应的接口**：claude 认别名（`opus`/`sonnet`/`haiku`）也认全名，
     * codex 认模型名，但**都没有「列出可选项」的方式**。
     *
     * 没声明就不显示模型选择器——**与 native 那边「取不到就不假装有得选」
     * 是同一条纪律**。
     */
    models: z.array(z.string().min(1)).optional(),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()
  /**
   * **声明了 `models` 就必须声明 `model`。**
   *
   * 2026-08-09 作者试用时撞到的，**而且是我发的默认配置就错的**：
   * 界面上模型选择器的渲染条件是「有清单 **且** 知道当前是哪个」，
   * 只有清单时 `current` 是 undefined，**整个选择器不渲染**——
   * 作者看到的是「好像没有任何变化」。
   *
   * **不能靠「记得两个都写」**：一份看起来没问题、实际什么都不做的配置，
   * 比一份报错的配置坏得多。所以在加载时就拦下。
   *
   * **为什么不猜 `models[0]` 是当前**：外部 CLI 有它自己的默认模型，
   * 我们不知道是哪个。把清单里的第一个说成「当前」是编造（不变式 5）。
   */
  .refine((d) => !d.models || d.model !== undefined, {
    message: "声明了 models（可选清单）就必须同时声明 model（当前用哪个）——否则模型选择器不会出现",
    path: ["model"],
  })

export const AgentDefSchema = z.discriminatedUnion("kind", [
  NativeAgentSchema,
  PtyAgentSchema,
  CliAgentSchema,
])
export type AgentDef = z.infer<typeof AgentDefSchema>

/**
 * `.strict()`：**多余的顶层段一律拒绝**。
 * 这条不是洁癖——旧配置里的 `endpoints` 若被静默忽略，用户会以为它还生效，
 * 而实际上凭证与 baseUrl 全都没被读。**失败必须出声（规格 7.5）。**
 */
export const ProviderRegistrySchema = z
  .object({
    agents: z.record(z.string(), AgentDefSchema),
  })
  .strict()
export type ProviderRegistry = z.infer<typeof ProviderRegistrySchema>
