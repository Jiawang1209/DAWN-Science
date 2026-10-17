import { z } from "zod"

/** 卡片字段独立于可截断的工具正文，随转录快照与增量同步。 */
export const CaseResultSchema = z.object({
  case_id: z.string().min(1),
  title: z.string().optional(),
  language: z.string().optional(),
  summary: z.string().optional(),
  cover: z.string().optional(),
}).strict()

export type 案例 = z.infer<typeof CaseResultSchema>
