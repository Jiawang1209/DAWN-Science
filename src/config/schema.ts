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

export const AgentDefSchema = z.discriminatedUnion("kind", [NativeAgentSchema, PtyAgentSchema])
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
