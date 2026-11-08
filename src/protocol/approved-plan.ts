/** Immutable link; live execution and receipts remain in the existing Team records. */
import {z} from 'zod'
import {FileVersionsSchema} from './file-versions.js'
export const ApprovedPlanBindingSchema=z.object({
 version:z.literal(1),owner:z.string().min(1),planId:z.string().min(1),planVersion:z.number().int().positive(),
 markdownHash:z.string().regex(/^[a-f0-9]{64}$/),teamId:z.string().regex(/^plan_[a-f0-9]{24}$/),externalInputs:FileVersionsSchema,
 tasks:z.array(z.object({planTaskId:z.string().min(1),taskId:z.string().min(1),memberName:z.string().min(1),review:z.boolean().optional()}).strict()).min(1).max(8),
}).strict()
export type ApprovedPlanBinding=z.infer<typeof ApprovedPlanBindingSchema>
