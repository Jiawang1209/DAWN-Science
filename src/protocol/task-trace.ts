/** Bounded host metadata, never a second transcript or an execution grant. */
import {z} from 'zod'
import {ToolRecordRefSchema} from './tool-record.js'

const ToolSummarySchema=z.object({
 toolCallId:z.string().max(512),name:z.string().max(200),status:z.enum(['done','error']),
 execution:z.enum(['ran','failed','not_observed']),path:z.string().max(1024).optional(),
}).strict()
export const TaskTraceSummarySchema=z.object({records:z.array(ToolSummarySchema).max(64),omitted:z.number().int().nonnegative()}).strict()
export type TaskTraceSummary=z.infer<typeof TaskTraceSummarySchema>

export const TaskTraceSchema=TaskTraceSummarySchema.extend({
 records:z.array(ToolSummarySchema.extend({transcriptRef:ToolRecordRefSchema.optional()})).max(64),
})
export type TaskTrace=z.infer<typeof TaskTraceSchema>

/** Keep existing summary/event payloads compatible with older strict renderers. */
export function publicTaskTrace(trace:TaskTrace):TaskTraceSummary{
 return{omitted:trace.omitted,records:trace.records.map(({transcriptRef:_ref,...row})=>row)}
}
