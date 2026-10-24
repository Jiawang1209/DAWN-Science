import { z } from 'zod'
import { PlanItemSchema } from './events.js'

export const SessionPlanSchema = z.object({ planning: z.boolean(), plan: PlanItemSchema.optional() }).strict()
export type SessionPlan = z.infer<typeof SessionPlanSchema>
/** Private CLI requests expose no arbitrary config, session or prompt fields. */
export const TerminalPlanRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }).strict(),
  z.object({ action: z.literal('set'), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('answer'), planId: z.string().min(1), decision: z.enum(['approve', 'discard']) }).strict(),
  z.object({ action: z.literal('execute'), planId: z.string().min(1) }).strict(),
])
