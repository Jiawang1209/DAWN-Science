/** Human-confirmed planning inputs, not execution approval or model-authored authority. */
import {z} from 'zod'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
import {ScienceTemplateSchema} from './science-template.js'

const identity=z.string().trim().min(1).max(512).refine(value=>!/[\r\n\0]/.test(value),'身份必须为单行文本')
const path=WorkspaceRelativePathSchema.refine(value=>value.length<=512,'路径不能超过512字符')
const tabular=ScienceTemplateSchema.options[0].extend({language:z.literal('python')})
export const PlanningContractSelectionSchema=z.object({
 template:tabular,inputs:z.array(path).min(1).max(24),outputRoot:path,dataPath:path.optional(),
 requireExecution:z.boolean(),independentReview:z.boolean(),
 route:z.object({routeId:identity,revision:z.number().int().positive(),stepId:identity}).strict().optional(),
}).strict().superRefine((value,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message})
 if(new Set(value.inputs).size!==value.inputs.length)issue('输入路径重复')
 if(value.dataPath!==undefined&&!value.inputs.includes(value.dataPath))issue('dataPath必须属于声明输入')
 if(value.template.validation&&!value.dataPath)issue('数值核验需要声明dataPath')
 if(value.template.validation&&value.template.units!==value.template.validation.unit)issue('单位与数值核验单位不一致')
 const outputs=['analysis.py','result.json','report.md'].map(name=>`${value.outputRoot}/${name}`)
 if(outputs.some(output=>value.inputs.includes(output)))issue('产物不能覆盖声明输入')
 if(outputs.some(output=>output.length>512))issue('展开后的产物路径不能超过512字符')
})
export type PlanningContractSelection=z.infer<typeof PlanningContractSelectionSchema>
export const ConfirmedPlanningSourceSchema=PlanningContractSelectionSchema.safeExtend({
 version:z.literal(1),ownerSessionId:identity,revision:z.number().int().positive(),
 confirmedAt:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
export type ConfirmedPlanningSource=z.infer<typeof ConfirmedPlanningSourceSchema>
/** Host-owned link between one proposed plan and the confirmed planning source. */
export const PlanningSourceBindingSchema=z.object({revision:z.number().int().nonnegative(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict()
export type PlanningSourceBinding=z.infer<typeof PlanningSourceBindingSchema>
export const PlanningSourceStateSchema=z.object({revision:z.number().int().nonnegative(),source:ConfirmedPlanningSourceSchema.optional(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),issue:z.string().max(2000).optional()}).strict()
export type PlanningSourceState=z.infer<typeof PlanningSourceStateSchema>
