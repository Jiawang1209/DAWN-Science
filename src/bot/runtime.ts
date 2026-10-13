import type { BotMemberRun } from "../team/scheduler.js"
import type { 团队, 成员 } from "../team/types.js"
export interface RuntimeBot {
  id: string
  name: string
  role: string
  instructions: string
  enabled: boolean
  archivedAt?: string | undefined
  scopeKey?: string | undefined
  model?: { provider: string; model: string } | undefined
}
/** 由工作台注入；运行时不认识数据库或 UI。 */
export interface BotRuntimeBridge {
  recover?(ownerSessionId: string, team: 团队): void | Promise<void>
  scopeKey?(ownerSessionId: string): string
  ownerContext?(ownerSessionId: string): {key: string; workspace: string; projectId?: string; connectionId?: string; remoteCwd?: string}
  cancel?(ownerSessionId: string, event: {team: 团队; member: 成员; taskId: string; attemptId?: string | undefined}): void | Promise<void>
  list(): readonly RuntimeBot[]
  run(ownerSessionId: string, request: BotMemberRun): Promise<{ ok: boolean; output: string; error?: string }>
  result(ownerSessionId: string, event: { team: 团队; member: 成员; taskId: string; attemptId: string; result: { ok: boolean; output: string; error?: string } }): void | Promise<void>
}
export function botInstructions(bot: Pick<RuntimeBot, "name" | "role" | "instructions">): string {
  return `你是科研 Bot「${bot.name}」。专业职责：${bot.role}\n${bot.instructions}\n执行任务时明确输入、方法、结果和产物路径。不要编造未执行的分析，不创建嵌套团队。`
}
