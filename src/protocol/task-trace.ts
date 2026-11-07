/** Bounded host metadata, never a second transcript or an execution grant. */
import {z} from 'zod'
export const TaskTraceSchema=z.object({
 records:z.array(z.object({toolCallId:z.string().max(512),name:z.string().max(200),status:z.enum(['done','error']),execution:z.enum(['ran','failed','not_observed']),path:z.string().max(1024).optional()}).strict()).max(64),
 omitted:z.number().int().nonnegative(),
}).strict()
export type TaskTrace=z.infer<typeof TaskTraceSchema>
