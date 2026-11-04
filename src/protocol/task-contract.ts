/** Client-safe task contracts and host receipt vocabulary. No execution or filesystem imports. */
import {z} from 'zod'
import {RouteExecutionSchema,RouteVerificationSchema,WorkspaceRelativePathSchema} from './analysis-route.js'
const paths = z.array(WorkspaceRelativePathSchema).max(64)
export const TaskAccessSchema = z.enum(['read-only','workspace-write','workspace-exec'])
export const TaskContractSchema = z.object({
  version:z.literal(1).default(1), inputs:paths.default([]), outputs:paths.default([]), access:TaskAccessSchema.default('read-only'),requireExecution:z.boolean().default(false),requireReview:z.boolean().default(false),
}).strict().superRefine((c,ctx) => {
  if (new Set(c.inputs).size!==c.inputs.length || new Set(c.outputs).size!==c.outputs.length) ctx.addIssue({code:'custom',message:'Duplicate task paths'})
  if(c.requireExecution&&c.access!=='workspace-exec')ctx.addIssue({code:'custom',message:'Required execution needs workspace-exec capability'})
  if (c.access==='read-only' && c.outputs.length) ctx.addIssue({code:'custom',message:'Read-only tasks cannot declare writes'})
  if (c.access==='workspace-write' && !c.outputs.length) ctx.addIssue({code:'custom',message:'Scoped writes require outputs'})
  if (c.outputs.some(p=>c.inputs.includes(p))) ctx.addIssue({code:'custom',message:'Task inputs cannot be overwritten'})
})
export type TaskContract=z.infer<typeof TaskContractSchema>
export const TaskResultSchema=z.object({
  summary:z.string().trim().min(1).max(64*1024), blockers:z.array(z.string().min(1)).max(64),
  deliverables:z.array(z.object({path:WorkspaceRelativePathSchema,note:z.string().optional()}).strict()).max(64),
  execution:RouteExecutionSchema,verification:RouteVerificationSchema,
}).strict()
export const TaskReceiptSchema=z.object({
  version:z.literal(1),state:z.enum(['accepted','blocked','invalid']),summary:z.string(),reason:z.string().optional(),
  result:TaskResultSchema.optional(),deliverables:z.array(z.object({stepId:z.string(),path:z.string(),state:z.enum(['exists','missing','unknown','observed'])}).strict()),
}).strict()
export type TaskReceipt=z.infer<typeof TaskReceiptSchema>
export const TaskScopeSchema=z.object({version:z.literal(1),tier:z.enum(['allow-all','ask-risky','deny-risky']),
  access:TaskAccessSchema,tools:z.array(z.string()).max(64),inputs:paths,outputs:paths}).strict()
export type TaskScope=z.infer<typeof TaskScopeSchema>
export const TaskSettingsSchema=z.object({contract:TaskContractSchema.optional(),scope:TaskScopeSchema}).strict().superRefine(({contract,scope},ctx)=>{
  if(contract&&(contract.access!==scope.access||JSON.stringify(contract.inputs)!==JSON.stringify(scope.inputs)||JSON.stringify(contract.outputs)!==JSON.stringify(scope.outputs)))ctx.addIssue({code:'custom',message:'Frozen scope contradicts task contract'})
  if(scope.access!=='workspace-exec'&&scope.tools.some(t=>!['read','ls','grep','find','resource_read','resource_search','team_status','bot_say',...(scope.access==='workspace-write'?['write','edit']:[])].includes(t)))ctx.addIssue({code:'custom',message:'Tools exceed frozen task access'})
})
export type TaskSettings=z.infer<typeof TaskSettingsSchema>
export const TaskEvidenceSchema=z.array(z.object({toolCallId:z.string(),name:z.string(),status:z.enum(['done','error']),result:z.string(),
  input:z.unknown().optional(),filesWritten:z.array(z.string()).optional(),stepId:z.string().optional(),execution:z.enum(['ran','failed','not_observed']).optional(),
}).strict()).max(1024)
