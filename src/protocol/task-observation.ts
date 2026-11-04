/** Host observations, never model claims. Unknown usage fields stay absent. */
import {z} from 'zod'
const count=z.number().finite().nonnegative()
export const TaskUsageSchema=z.object({input:count.optional(),output:count.optional(),cacheRead:count.optional(),partial:z.array(z.enum(['input','output','cacheRead'])).optional()}).strict()
export const TaskObservationSchema=z.object({elapsedMs:count,submissionAttempts:count.int(),invalidSubmissions:count.int(),usage:TaskUsageSchema.optional()}).strict()
export type TaskObservation=z.infer<typeof TaskObservationSchema>
export type TaskUsage=z.infer<typeof TaskUsageSchema>
