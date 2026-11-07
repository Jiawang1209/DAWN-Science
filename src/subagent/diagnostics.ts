/** Diagnostic-only projection: never carries accepted outputs, versions or receipts. */
import {TaskTraceSchema} from '../protocol/task-trace.js'
import {TaskObservationSchema} from '../protocol/task-observation.js'
import {TaskEvidenceSchema} from '../protocol/task-contract.js'
import {taskTrace} from '../orchestration/task-trace.js'
export function childDiagnostics(report:{trace?:unknown;observation?:unknown;evidence?:unknown}|undefined){
 const trace=TaskTraceSchema.safeParse(report?.trace),observation=TaskObservationSchema.safeParse(report?.observation)
 const evidence=trace.success?undefined:TaskEvidenceSchema.safeParse(report?.evidence)
 return{...(trace.success?{trace:trace.data}:evidence?.success?{trace:taskTrace(evidence.data.map(({toolCallId,name,status,result,input,execution})=>({toolCallId,name,status,result,input,...(execution?{execution}:{})})))}:{}),...(observation.success?{observation:observation.data}:{})}
}
