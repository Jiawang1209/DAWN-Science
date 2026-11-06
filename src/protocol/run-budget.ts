import {z} from 'zod'
const natural=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const RunBudgetLimitsSchema=z.object({maxRuns:z.number().int().min(1).max(10000).optional(),maxElapsedMs:z.number().int().min(1).max(7*24*60*60*1000).optional(),maxTokens:z.number().int().min(1).max(1_000_000_000).optional()}).strict()
export type RunBudgetLimits=z.infer<typeof RunBudgetLimitsSchema>
export const BudgetBlockSchema=z.object({code:z.enum(['runs','elapsed','tokens','unknown-usage']),message:z.string()}).strict()
export const RunBudgetSchema=z.object({revision:natural,limits:RunBudgetLimitsSchema,consumedRuns:natural,legacyRuns:natural,knownTokens:natural,unknownRuns:natural,inFlight:natural,startedAt:z.number().finite().optional(),elapsedMs:z.number().nonnegative(),blocked:BudgetBlockSchema.optional()}).strict()
export type RunBudget=z.infer<typeof RunBudgetSchema>
