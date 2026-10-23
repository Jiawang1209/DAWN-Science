import { z } from 'zod'

export const TerminalModeSchema = z.enum(['shell', 'python', 'R'])
export type TerminalMode = z.infer<typeof TerminalModeSchema>
export const TerminalTaskSchema = z.object({
  id: z.string(), state: z.enum(['running', 'completed', 'interrupted', 'unknown']),
  startedAt: z.string(), exitCode: z.number().int().optional(),
})
export type TerminalTask = z.infer<typeof TerminalTaskSchema>
export const TerminalControlSchema = z.object({
  id: z.string(), instanceId: z.string(), pid: z.number(), cwd: z.string(), command: z.string(),
  alive: z.boolean(), controlled: z.boolean(), ownerSessionId: z.string().optional(),
  mode: TerminalModeSchema, cols: z.number().int(), rows: z.number().int(),
  revision: z.number().int(), task: TerminalTaskSchema.optional(),
})
export type TerminalControlState = z.infer<typeof TerminalControlSchema>

export const TerminalAgentStateSchema = z.object({ mode: z.enum(['normal', 'dawn', 'starting', 'stopping']) })
