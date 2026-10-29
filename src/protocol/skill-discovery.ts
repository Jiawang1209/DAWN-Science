import {z} from 'zod'

export const SkillSourceSchema=z.object({id:z.string(),label:z.string(),url:z.string()}).strict()
export const SkillOriginSchema=z.object({
  provider:z.literal('github'),repository:z.string(),sourceUrl:z.string(),ref:z.string(),
  commit:z.string().regex(/^[a-f0-9]{40}$/),path:z.string(),packageSha256:z.string().regex(/^[a-f0-9]{64}$/),
  installedAt:z.string(),runtimeVerification:z.literal('not_verified'),
}).strict()
export const SkillCandidateSchema=z.object({
  key:z.string(),name:z.string(),description:z.string(),sourceLabel:z.string(),url:z.string(),
  repository:z.string(),ref:z.string(),commit:z.string().regex(/^[a-f0-9]{40}$/),path:z.string(),
  format:z.enum(['valid','invalid']),issues:z.array(z.string()),dependencies:z.array(z.string()),license:z.string(),
  runtimeVerification:z.literal('not_verified'),
}).strict()
export const SkillCatalogSchema=z.object({sources:z.array(SkillSourceSchema),skills:z.array(SkillCandidateSchema),problems:z.array(z.string())}).strict()
export const SkillPreviewSchema=z.object({
  previewId:z.string(),skill:SkillCandidateSchema,body:z.string(),
  files:z.array(z.object({path:z.string(),bytes:z.number().int().nonnegative()}).strict()),
  packageSha256:z.string(),expiresAt:z.string(),
}).strict()
export const SkillPreviewFileSchema=z.object({path:z.string(),bytes:z.number(),text:z.string().optional(),notice:z.string().optional()}).strict()
export const SkillInstallSchema=z.object({name:z.string(),dest:z.string(),origin:SkillOriginSchema}).strict()
export type SkillSource=z.infer<typeof SkillSourceSchema>
export type SkillOrigin=z.infer<typeof SkillOriginSchema>
export type SkillCandidate=z.infer<typeof SkillCandidateSchema>
export type SkillCatalog=z.infer<typeof SkillCatalogSchema>
export type SkillPreview=z.infer<typeof SkillPreviewSchema>
export type SkillPreviewFile=z.infer<typeof SkillPreviewFileSchema>
export type SkillInstall=z.infer<typeof SkillInstallSchema>

const githubInput={url:z.string().min(1).max(2000),ref:z.string().min(1).max(200).optional()}
export const skillDiscoveryOperations={
  searchSkillCatalog:{request:z.object({query:z.string().max(500),source:z.string().optional()}).strict(),response:SkillCatalogSchema},
  inspectGithubSkills:{request:z.object(githubInput).strict(),response:SkillCatalogSchema},
  previewGithubSkill:{request:z.object({...githubInput,path:z.string().max(1000)}).strict(),response:SkillPreviewSchema},
  readSkillPreviewFile:{request:z.object({previewId:z.string(),path:z.string().max(1000)}).strict(),response:SkillPreviewFileSchema},
  discardSkillPreview:{request:z.object({previewId:z.string()}).strict(),response:z.object({discarded:z.literal(true)}).strict()},
  installGithubSkill:{request:z.object({previewId:z.string(),to:z.enum(['global','project']),projectId:z.string().optional()}).strict(),response:SkillInstallSchema,mutating:true},
  getSkillOrigin:{request:z.object({filePath:z.string()}).strict(),response:z.object({origin:SkillOriginSchema.optional()}).strict()},
} as const
