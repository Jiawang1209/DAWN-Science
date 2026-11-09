/** Shared bounded workflow vocabulary. No executor or filesystem imports. */
import {z} from 'zod'
import {ScienceAcceptanceSchema} from './science-acceptance.js'
import {FileVersionsSchema,sameFileVersions} from './file-versions.js'
import {AnalysisRouteSchema,WorkspaceRelativePathSchema} from './analysis-route.js'
import {TaskSettingsSchema,TaskContractSchema} from './task-contract.js'
const text=z.string().trim().min(1).max(8000),paths=z.array(WorkspaceRelativePathSchema).min(1).max(64)
export const PipelineStageSchema=z.enum(['check','analyze','review'])
export type PipelineStage=z.infer<typeof PipelineStageSchema>
export const PipelineDefinitionSchema=z.object({route:AnalysisRouteSchema,stepId:text,inputs:paths,outputs:paths,initialVersions:FileVersionsSchema.optional(),acceptance:ScienceAcceptanceSchema.optional(),members:z.object({check:text,analyze:text,review:text}).strict(),instructions:text,requireExecution:z.boolean(),maxRevisions:z.number().int().min(0).max(2)}).strict().superRefine((v,ctx)=>{
 if(v.initialVersions&&(v.initialVersions.length!==v.inputs.length||v.inputs.some(path=>!v.initialVersions!.some(f=>f.path===path))))ctx.addIssue({code:'custom',message:'冻结版本必须覆盖全部输入'})
 if(!v.route.steps.some(step=>step.id===v.stepId&&step.status!=='skipped'))ctx.addIssue({code:'custom',message:'路线步骤不存在或已跳过'})
 if(v.members.analyze===v.members.review)ctx.addIssue({code:'custom',message:'分析与审阅必须由不同成员承担'})
 if(v.outputs.some(p=>v.inputs.includes(p))||new Set(v.inputs).size!==v.inputs.length||new Set(v.outputs).size!==v.outputs.length)ctx.addIssue({code:'custom',message:'输入输出不能重叠或重复'})
 if(JSON.stringify(v).length>64*1024)ctx.addIssue({code:'custom',message:'流程定义超过 64 KiB'})
})
export type PipelineDefinition=z.infer<typeof PipelineDefinitionSchema>
export type PipelineContractDefinition=Pick<PipelineDefinition,'inputs'|'outputs'|'acceptance'|'requireExecution'>
export function stageContract(def:PipelineContractDefinition,stage:PipelineStage){return TaskContractSchema.parse({...(stage==='analyze'&&def.acceptance?{acceptance:def.acceptance}:{}),submission:'tool',resultType:stage==='check'?'data-summary':stage==='analyze'?'model-metrics':'review',inputs:stage==='review'?def.outputs:def.inputs,outputs:stage==='analyze'?def.outputs:[],access:stage==='analyze'?(def.requireExecution?'workspace-exec':'workspace-write'):'read-only',requireExecution:stage==='analyze'&&def.requireExecution,requireReview:stage!=='analyze'})}
const pipelineShape={namespace:z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).optional(),version:z.literal(1),requestId:z.string().min(1).max(512),requestFingerprint:z.string().min(1).max(100).optional(),budgetGeneration:z.number().int().min(0).max(16).optional(),definition:PipelineDefinitionSchema,settingsByStage:z.object({check:TaskSettingsSchema,analyze:TaskSettingsSchema,review:TaskSettingsSchema}).strict(),status:z.enum(['running','blocked','interrupted','completed','cancelled']),stage:PipelineStageSchema,round:z.number().int().min(0).max(2),currentTaskId:text,taskIds:z.array(text).min(1).max(16),acknowledgedTaskIds:z.array(text).max(16).optional(),stateRevision:z.number().int().positive(),startedAt:z.number().finite(),updatedAt:z.number().finite(),endedAt:z.number().finite().optional(),reason:text.optional(),routeSync:z.enum(['pending','applied','conflict'])}
const PipelineObject=z.object(pipelineShape).strict()
export const SciencePipelineSchema=PipelineObject.superRefine((p,ctx)=>{
 if(p.round>p.definition.maxRevisions||!p.taskIds.includes(p.currentTaskId)||new Set(p.taskIds).size!==p.taskIds.length)ctx.addIssue({code:'custom',message:'流程阶段/修正记录冲突'})
 for(const stage of ['check','analyze','review'] as const)if(JSON.stringify(p.settingsByStage[stage].contract)!==JSON.stringify(stageContract(p.definition,stage)))ctx.addIssue({code:'custom',message:'冻结契约与流程定义不一致'})
 if(p.definition.initialVersions)for(const stage of ['check','analyze'] as const)if(!p.settingsByStage[stage].versions||!sameFileVersions(p.definition.initialVersions,p.settingsByStage[stage].versions.inputs))ctx.addIssue({code:'custom',message:'冻结内容版本与流程定义不一致'})
})
export type SciencePipeline=z.infer<typeof SciencePipelineSchema>
export const PipelineSummarySchema=PipelineObject.omit({definition:true,settingsByStage:true,requestFingerprint:true}).extend({contentVersionBound:z.boolean().optional(),maxRevisions:z.number().int().min(0).max(2),route:z.object({routeId:text,revision:z.number().int().positive(),stepId:text}).strict()})
export function publicPipeline(p:SciencePipeline){const {definition,settingsByStage:_settings,requestFingerprint:_fingerprint,...facts}=p;return{...facts,contentVersionBound:!!definition.initialVersions,maxRevisions:definition.maxRevisions,route:{routeId:definition.route.routeId,revision:definition.route.revision,stepId:definition.stepId}}}
