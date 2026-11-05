import {z} from 'zod'
const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const ScienceEnvironmentSchema=z.object({state:z.enum(['known','unknown']),language:z.enum(['python','r']),fingerprint:hash.optional(),executable:z.string().min(1).max(4000).optional(),reason:z.string().max(1000).optional()}).strict().superRefine((v,c)=>{if(v.state==='known'&&(!v.fingerprint||!v.executable))c.addIssue({code:'custom',message:'环境指纹缺失'})})
export type ScienceEnvironment=z.infer<typeof ScienceEnvironmentSchema>
export const ScienceReuseContextSchema=z.object({version:z.literal(1),signature:hash,environment:ScienceEnvironmentSchema}).strict()
export type ScienceReuseContext=z.infer<typeof ScienceReuseContextSchema>
export const ScienceReuseSourceSchema=z.object({teamId:z.string().regex(/^pipeline-[a-f0-9]{24}$/),stateRevision:z.number().int().positive(),itemId:z.string().min(1).max(32)}).strict()
export const ScienceReuseDecisionSchema=z.object({mode:z.enum(['reused','rerun']),reason:z.string().min(1).max(2000),source:ScienceReuseSourceSchema.optional()}).strict()
export type ScienceReuseDecision=z.infer<typeof ScienceReuseDecisionSchema>
export const ScienceReuseRequestSchema=z.object({teamId:z.string().regex(/^pipeline-[a-f0-9]{24}$/),stateRevision:z.number().int().positive(),forceRerunItems:z.array(z.string().min(1).max(32)).max(8).default([]),acknowledgeInterrupted:z.boolean().default(false)}).strict()
