/** Host facts only: no task prompts, model outputs, or raw tool payloads. */
import {z} from 'zod'
export const ExecutionStageSchema=z.enum(['lock-wait','preflight','execution','acceptance'])
export type ExecutionStage=z.infer<typeof ExecutionStageSchema>
export const LockOwnerSchema=z.object({ownerSessionId:z.string(),childId:z.string(),label:z.string(),epoch:z.number().int().nonnegative()}).strict()
export type LockOwner=z.infer<typeof LockOwnerSchema>
export const RunActivitySchema=z.object({stage:ExecutionStageSchema,since:z.number().finite(),blockers:z.array(LockOwnerSchema).max(64).optional(),unknownBlockers:z.boolean().optional(),resources:z.array(z.string().max(4096)).max(64).optional()}).strict()
export const RunTimingSchema=z.object({lockWaitMs:z.number().nonnegative().optional(),preflightMs:z.number().nonnegative().optional(),executionMs:z.number().nonnegative().optional(),acceptanceMs:z.number().nonnegative().optional()}).strict()
export type RunTiming=z.infer<typeof RunTimingSchema>
export const RunEventSchema=z.object({seq:z.number().int().positive(),at:z.number().finite(),childId:z.string().optional(),epoch:z.number().int().nonnegative().optional(),type:z.enum(['registered','queued','started','stage','cancel-requested','settled','recovered','budget-configured','budget-blocked']),stage:ExecutionStageSchema.optional(),state:z.string().optional(),receipt:z.enum(['accepted','blocked','invalid']).optional(),blockers:z.array(LockOwnerSchema).max(64).optional(),unknownBlockers:z.boolean().optional(),resources:z.array(z.string().max(4096)).max(64).optional()}).strict()
export type RunEvent=z.infer<typeof RunEventSchema>
export const RunHistorySchema=z.object({events:z.array(RunEventSchema).max(256),truncated:z.boolean()}).strict()
export const stageTimingKey=(stage:ExecutionStage):keyof RunTiming=>stage==='lock-wait'?'lockWaitMs':`${stage}Ms`
