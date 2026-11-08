import {z} from 'zod'
import {ArtifactSchema} from './entities.js'
import {FileVersionSchema} from './file-versions.js'
import {ToolRecordRequestSchema} from './tool-record.js'
/** Accepted content identity plus its exact owner and run/task receipt. Not a file-creation claim. */
export const TaskArtifactSchema=ArtifactSchema.pick({path:true,kind:true,exists:true}).extend({
 label:z.string().max(512).optional(),ownerSessionId:z.string().min(1),target:ToolRecordRequestSchema.shape.target,version:FileVersionSchema,
 source:z.enum(['live','disk']),acceptance:z.enum(['accepted','historical']),scope:z.enum(['stage','final']),
}).strict().refine(a=>a.path===a.version.path,'产物路径与验收版本不一致').refine(a=>a.acceptance!=='accepted'||a.source==='live','历史来源不能声称当前验收')
export type TaskArtifact=z.infer<typeof TaskArtifactSchema>
export const TaskArtifactCheckSchema=z.object({state:z.enum(['matches','changed','unavailable']),checkedAt:z.iso.datetime(),reason:z.string().max(1000).optional()}).strict()
export type TaskArtifactCheck=z.infer<typeof TaskArtifactCheckSchema>
