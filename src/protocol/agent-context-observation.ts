/** Numeric, bounded snapshots only; prompts, tool results and reasoning never cross this boundary. */
import {z} from 'zod'
const count=z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const ContextRouteSchema=z.object({provider:z.string().min(1).max(256).regex(/^[^\r\n\x00]+$/),model:z.string().min(1).max(256).regex(/^[^\r\n\x00]+$/)}).strict()
export type ContextRoute=z.infer<typeof ContextRouteSchema>
const common={version:z.literal(1),observedAt:count,...ContextRouteSchema.shape,contextWindow:count.positive().optional(),contextWindowSource:z.literal('model-config').optional(),composition:z.object({systemBytes:count,toolBytes:count,messageBytes:count,source:z.literal('retained-bytes-estimate')}).strict().optional()}
export const AgentContextSampleSchema=z.discriminatedUnion('availability',[
 z.object({...common,availability:z.literal('available'),source:z.literal('sdk-estimate'),usedTokens:count}).strict(),
 z.object({...common,availability:z.literal('unknown'),source:z.literal('unknown'),reason:z.enum(['unsupported','no-current-route-anchor','after-compaction','sdk-unavailable','sample-failed'])}).strict(),
]).refine(value=>(value.contextWindow===undefined)===(value.contextWindowSource===undefined),'Capacity must have its own source')
export type AgentContextSample=z.infer<typeof AgentContextSampleSchema>
export const BoundAgentContextSampleSchema=z.object({ownerSessionId:z.string().min(1).max(512),childId:z.string().min(1).max(512),epoch:z.number().int().positive(),sample:AgentContextSampleSchema}).strict()
export type BoundAgentContextSample=z.infer<typeof BoundAgentContextSampleSchema>
export const AgentContextObservationSchema=z.object({current:z.boolean(),reason:z.enum(['current','historical','awaiting-sample','route-changed']),sample:BoundAgentContextSampleSchema.optional()}).strict().refine(value=>!value.current||(value.reason==='current'&&!!value.sample),'Current observations require a bound sample')
export type AgentContextObservation=z.infer<typeof AgentContextObservationSchema>
export const AgentContextMessageSchema=z.object({type:z.literal('context_observation'),sample:AgentContextSampleSchema}).strict()
