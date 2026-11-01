import { z } from "zod"

/** Host-issued evidence of instruction text delivered to an agent, never execution or validation. */
export const SkillReadSchema = z.object({
  name: z.string().min(1).max(512),
  manifestPath: z.string().min(1).max(8192),
  resourcePath: z.string().min(1).max(8192),
  scope: z.enum(["project", "global", "builtin"]),
  via: z.enum(["use_skill", "read", "manual", "acp", "resource"]),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  partial: z.boolean(),
}).strict()

export type SkillReadReceipt = z.infer<typeof SkillReadSchema>
