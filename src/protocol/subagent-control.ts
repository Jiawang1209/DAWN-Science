import {z} from 'zod'
export const SteeringReceiptSchema = z.object({
  id:z.string(), childId:z.string(), requestId:z.string().min(1).max(512), epoch:z.number().int().positive(),
  text:z.string().trim().min(1).max(16*1024), status:z.enum(['accepted','applied','interrupted']),
  createdAt:z.number().finite(), updatedAt:z.number().finite(), reason:z.string().optional(),
}).strict()
export type SteeringReceipt = z.infer<typeof SteeringReceiptSchema>

export const SubagentControlActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect')}).strict(),
 z.object({action:z.literal('steer'),expectedEpoch:z.number().int().positive(),requestId:z.string().min(1).max(512),text:z.string().trim().min(1).max(16*1024)}).strict(),
 z.object({action:z.literal('interrupt')}).strict(),
])
export type SubagentControlAction=z.infer<typeof SubagentControlActionSchema>
export const SubagentControlStateSchema=z.object({childId:z.string().optional(),epoch:z.number().int().nonnegative().optional(),phase:z.enum(['idle','queued','running','stopping','drained']).optional(),canSteer:z.boolean(),canInterrupt:z.boolean(),reason:z.string().optional(),receipts:z.array(SteeringReceiptSchema).max(128)}).strict()
export type SubagentControlState=z.infer<typeof SubagentControlStateSchema>
