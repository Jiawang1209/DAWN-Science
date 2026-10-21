import { z } from "zod"
export const TransferEntrySchema = z.object({
  id: z.string(), path: z.string(), kind: z.enum(["file", "directory", "other"]),
  state: z.enum(["queued", "running", "completed", "failed", "conflict", "skipped", "cancelled", "interrupted"]),
  size: z.number().int().nonnegative(), transferred: z.number().int().nonnegative(),
  sourceMtime: z.number().optional(), source: z.string().optional(), error: z.string().optional(), target: z.string().optional(),
}).strict()
export const TransferBatchSchema = z.object({
  id: z.string(), connectionId: z.string(), server: z.string(), direction: z.enum(["upload", "download"]),
  source: z.string(), sources: z.array(z.string()).optional(), target: z.string(), targetParent: z.string(), createdAt: z.string(),
  state: z.enum(["scanning", "running", "completed", "partial", "failed", "cancelled", "interrupted"]),
  total: z.number().nonnegative(), transferred: z.number().nonnegative(),
  counts: z.object({ files: z.number(), completedFiles: z.number().optional(), directories: z.number(), completed: z.number(), failed: z.number(), conflict: z.number(), skipped: z.number(), cancelled: z.number() }).strict(),
  error: z.string().optional(),
}).strict()
export const DirectoryTransferRequest = z.object({ connectionId: z.string().min(1), direction: z.enum(["upload", "download"]), source: z.string().min(1), targetParent: z.string().optional() }).strict()
export type TransferEntry = z.infer<typeof TransferEntrySchema>
export type TransferBatch = z.infer<typeof TransferBatchSchema>
export type TransferStart = { connectionId: string; direction: "upload" | "download"; source: string; targetParent: string; sources?: string[] }
export const TransferDetailSchema = z.object({ batch: TransferBatchSchema, entries: z.array(TransferEntrySchema), entryCount: z.number().int().nonnegative() }).strict()
