/** Client-safe versioned recipe parameters. Method/units/evidence are user decisions. */
import {z} from 'zod'
import {NumericValidationSchema} from './science-acceptance.js'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
const text=z.string().trim().min(1).max(2000)
export const ScienceTemplateSchema=z.discriminatedUnion('id',[
 z.object({id:z.literal('tabular-ecology'),version:z.literal(1),language:z.enum(['python','r']),method:text,units:z.string().trim().max(2000),unitStatus:z.literal('missing').optional(),missingValues:text,validation:NumericValidationSchema.omit({dataPath:true}).optional()}).strict().superRefine((v,c)=>{
  if(v.unitStatus==='missing'?(!!v.units||!!v.validation):!v.units)c.addIssue({code:'custom',message:'单位未提供时须显式标记missing、单位留空且不能配置数值核验；否则须提供单位'})
 }),
 z.object({id:z.literal('figure-reproduction'),version:z.literal(1),language:z.enum(['python','r']),method:text,evidencePath:WorkspaceRelativePathSchema,citation:text,page:text,targetFigure:text,transformations:text}).strict(),
])
export type ScienceTemplate=z.infer<typeof ScienceTemplateSchema>
