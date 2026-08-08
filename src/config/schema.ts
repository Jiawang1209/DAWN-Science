/**
 * Provider 注册表的类型与校验（实施计划 Task 1.1）。
 *
 * 两段式结构，刻意把「连哪个服务」与「哪个 agent」分开：
 *   endpoints —— 模型服务的连接信息（baseUrl / apiKey / 可用模型）
 *   agents    —— 具体的 agent 定义，native 引用某个 endpoint，pty 直接起一个命令
 * 好处是多个 agent 可共用一份凭证，换 key 只改一处。
 *
 * 这里用 zod。注意与工具 schema 的分工：**zod 管配置校验，TypeBox 管 agent 工具 schema**
 * （pi 的 AgentTool 要求 TSchema）。两者并存，不做转换。见 spikes/FINDINGS.md · Spike A。
 */
import { z } from "zod"

/** agent 被授予的能力。授权是显式的白名单，不做能力推断（规格 4.1 否决第三条）。 */
export const CapabilitySchema = z.enum(["fs_write", "exec", "mcp", "hooks", "chat"])
export type Capability = z.infer<typeof CapabilitySchema>

export const EndpointSchema = z.object({
  baseUrl: z.url(),
  /** 支持 ${ENV_VAR} 占位，由 loader 展开（Task 1.2）。此处只校验非空。 */
  apiKey: z.string().min(1),
  /**
   * 必须钉具体版本的 model id。Spike A 实测：pi 的 deepseek provider 只认
   * deepseek-v4-flash / deepseek-v4-pro，别名 deepseek-chat 不在注册表内。
   * 且指向会漂移的别名与本项目「可追溯」的核心主张冲突。
   */
  models: z.array(z.string().min(1)).min(1),
})
export type Endpoint = z.infer<typeof EndpointSchema>

/** 进程内跑 pi 的 agentLoop，通过 endpoint 直连模型服务。 */
const NativeAgentSchema = z.object({
  kind: z.literal("native"),
  endpoint: z.string().min(1),
  model: z.string().min(1),
  capabilities: z.array(CapabilitySchema),
})

/** 在 PTY 里起一个外部 CLI（claude / codex 等），我方只管进程与隔离配置。 */
const PtyAgentSchema = z.object({
  kind: z.literal("pty"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  capabilities: z.array(CapabilitySchema),
})

export const AgentDefSchema = z.discriminatedUnion("kind", [NativeAgentSchema, PtyAgentSchema])
export type AgentDef = z.infer<typeof AgentDefSchema>

export const ProviderRegistrySchema = z.object({
  endpoints: z.record(z.string(), EndpointSchema),
  agents: z.record(z.string(), AgentDefSchema),
})
export type ProviderRegistry = z.infer<typeof ProviderRegistrySchema>
