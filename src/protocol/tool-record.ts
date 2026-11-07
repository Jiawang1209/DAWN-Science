import {z} from 'zod'

/** Internal Pi record coordinates; never an arbitrary filesystem path. */
export const ToolRecordRefSchema=z.object({
 file:z.string().max(240).regex(/^[\w.-]+\.jsonl$/),
 callEntry:z.string().min(1).max(128),
 resultEntry:z.string().min(1).max(128),
 payloadSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 evidenceTagSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict()
export type ToolRecordRef=z.infer<typeof ToolRecordRefSchema>

export const ToolRecordRequestSchema=z.object({
 sessionId:z.string().min(1),
 toolCallId:z.string().min(1).max(512),
 target:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('run'),id:z.string().min(1),epoch:z.number().int().nonnegative()}).strict(),
  z.object({kind:z.literal('task'),teamId:z.string().min(1).max(128),id:z.string().min(1),attemptId:z.string().min(1)}).strict(),
 ]),
}).strict()
export type ToolRecordTarget=z.infer<typeof ToolRecordRequestSchema>['target']
export const ToolRecordResponseSchema=z.discriminatedUnion('state',[
 z.object({state:z.literal('unavailable')}).strict(),
 z.object({state:z.literal('available'),input:z.string().max(8192),output:z.string().max(16384),evidenceTag:z.string().max(4096).optional(),clipped:z.boolean()}).strict(),
])
export type ToolRecordResponse=z.infer<typeof ToolRecordResponseSchema>
