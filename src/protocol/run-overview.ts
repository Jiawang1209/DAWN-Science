import {AgentContextObservationSchema} from './agent-context-observation.js'
import {AgentUsageTotalsSchema} from './agent-usage-totals.js'
/** Safe projection of existing execution records; never a second scheduler. */
import {z} from 'zod'
import {WORKBENCH_PROTOCOL_VERSION} from './version.js'
import {TeamSnapshotSchema} from './events.js'
import {TaskReceiptSchema} from './task-contract.js'
import {TaskTraceSummarySchema} from './task-trace.js'
import {ContextHandoffSchema} from './context-handoff.js'
import {TaskObservationSchema} from './task-observation.js'
import {RunActivitySchema,RunTimingSchema,RunHistorySchema,TaskAttemptBindingSchema} from './run-explanation.js'
import {RunBudgetSchema} from './run-budget.js'
export const RunOverviewSchema=z.object({
 ownerSessionId:z.string().min(1),source:z.enum(['live','disk','unsupported']),
 team:TeamSnapshotSchema.nullable().optional(),teamIssue:z.string().optional(),
 observation:z.object({observerId:z.string().min(1),revision:z.number().int().nonnegative()}).strict().optional(),
 history:RunHistorySchema.optional(),observationIssue:z.string().optional(),
 budget:RunBudgetSchema.optional(),
 runs:z.array(z.object({
  id:z.string(),kind:z.enum(['subagent','team','bot']),label:z.string(),address:z.array(z.string()),
  state:z.enum(['idle','queued','running','completed','failed','cancelled','interrupted']),
  epoch:z.number().int().nonnegative(),resultEpoch:z.number().int().nonnegative().optional(),updatedAt:z.number(),
  phase:z.enum(['idle','queued','running','stopping','drained','unknown']),
  taskAttempt:TaskAttemptBindingSchema.optional(),
  reason:z.string().optional(),contract:z.boolean(),handoff:ContextHandoffSchema.optional(),handoffIssue:z.string().optional(),handoffSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  receipt:z.enum(['accepted','blocked','invalid']).optional(),
  inputVersions:z.number().int().nonnegative(),outputVersions:z.number().int().nonnegative(),
  contextObservation:AgentContextObservationSchema.optional(),
  usageTotals:AgentUsageTotalsSchema.optional(),
  observation:TaskObservationSchema.optional(),taskReceipt:TaskReceiptSchema.optional(),trace:TaskTraceSummarySchema.optional(),
  activity:RunActivitySchema.optional(),timing:RunTimingSchema.optional(),
 }).strict()),
}).strict()
export type RunOverview= z.infer<typeof RunOverviewSchema>

/** Dedicated invalidation channel; never a transcript update or a payload snapshot. */
export const RunOverviewChangedSchema=z.object({type:z.literal('runOverviewChanged'),ownerSessionId:z.string().min(1),observerId:z.string().min(1),revision:z.number().int().nonnegative(),workbenchProtocolVersion:z.literal(WORKBENCH_PROTOCOL_VERSION)}).strict()
export type RunOverviewChanged=z.infer<typeof RunOverviewChangedSchema>

/** Reserved source marker for pure disk reads; it may recur after each live service lifecycle. */
export const DISK_OBSERVATION=Object.freeze({observerId:'disk',revision:0} as const)
