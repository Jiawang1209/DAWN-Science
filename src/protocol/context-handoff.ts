import {z} from 'zod'
import {TaskVersionsSchema} from './file-versions.js'
const id=z.string().min(1).max(512)
export const HandoffSelectionSchema=z.object({recentMessages:z.number().int().min(1).max(8),messageIds:z.array(id).min(1).max(8).optional(),routeStepId:id.optional(),acceptedChildIds:z.array(id).min(1).max(4).optional()}).strict().superRefine((v,c)=>{
 if(v.messageIds&&(v.messageIds.length!==v.recentMessages||new Set(v.messageIds).size!==v.messageIds.length)||v.acceptedChildIds&&new Set(v.acceptedChildIds).size!==v.acceptedChildIds.length)c.addIssue({code:'custom',message:'交接消息数量或引用身份重复'})
})
export type HandoffSelection=z.infer<typeof HandoffSelectionSchema>
const original=z.object({
 version:z.literal(1),sourceSessionId:z.string().min(1).max(512),createdAt:z.number().finite(),requestedMessages:z.number().int().min(1).max(8),
 entries:z.array(z.object({id:z.string().min(1).max(512),role:z.enum(['user','assistant']),text:z.string().min(1).max(16384)}).strict()).min(1).max(8),
 bytes:z.number().int().min(1).max(16384),sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const HandoffReferenceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('route'),routeId:id,revision:z.number().int().positive(),stepId:id,text:z.string().min(1).max(32768),state:z.literal('record-not-approval')}).strict(),
 z.object({kind:z.literal('receipt'),childId:id,epoch:z.number().int().positive(),receiptSha256:z.string().regex(/^[a-f0-9]{64}$/),versions:TaskVersionsSchema,state:z.literal('historical-current-unverified')}).strict(),
])
export const ContextHandoffSchema=z.union([original,original.extend({version:z.literal(2),selection:HandoffSelectionSchema,references:z.array(HandoffReferenceSchema).max(5),envelopeBytes:z.number().int().positive().max(65536)}).strict()])
export type ContextHandoff=z.infer<typeof ContextHandoffSchema>
