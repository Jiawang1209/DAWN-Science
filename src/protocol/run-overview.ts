/** Safe projection of existing execution records; never a second scheduler. */
import {z} from 'zod'
import {TaskReceiptSchema} from './task-contract.js'
import {TaskTraceSchema} from './task-trace.js'
import {ContextHandoffSchema} from './context-handoff.js'
import {TaskObservationSchema} from './task-observation.js'
import {RunActivitySchema,RunTimingSchema,RunHistorySchema} from './run-explanation.js'
import {RunBudgetSchema} from './run-budget.js'
export const RunOverviewSchema=z.object({
 ownerSessionId:z.string().min(1),source:z.enum(['live','disk','unsupported']),
 history:RunHistorySchema.optional(),observationIssue:z.string().optional(),
 budget:RunBudgetSchema.optional(),
 runs:z.array(z.object({
  id:z.string(),kind:z.enum(['subagent','team','bot']),label:z.string(),address:z.array(z.string()),
  state:z.enum(['idle','queued','running','completed','failed','cancelled','interrupted']),
  epoch:z.number().int().nonnegative(),updatedAt:z.number(),
  phase:z.enum(['idle','queued','running','stopping','drained','unknown']),
  reason:z.string().optional(),contract:z.boolean(),handoff:ContextHandoffSchema.optional(),handoffIssue:z.string().optional(),handoffSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  receipt:z.enum(['accepted','blocked','invalid']).optional(),
  inputVersions:z.number().int().nonnegative(),outputVersions:z.number().int().nonnegative(),
  observation:TaskObservationSchema.optional(),taskReceipt:TaskReceiptSchema.optional(),trace:TaskTraceSchema.optional(),
  activity:RunActivitySchema.optional(),timing:RunTimingSchema.optional(),
 }).strict()),
}).strict()
export type RunOverview= z.infer<typeof RunOverviewSchema>
