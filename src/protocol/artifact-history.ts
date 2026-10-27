import { z } from "zod"
import {
  ArtifactPath,
  ObservationSchema,
  ExecutionSchema,
  RetainRequestSchema,
  RetainedResultSchema,
} from "../artifacts/model.js"
import { FileContentSchema } from "./file-content.js"
const session = { sessionId: z.string().min(1) }
const observation = z
  .object({ ...session, observationId: z.string().min(1) })
  .strict()
const group = z.object({ ...session, retainedId: z.string().min(1) }).strict()
export const artifactHistoryOperations = {
  getArtifactHistory: {
    request: z
      .object({
        ...session,
        path: ArtifactPath,
        offset: z.number().int().min(0).optional(),
      })
      .strict(),
    response: z
      .object({
        supported: z.boolean(),
        reason: z.string().optional(),
        observations: z.array(ObservationSchema),
      })
      .strict(),
    mutating: false,
  },
  getArtifactSource: {
    request: observation,
    response: z
      .object({
        observation: ObservationSchema,
        execution: ExecutionSchema.optional(),
        inputs: z.array(ObservationSchema),
      })
      .strict(),
    mutating: false,
  },
  checkArtifactCurrent: {
    request: observation,
    response: z
      .object({
        state: z.enum(["matched", "changed", "missing", "unchecked", "failed"]),
        note: z.string(),
      })
      .strict(),
    mutating: false,
  },
  retainArtifactResults: {
    request: RetainRequestSchema.extend(session).strict(),
    response: RetainedResultSchema,
    mutating: true,
  },
  captureAndRetainCurrent: {
    request: z
      .object({
        ...session,
        path: ArtifactPath,
        requestId: z.string().regex(/^[\w-]{1,100}$/),
        name: z.string().max(100),
        note: z.string().max(4000).optional(),
      })
      .strict(),
    response: RetainedResultSchema,
    mutating: true,
  },
  listRetainedResults: {
    request: z
      .object({ ...session, offset: z.number().int().min(0).optional() })
      .strict(),
    response: z
      .object({
        supported: z.boolean(),
        reason: z.string().optional(),
        results: z.array(RetainedResultSchema),
        limits: z
          .object({
            fileBytes: z.number(),
            groupBytes: z.number(),
            projectBytes: z.number(),
          })
          .optional(),
      })
      .strict(),
    mutating: false,
  },
  readRetainedArtifact: {
    request: group.extend({ memberId: z.string().min(1) }).strict(),
    response: z
      .object({
        path: z.string(),
        sha256: z.string(),
        content: FileContentSchema,
      })
      .strict(),
    mutating: false,
  },
  deleteRetainedResult: {
    request: group.extend({ confirmed: z.literal(true) }).strict(),
    response: z.object({ deleted: z.literal(true) }).strict(),
    mutating: true,
  },
  cancelArtifactRetention: {
    request: z.object({ ...session, requestId: z.string().min(1) }).strict(),
    response: z.object({ cancelled: z.boolean() }).strict(),
    mutating: true,
  },
} as const
export type {
  ArtifactObservation,
  ArtifactExecution,
  RetainedResult,
} from "../artifacts/model.js"
