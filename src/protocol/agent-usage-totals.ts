/** Settled host epoch deltas for one durable child identity; never a context estimate. */
import {z} from 'zod'
export const USAGE_FIELDS=['input','output','cacheRead'] as const
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AgentUsageTotalsSchema=z.object({
 source:z.literal('host-epoch-deltas'),input:count.optional(),output:count.optional(),cacheRead:count.optional(),
 partial:z.array(z.enum(USAGE_FIELDS)).max(3),settledEpochs:count,unknownEpochs:count,
 lastSettledEpoch:count.positive().optional(),legacyHistory:z.literal(true).optional(),
}).strict().superRefine((value,ctx)=>{
 const invalid=value.unknownEpochs>value.settledEpochs||new Set(value.partial).size!==value.partial.length
  ||(value.settledEpochs===0)!==(value.lastSettledEpoch===undefined)
  ||value.lastSettledEpoch!==undefined&&value.lastSettledEpoch<value.settledEpochs
  ||value.settledEpochs===0&&USAGE_FIELDS.some(field=>value[field]!==undefined)
  ||value.settledEpochs>0&&USAGE_FIELDS.some(field=>value[field]===undefined&&!value.partial.includes(field))
  ||(value.unknownEpochs>0||value.legacyHistory)&&value.partial.length===0
  ||value.partial.length>0&&value.unknownEpochs===0&&!value.legacyHistory
  ||value.legacyHistory&&USAGE_FIELDS.some(field=>!value.partial.includes(field))
 if(invalid)ctx.addIssue({code:'custom',message:'Inconsistent settled usage coverage'})
})
export type AgentUsageTotals=z.infer<typeof AgentUsageTotalsSchema>
