import {z} from 'zod'
const natural=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const RunBudgetLimitsSchema=z.object({maxRuns:z.number().int().min(1).max(10000).optional(),maxElapsedMs:z.number().int().min(1).max(7*24*60*60*1000).optional(),maxTokens:z.number().int().min(1).max(1_000_000_000).optional(),reserveReviewRuns:z.boolean().optional()}).strict().refine(limits=>!limits.reserveReviewRuns||limits.maxRuns!==undefined,'审阅执行轮次预留需要 maxRuns')
export type RunBudgetLimits=z.infer<typeof RunBudgetLimitsSchema>
export const ReviewReservationIdentitySchema=z.tuple([z.string().min(1).max(512),z.string().min(1).max(512),natural])
export const ReviewReservationKeySchema=z.string().max(4096).refine(key=>{
 try{const identity=ReviewReservationIdentitySchema.safeParse(JSON.parse(key));return identity.success&&JSON.stringify(identity.data)===key}catch{return false}
},'审阅预留标识必须是规范 owner/pipeline/cycle 元组')
export const ReviewRunReservationSchema=z.object({key:ReviewReservationKeySchema,stage:z.literal('review'),remainingRuns:z.union([z.literal(0),z.literal(1)]),phase:z.enum(['held','consumed','released','recovery-check'])}).strict().refine(reservation=>reservation.remainingRuns===((reservation.phase==='held'||reservation.phase==='recovery-check')?1:0),'预留剩余轮次与状态不一致')
export type ReviewRunReservation=z.infer<typeof ReviewRunReservationSchema>
export const BudgetBlockSchema=z.object({code:z.enum(['runs','elapsed','tokens','unknown-usage']),message:z.string()}).strict()
export const RunBudgetSchema=z.object({revision:natural,limits:RunBudgetLimitsSchema,consumedRuns:natural,legacyRuns:natural,knownTokens:natural,unknownRuns:natural,inFlight:natural,startedAt:z.number().finite().optional(),elapsedMs:z.number().nonnegative(),blocked:BudgetBlockSchema.optional(),reviewReservations:z.array(ReviewRunReservationSchema).optional(),ordinaryRemainingRuns:natural.optional(),reviewReservedRuns:natural.optional(),reviewRecoveryRuns:natural.optional()}).strict()
export type RunBudget=z.infer<typeof RunBudgetSchema>
