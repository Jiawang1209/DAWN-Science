import { z } from 'zod'

export const PermissionTierSchema = z.enum(['deny-risky', 'ask-risky', 'allow-all'])
export const SessionPermissionValueSchema = z.enum(['inherit', 'deny-risky', 'ask-risky', 'allow-all'])
export const SessionPermissionSchema = z.object({
  current: SessionPermissionValueSchema,
  effective: PermissionTierSchema,
}).strict()
export type SessionPermission = z.infer<typeof SessionPermissionSchema>
export type SessionPermissionValue = SessionPermission['current']
