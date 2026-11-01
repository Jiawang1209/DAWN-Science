import { z } from 'zod'

const installed = { filePath: z.string().min(1), projectId: z.string().min(1).optional() }
const mode = z.enum(['model', 'manual', 'off'])
export const InstalledSkillFilesSchema = z.object({
  files: z.array(z.object({ path: z.string(), bytes: z.number().int().nonnegative() }).strict()),
  notices: z.array(z.string()),
}).strict()
export const InstalledSkillFileSchema = z.object({ path: z.string(), bytes: z.number().int().nonnegative(), text: z.string().optional(), notice: z.string().optional() }).strict()
export type InstalledSkillFiles = z.infer<typeof InstalledSkillFilesSchema>
export type InstalledSkillFile = z.infer<typeof InstalledSkillFileSchema>
export type SkillBulkResult = z.infer<typeof SkillBulkResultSchema>
const SkillBulkResultSchema = z.object({
  updated: z.array(z.string()),
  failed: z.array(z.object({ filePath: z.string(), reason: z.string() }).strict()),
}).strict()

export const skillManagementOperations = {
  listInstalledSkillFiles: {
    request: z.object(installed).strict(), response: InstalledSkillFilesSchema, mutating: false,
  },
  readInstalledSkillFile: {
    request: z.object({ ...installed, path: z.string().min(1).max(4000) }).strict(), response: InstalledSkillFileSchema, mutating: false,
  },
  setSkillTags: {
    request: z.object({ ...installed, tags: z.array(z.string().max(80)).max(40).optional(), reset: z.boolean().optional() }).strict()
      .refine(v => v.reset === true ? v.tags === undefined : v.tags !== undefined, 'Provide tags or reset, not both'),
    response: z.object({ tags: z.array(z.string()), tagsOverridden: z.boolean() }).strict(), mutating: true,
  },
  setSkillsInvocation: {
    request: z.object({ filePaths: z.array(z.string().min(1)).min(1).max(1000), mode, projectId: z.string().min(1).optional() }).strict(),
    response: SkillBulkResultSchema, mutating: true,
  },
  refreshSessionSkills: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: z.object({ count: z.number().int().nonnegative(), problems: z.array(z.object({ path: z.string(), reason: z.string() }).strict()) }).strict(), mutating: true,
  },
}
