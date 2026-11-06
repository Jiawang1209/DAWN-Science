import {z} from 'zod'
export const HandoffSelectionSchema=z.object({recentMessages:z.number().int().min(1).max(8)}).strict()
export type HandoffSelection=z.infer<typeof HandoffSelectionSchema>
export const ContextHandoffSchema=z.object({
 version:z.literal(1),sourceSessionId:z.string().min(1).max(512),createdAt:z.number().finite(),requestedMessages:z.number().int().min(1).max(8),
 entries:z.array(z.object({id:z.string().min(1).max(512),role:z.enum(['user','assistant']),text:z.string().min(1).max(16384)}).strict()).min(1).max(8),
 bytes:z.number().int().min(1).max(16384),sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type ContextHandoff=z.infer<typeof ContextHandoffSchema>
