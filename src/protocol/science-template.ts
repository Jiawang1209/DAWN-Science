/** Client-safe versioned recipe parameters. Method/units/evidence are user decisions. */
import {z} from 'zod'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
const text=z.string().trim().min(1).max(2000)
export const ScienceTemplateSchema=z.discriminatedUnion('id',[
 z.object({id:z.literal('tabular-ecology'),version:z.literal(1),language:z.enum(['python','r']),method:text,units:text,missingValues:text}).strict(),
 z.object({id:z.literal('figure-reproduction'),version:z.literal(1),language:z.enum(['python','r']),method:text,evidencePath:WorkspaceRelativePathSchema,citation:text,page:text,targetFigure:text,transformations:text}).strict(),
])
export type ScienceTemplate=z.infer<typeof ScienceTemplateSchema>
