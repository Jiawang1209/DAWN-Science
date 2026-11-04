/** Host-owned content identities. A version record does not imply retained file bytes. */
import {z} from 'zod'
import {WorkspaceRelativePathSchema} from './analysis-route.js'
export const FileVersionSchema=z.object({path:WorkspaceRelativePathSchema,sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative().safe(),observationId:z.string().min(1).max(512).optional(),versionId:z.string().min(1).max(512).optional()}).strict()
export const FileVersionsSchema=z.array(FileVersionSchema).max(64).superRefine((files,ctx)=>{if(new Set(files.map(f=>f.path)).size!==files.length)ctx.addIssue({code:'custom',message:'内容版本路径重复'})})
export const TaskInputVersionsSchema=z.object({version:z.literal(1),inputs:FileVersionsSchema}).strict()
export const TaskVersionsSchema=TaskInputVersionsSchema.extend({outputs:FileVersionsSchema})
export type FileVersion=z.infer<typeof FileVersionSchema>
export type TaskVersions=z.infer<typeof TaskVersionsSchema>
export function sameFileVersions(a:readonly FileVersion[],b:readonly FileVersion[]):boolean {
 return a.length===b.length&&a.every(file=>b.some(other=>file.path===other.path&&file.sha256===other.sha256&&file.bytes===other.bytes))
}
