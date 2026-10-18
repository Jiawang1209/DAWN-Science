/** Analysis delivery is a user-selected package, not a model-reported success. */
import { z } from "zod";
export const DeliveryPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !p.includes("\\") &&
      !p.includes("\0") &&
      !p.startsWith("/") &&
      !/^[a-zA-Z][\w+.-]*:/.test(p) &&
      p
        .split("/")
        .every(
          (s) => s !== "" && s !== "." && s !== ".." && !s.startsWith("."),
        ),
    "仅支持工作区内的非隐藏相对路径",
  );
export const DeliveryComparisonSchema = z
  .object({
    source: DeliveryPathSchema,
    output: DeliveryPathSchema,
    kind: z.enum(["table", "text", "json", "image"]),
  })
  .strict();
export const DeliveryPlanSchema = z
  .object({
    language: z.enum(["python", "r"]),
    script: DeliveryPathSchema,
    args: z.array(z.string().max(2048)).max(30),
    comparisons: z.array(DeliveryComparisonSchema).max(30),
    note: z.string().max(4000),
  })
  .strict();
export const DeliveryGenerationSchema = z
  .object({
    readme: z.string().trim().min(10).max(80_000),
    interpretation: z.string().trim().min(20).max(100_000),
    scripts: z
      .array(
        z
          .object({
            path: DeliveryPathSchema.refine((p) => /\.(py|r)$/i.test(p)),
            content: z.string().min(1).max(100_000),
          })
          .strict(),
      )
      .max(8),
    gaps: z.array(z.string().max(2000)).max(30),
    validation: DeliveryPlanSchema.optional(),
  })
  .strict();
export const DeliveryCreateSchema = z
  .object({
    requestId: z.string().regex(/^[\w-]{1,100}$/),
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((s) => !/[\x00-\x1f/\\]/.test(s), "名称不能包含路径分隔符"),
    paths: z.array(DeliveryPathSchema).min(1).max(60),
    references: z.array(DeliveryPathSchema).max(30),
    mode: z.enum(["organize", "validate"]),
  })
  .strict();
export const DeliveryVerifySchema = z
  .object({
    id: z.string().min(1),
    plan: DeliveryPlanSchema,
    tolerance: z.number().finite().min(0).max(0.01),
    outputsReviewed: z.literal(true),
  })
  .strict();
export const DeliveryRecordSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    workspace: z.string(),
    name: z.string(),
    directory: DeliveryPathSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    mode: z.enum(["organize", "validate"]),
    state: z.enum(["generating", "organized", "partial", "failed"]),
    model: z.string().optional(),
    error: z.string().optional(),
    gaps: z.array(z.string()),
    evidence: z.array(
      z
        .object({
          path: DeliveryPathSchema,
          state: z.enum(["read", "reference", "missing"]),
          bytes: z.number().optional(),
          sha256: z.string().optional(),
          note: z.string(),
          copyPath: DeliveryPathSchema.optional(),
        })
        .strict(),
    ),
    files: z.array(
      z
        .object({
          path: DeliveryPathSchema,
          role: z.enum([
            "readme",
            "interpretation",
            "script",
            "result",
            "manifest",
            "verification",
          ]),
        })
        .strict(),
    ),
    plan: DeliveryPlanSchema.optional(),
    verification: z
      .object({
        state: z.enum([
          "not_run",
          "awaiting_confirmation",
          "running",
          "passed",
          "partial",
          "failed",
        ]),
        note: z.string(),
        directory: DeliveryPathSchema.optional(),
        command: z.array(z.string()).optional(),
        exitCode: z.number().nullable().optional(),
        checks: z
          .array(
            z
              .object({
                path: z.string(),
                state: z.enum(["passed", "failed", "skipped"]),
                note: z.string(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict();
export type DeliveryRecord = z.infer<typeof DeliveryRecordSchema>;
export type DeliveryCreate = z.infer<typeof DeliveryCreateSchema>;
export type DeliveryPlan = z.infer<typeof DeliveryPlanSchema>;
export type DeliveryVerify = z.infer<typeof DeliveryVerifySchema>;
