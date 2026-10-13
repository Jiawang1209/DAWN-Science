/** Shared Bot contracts. Keep Node-only scope canonicalization in store/bots. */
import { z } from "zod"

const Id = z.string().trim().min(1)
const Timestamp = z.string().datetime({ offset: true })
export const BotModelSchema = z.object({ provider: Id, model: Id }).strict()
export const BotCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(2000),
  instructions: z.string().trim().min(1).max(100000),
  model: BotModelSchema.optional(),
  enabled: z.boolean().optional(),
}).strict()
export const BotUpdateSchema = BotCreateSchema.partial().extend({ model: BotModelSchema.nullable().optional() }).strict()
export const BotProfileSchema = BotCreateSchema.extend({
  id: Id,
  enabled: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp.optional(),
}).strict()
export const BotScopeSchema = z.object({
  workspace: z.string().min(1).refine((s) => s.trim().length > 0),
  projectId: Id.optional(),
  connectionId: Id.optional(),
  remoteCwd: z.string().min(1).optional(),
}).strict().superRefine((scope, ctx) => {
  if (!!scope.connectionId !== !!scope.remoteCwd) ctx.addIssue({ code: "custom", message: "Remote scope requires connectionId and remoteCwd together" })
  if (scope.remoteCwd && !scope.remoteCwd.startsWith("/")) ctx.addIssue({ code: "custom", message: "Remote cwd must be absolute" })
})
export const BotSessionBindingSchema = z.object({
  botId: Id,
  scopeKey: Id,
  kind: z.enum(["direct", "team"]),
  teamId: Id.optional(),
  ownerSessionId: Id.optional(),
  sessionId: Id,
}).strict().superRefine((binding, ctx) => {
  if (binding.kind === "team" && (!binding.teamId || !binding.ownerSessionId)) ctx.addIssue({ code: "custom", message: "Team binding requires teamId and ownerSessionId" })
  if (binding.kind === "direct" && binding.teamId) ctx.addIssue({ code: "custom", message: "Direct binding cannot have teamId" })
})
export const BotDispatchInputSchema = z.object({
  requestId: Id,
  ownerSessionId: Id,
  botId: Id,
  scopeKey: Id,
  instruction: z.string().trim().min(1).max(100000),
  teamId: Id.optional(),
  taskId: Id.optional(),
  memberSessionId: Id.optional(),
}).strict()
export const BotDispatchPatchSchema = z.object({
  status: z.enum(["pending", "dispatched", "completed", "failed", "cancelled"]).optional(),
  teamId: Id.optional(),
  taskId: Id.optional(),
  memberSessionId: Id.optional(),
  error: z.string().optional(),
}).strict()
export const BotDispatchSchema = BotDispatchInputSchema.extend({
  status: BotDispatchPatchSchema.shape.status.unwrap(),
  error: z.string().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}).strict()
export const BotResultInputSchema = z.object({
  resultId: Id,
  requestId: Id.optional(),
  ownerSessionId: Id,
  botId: Id,
  teamId: Id,
  taskId: Id,
  attemptId: Id,
  // Preflight failures and queued cancellations have no member session yet.
  memberSessionId: Id.optional(),
  status: z.enum(["completed", "failed", "cancelled"]),
  summary: z.string(),
  artifacts: z.array(Id),
}).strict()
export const BotResultSchema = BotResultInputSchema.extend({ createdAt: Timestamp, deliveredAt: Timestamp.optional() }).strict()

export type BotModel = z.infer<typeof BotModelSchema>
export type BotCreate = z.infer<typeof BotCreateSchema>
export type BotUpdate = z.infer<typeof BotUpdateSchema>
export type BotProfile = z.infer<typeof BotProfileSchema>
export type BotScope = z.infer<typeof BotScopeSchema>
export type BotSessionBinding = z.infer<typeof BotSessionBindingSchema>
export type BotDispatchInput = z.infer<typeof BotDispatchInputSchema>
export type BotDispatchPatch = z.infer<typeof BotDispatchPatchSchema>
export type BotDispatch = z.infer<typeof BotDispatchSchema>
export type BotResultInput = z.infer<typeof BotResultInputSchema>
export type BotResult = z.infer<typeof BotResultSchema>
