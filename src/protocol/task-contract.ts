import {ToolRecordRefSchema} from './tool-record.js'
/** Client-safe task contracts and host receipt vocabulary. No execution or filesystem imports. */
import {z} from 'zod'
import {ScienceAcceptanceSchema,ScienceAcceptanceReceiptSchema} from './science-acceptance.js'
import {FileVersionSchema,TaskInputVersionsSchema,TaskVersionsSchema} from './file-versions.js'
import {RouteExecutionSchema,RouteVerificationSchema,WorkspaceRelativePathSchema} from './analysis-route.js'
const paths = z.array(WorkspaceRelativePathSchema).max(64)
export const TaskAccessSchema = z.enum(['read-only','workspace-write','workspace-exec'])
export const TaskDataSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('data-summary'),rows:z.number().int().nonnegative(),columns:z.array(z.object({name:z.string().min(1).max(200),type:z.string().max(200).optional(),unit:z.string().max(200).optional()}).strict()).max(256),issues:z.array(z.string().min(1).max(2000)).max(64).describe('Unresolved blocking findings only. Empty [] means no blocker; informational observations and approved missing-value handling belong in summary.')}).strict(),
 z.object({kind:z.literal('model-metrics'),method:z.string().min(1).max(2000),metrics:z.record(z.string().min(1).max(100),z.number().finite()).refine(v=>Object.keys(v).length<=64,'Too many metrics'),sampleCount:z.number().int().nonnegative().optional(),caveats:z.array(z.string().max(2000)).max(64)}).strict(),
 z.object({kind:z.literal('review'),verdict:z.enum(['pass','revise','blocked']),findings:z.array(z.string().min(1).max(2000)).max(64),reviewedPaths:paths,revisionInstructions:z.string().min(1).max(8000).optional()}).strict().refine(v=>v.verdict==='pass'||v.findings.length>0,'Review issues need concrete findings'),
])
export const TaskContractSchema = z.object({
  acceptance:ScienceAcceptanceSchema.optional(),
  submission:z.literal('tool').optional(),resultType:z.enum(['data-summary','model-metrics','review']).optional(),
  version:z.literal(1).default(1), inputs:paths.default([]), outputs:paths.default([]), access:TaskAccessSchema.default('read-only'),requireExecution:z.boolean().default(false),requireReview:z.boolean().default(false),
}).strict().superRefine((c,ctx) => {
  if(c.acceptance){const a=c.acceptance;if([a.scriptPath,a.reportPath,a.resultPath].some(p=>!c.outputs.includes(p))||a.numeric&&!c.inputs.includes(a.numeric.dataPath)||a.evidencePath&&!c.inputs.includes(a.evidencePath))ctx.addIssue({code:'custom',message:'宿主验收只能读取本契约声明的输入和产物'})}
  if (new Set(c.inputs).size!==c.inputs.length || new Set(c.outputs).size!==c.outputs.length) ctx.addIssue({code:'custom',message:'Duplicate task paths'})
  if(c.requireExecution&&c.access!=='workspace-exec')ctx.addIssue({code:'custom',message:'Required execution needs workspace-exec capability'})
  if (c.access==='read-only' && c.outputs.length) ctx.addIssue({code:'custom',message:'Read-only tasks cannot declare writes'})
  if (c.access==='workspace-write' && !c.outputs.length) ctx.addIssue({code:'custom',message:'Scoped writes require outputs'})
  if (c.outputs.some(p=>c.inputs.includes(p))) ctx.addIssue({code:'custom',message:'Task inputs cannot be overwritten'})
})
export type TaskContract=z.infer<typeof TaskContractSchema>
export const TaskResultSchema=z.object({
  data:TaskDataSchema.optional(),
  summary:z.string().trim().min(1).max(64*1024), blockers:z.array(z.string().min(1)).max(64),
  deliverables:z.array(z.object({path:WorkspaceRelativePathSchema,note:z.string().optional()}).strict()).max(64),
  execution:RouteExecutionSchema,verification:RouteVerificationSchema,
}).strict()
export type TaskResult=z.infer<typeof TaskResultSchema>
export function taskResultParameters(contract:TaskContract){
 const schema=z.toJSONSchema(TaskResultSchema,{io:'input',unrepresentable:'any'})
 const properties=schema.properties!
 if(contract.resultType){
  const data=TaskDataSchema.options.find(option=>option.shape.kind.value===contract.resultType)!
  properties.data=z.toJSONSchema(data,{io:'input',unrepresentable:'any'})
  schema.required=[...new Set([...(schema.required??[]),'data'])]
 }
 const summary=properties.summary as Record<string,unknown>
 summary.description='Concise outcome and key blockers only. Do not repeat full reports, data, execution notes or every finding; long tool arguments can be truncated before submission.'
 if(contract.resultType==='review'){
  const review=properties.data as {properties:Record<string,Record<string,unknown>>}
  const paths=review.properties.reviewedPaths!
  paths.description='Required: exactly the frozen contract.inputs set, each path once, in any order. Additional files read for context belong in summary/findings, not reviewedPaths.'
  paths.minItems=contract.inputs.length;paths.maxItems=contract.inputs.length;paths.uniqueItems=true
  if(contract.inputs.length)paths.items={type:'string',enum:[...contract.inputs]}
 }
 if(contract.resultType==='model-metrics'&&contract.acceptance?.numeric){
  const key=contract.acceptance.numeric.metric
  const data=properties.data as {properties:Record<string,Record<string,unknown>>}
  data.properties.metrics={...data.properties.metrics,properties:{[key]:{type:'number'}},description:`Frozen numeric key: ${key}; use the same value as result JSON. sampleCount equals n, unit is ${contract.acceptance.numeric.unit}.`}
 }
 const execution=properties.execution as {properties:Record<string,Record<string,unknown>>}
 const verification=properties.verification as {properties:Record<string,Record<string,unknown>>}
 execution.properties.toolCallIds!.description='For completed execution use only actual bash/powershell/run_code IDs with host execution=ran. Never cite write, edit, read or failed calls as completed execution.'
 verification.properties.toolCallIds!.description='For reviewed use only successful 本轮成功 read/look_at_image/bash/powershell/run_code IDs. Never include failed reads, write/edit or other tasks. Data-summary/review must read every declared input.'
 if(!contract.outputs.length)(properties.deliverables as Record<string,unknown>).maxItems=0
 return schema
}
export const TaskResultParameters=z.toJSONSchema(TaskResultSchema,{io:'input',unrepresentable:'any'})
export const TaskReceiptSchema=z.object({
  acceptance:ScienceAcceptanceReceiptSchema.optional(),
  versions:TaskVersionsSchema.optional(),
  version:z.literal(1),state:z.enum(['accepted','blocked','invalid']),summary:z.string(),reason:z.string().optional(),
  result:TaskResultSchema.optional(),deliverables:z.array(z.object({stepId:z.string(),path:z.string(),state:z.enum(['exists','missing','unknown','observed'])}).strict()),
}).strict()
export type TaskReceipt=z.infer<typeof TaskReceiptSchema>
export const TaskScopeSchema=z.object({version:z.literal(1),tier:z.enum(['allow-all','ask-risky','deny-risky']),
  access:TaskAccessSchema,tools:z.array(z.string()).max(64),inputs:paths,outputs:paths}).strict()
export type TaskScope=z.infer<typeof TaskScopeSchema>
export const TaskSettingsSchema=z.object({contract:TaskContractSchema.optional(),scope:TaskScopeSchema,versions:TaskInputVersionsSchema.optional()}).strict().superRefine(({contract,scope,versions},ctx)=>{
  if(versions&&(!contract||versions.inputs.length!==contract.inputs.length||contract.inputs.some(p=>!versions.inputs.some(v=>v.path===p))||contract.inputs.length+contract.outputs.length>64))ctx.addIssue({code:'custom',message:'内容版本须覆盖全部契约输入，阶段文件总数不能超过 64'})
  if(contract&&(contract.access!==scope.access||JSON.stringify(contract.inputs)!==JSON.stringify(scope.inputs)||JSON.stringify(contract.outputs)!==JSON.stringify(scope.outputs)))ctx.addIssue({code:'custom',message:'Frozen scope contradicts task contract'})
  if(scope.access!=='workspace-exec'&&scope.tools.some(t=>!['read','ls','grep','find','resource_read','resource_search','team_status','bot_say',...(scope.access==='workspace-write'?['write','edit']:[])].includes(t)))ctx.addIssue({code:'custom',message:'Tools exceed frozen task access'})
})
export type TaskSettings=z.infer<typeof TaskSettingsSchema>
export const TaskEvidenceSchema=z.array(z.object({toolCallId:z.string(),name:z.string(),status:z.enum(['done','error']),result:z.string(),transcriptRef:ToolRecordRefSchema.optional(),
  scienceExecution:z.object({script:FileVersionSchema,dependencyBound:z.literal(true).optional(),environmentFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),input:z.unknown().optional(),filesWritten:z.array(z.string()).optional(),stepId:z.string().optional(),execution:z.enum(['ran','failed','not_observed']).optional(),
}).strict()).max(1024)
