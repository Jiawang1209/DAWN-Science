import { z } from "zod"

export const ArtifactPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !p.includes("\\") &&
      !p.includes("\0") &&
      !p.startsWith("/") &&
      !/^[a-z][\w+.-]*:/i.test(p) &&
      p
        .split("/")
        .every(
          (s) => s !== "" && s !== "." && s !== ".." && !s.startsWith("."),
        ),
    "产物路径必须是工作区内非隐藏文件",
  )
export const ScopeSchema = z.object({
  projectId: z.string().min(1),
  workspace: z.string().min(1),
  sessionId: z.string().min(1),
})
export type ArtifactScope = z.infer<typeof ScopeSchema>
export const ObservationSchema = ScopeSchema.extend({
  id: z.string(),
  fileId: z.string(),
  path: ArtifactPath,
  createdAt: z.string(),
  versionId: z.string().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  bytes: z.number().int().nonnegative().optional(),
  executionId: z.string().optional(),
  relation: z.enum([
    "read",
    "declared_input",
    "write",
    "changed",
    "late_capture",
  ]),
  attribution: z.enum([
    "direct",
    "observed",
    "ambiguous",
    "declared",
    "unknown",
  ]),
  gaps: z.array(z.string()),
})
export type ArtifactObservation = z.infer<typeof ObservationSchema>
export type ObservationInput = Pick<
  ArtifactObservation,
  "path" | "relation" | "attribution" | "gaps"
> &
  Partial<Pick<ArtifactObservation, "sha256" | "bytes" | "executionId">>
export const ExecutionSchema = ScopeSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  tool: z.string(),
  code: z.string().optional(),
  codeSha256: z.string(),
  language: z.string().optional(),
  status: z.enum(["pending", "captured", "partial", "failed", "interrupted"]),
  dispatch: z.enum([
    "not_dispatched",
    "dispatched",
    "completed",
    "failed",
    "unknown",
  ]),
  dispatchedAt: z.string().optional(),
  kernelId: z.string().optional(),
  sequence: z.number().int().optional(),
  environment: z.unknown().optional(),
  gaps: z.array(z.string()),
  log: z
    .object({
      head: z.string(),
      tail: z.string(),
      bytes: z.number(),
      omittedBytes: z.number(),
    })
    .optional(),
})
export type ArtifactExecution = z.infer<typeof ExecutionSchema>
export const RetainedMemberSchema = z.object({
  id: z.string(),
  observation: ObservationSchema,
  execution: ExecutionSchema.optional(),
  inputs: z.array(ObservationSchema).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
})
export const RetainedResultSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  requestId: z.string(),
  createdAt: z.string(),
  name: z.string(),
  note: z.string(),
  state: z.enum(["ready", "deleted"]),
  members: z.array(RetainedMemberSchema),
  deletedAt: z.string().optional(),
})
export type RetainedResult = z.infer<typeof RetainedResultSchema>
export const RetainRequestSchema = z
  .object({
    requestId: z.string().regex(/^[\w-]{1,100}$/),
    name: z.string().max(100),
    note: z.string().max(4000).optional(),
    members: z
      .array(
        z
          .object({
            observationId: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
export type RetainRequest = z.infer<typeof RetainRequestSchema>
export const DEFAULT_LIMITS = {
  codeBytes: 1024 * 1024,
  hashBytes: 64 * 1024 * 1024,
  captureBytes: 128 * 1024 * 1024,
  captureFiles: 200,
  hashMs: 5000,
  fileBytes: 50 * 1024 * 1024,
  groupBytes: 200 * 1024 * 1024,
  projectBytes: 1024 * 1024 * 1024,
  copyMs: 60000,
}
export type ArtifactLimits = typeof DEFAULT_LIMITS
