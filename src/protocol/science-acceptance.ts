/** Client-safe, host-executed scientific checks; never model-authored test programs. */
import {z} from 'zod'
import {ScienceEnvironmentSchema} from './science-reuse.js'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
import {FileVersionsSchema} from './file-versions.js'
const text=z.string().trim().min(1).max(2000)
export const NumericValidationSchema=z.object({version:z.literal(1),dataPath:WorkspaceRelativePathSchema,column:text,metric:z.enum(['mean','sum','min','max']),unit:text,missing:z.enum(['block','drop']),absoluteTolerance:z.number().finite().min(0).max(1).default(1e-9)}).strict()
export const ScienceAcceptanceSchema=z.object({version:z.literal(1),kind:z.enum(['tabular-ecology','figure-reproduction']),scriptPath:WorkspaceRelativePathSchema,reportPath:WorkspaceRelativePathSchema,resultPath:WorkspaceRelativePathSchema,environment:ScienceEnvironmentSchema.optional(),numeric:NumericValidationSchema.optional(),evidencePath:WorkspaceRelativePathSchema.optional(),citation:text.optional(),page:text.optional(),targetFigure:text.optional()}).strict().superRefine((v,c)=>{
 if(new Set([v.scriptPath,v.reportPath,v.resultPath]).size!==3)c.addIssue({code:'custom',message:'验收产物路径重复'})
 if(v.kind==='figure-reproduction'&&(!v.evidencePath||!v.citation||!v.page||!v.targetFigure||v.numeric))c.addIssue({code:'custom',message:'图表验收需要声明证据与出处，不使用表格数值规则'})
 if(v.kind==='tabular-ecology'&&(v.evidencePath||v.citation||v.page||v.targetFigure))c.addIssue({code:'custom',message:'表格验收不接受图表出处字段'})
})
export type ScienceAcceptance=z.infer<typeof ScienceAcceptanceSchema>
export const AcceptanceCheckSchema=z.object({id:text,state:z.enum(['passed','blocked','not_configured']),expected:z.string().max(2000).optional(),actual:z.string().max(2000).optional(),reason:z.string().max(2000).optional()}).strict()
export const ScienceAcceptanceReceiptSchema=z.object({version:z.literal(1),ruleVersion:z.literal(1),specHash:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['passed','blocked']),environment:ScienceEnvironmentSchema.extend({executionBound:z.boolean()}).optional(),numericChecked:z.boolean(),checks:z.array(AcceptanceCheckSchema).min(1).max(160),files:FileVersionsSchema}).strict()
export type ScienceAcceptanceReceipt=z.infer<typeof ScienceAcceptanceReceiptSchema>
