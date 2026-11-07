import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {TaskTraceSchema,type TaskTrace} from '../protocol/task-trace.js'
export function taskTrace(evidence:readonly RouteToolEvidence[]):TaskTrace {
 const candidates=evidence.slice(-64).flatMap(e=>{
  const parsed=TaskTraceSchema.shape.records.element.safeParse({toolCallId:e.toolCallId,name:e.name,status:e.status,...(e.transcriptRef?{transcriptRef:e.transcriptRef}:{}),execution:e.execution??'not_observed',...(e.input&&typeof e.input==='object'&&typeof (e.input as {path?:unknown}).path==='string'?{path:(e.input as {path:string}).path}:{})})
  return parsed.success?[parsed.data]:[]
 })
 return{omitted:evidence.length-candidates.length,records:candidates}
}
