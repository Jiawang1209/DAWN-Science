import { z } from 'zod'

export const TerminalModeSchema = z.enum(['shell', 'python', 'R'])
export type TerminalMode = z.infer<typeof TerminalModeSchema>
export const TerminalTaskSchema = z.object({
  id: z.string(), state: z.enum(['running', 'completed', 'interrupted', 'unknown']),
  startedAt: z.string(), exitCode: z.number().int().optional(),
})
export type TerminalTask = z.infer<typeof TerminalTaskSchema>
export const TerminalControlSchema = z.object({
  connectionId: z.string().optional(),
  id: z.string(), instanceId: z.string(), pid: z.number(), cwd: z.string(), command: z.string(),
  alive: z.boolean(), controlled: z.boolean(), ownerSessionId: z.string().optional(),
  mode: TerminalModeSchema, cols: z.number().int(), rows: z.number().int(),
  revision: z.number().int(), task: TerminalTaskSchema.optional(),
})
export type TerminalControlState = z.infer<typeof TerminalControlSchema>

export const TerminalAgentStateSchema = z.object({
  remote: z.object({ connectionId: z.string(), label: z.string(), cwd: z.string() }).optional(),
  mode: z.enum(['normal', 'dawn', 'starting', 'stopping']),
  sessionId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  selection: z.object({ provider: z.string().min(1), model: z.string().min(1) }).optional(),
})
export type TerminalAgentState = z.infer<typeof TerminalAgentStateSchema>
export const TerminalHistoryEntrySchema = z.object({
  sessionId: z.string().min(1), title: z.string().optional(), createdAt: z.string(), lastActiveAt: z.string().optional(),
}).strict()
export type TerminalHistoryEntry = z.infer<typeof TerminalHistoryEntrySchema>

export const TerminalAttachmentsSchema = z.object({
  sessionId: z.string().min(1).optional(), revision: z.number().int().nonnegative(),
  pending: z.array(z.object({ id: z.uuid(), name: z.string(), thumbnail: z.string().startsWith('data:image/') })).optional(),
})
export const TerminalAttachmentUpdateSchema = z.discriminatedUnion('action', [
  z.object({ terminalId: z.string().min(1), sessionId: z.string().min(1), action: z.literal('add'),
    images: z.array(z.object({ name: z.string().max(120), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), data: z.string().min(1).max(14_000_000) }).strict()).min(1).max(4) }).strict(),
  z.object({ terminalId: z.string().min(1), sessionId: z.string().min(1), action: z.literal('remove'), imageId: z.uuid() }).strict(),
])

export type TerminalAttachmentUpdate = z.infer<typeof TerminalAttachmentUpdateSchema>
