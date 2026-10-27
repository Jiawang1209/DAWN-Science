import { z } from "zod"

export const FileContentSchema = z.discriminatedUnion("kind", [
  /**
   * **分隔文本读成一张表**（2026-08-14）。
   *
   * 此前 `.csv` 落在 `text` 那一支上，界面上是一坨逗号原文——
   * 一个叫 DAWN **Science** 的应用打开数据文件却看不见数据。
   *
   * **类型是推断的，字段名里就写着 `inferred`**：CSV 没有 schema，
   * 把猜出来的东西摆成事实，下一步就会有人拿它当依据（不变式 5）。
   */
  z
    .object({
      kind: z.literal("table"),
      mediaType: z.string().min(1),
      bytes: z.int().min(0),
      table: z
        .object({
          columns: z.array(
            z
              .object({
                name: z.string(),
                inferred: z.enum([
                  "数值",
                  "整数",
                  "布尔",
                  "日期",
                  "文本",
                  "空",
                ]),
                /** 读到的那些行里缺了多少个 */
                missing: z.int().min(0),
              })
              .strict(),
          ),
          /** 前若干行，**每格都是原文**——转换过的东西不该冒充原始数据 */
          rows: z.array(z.array(z.string())),
          rowsRead: z.int().min(0),
          /** **只有完整读完才有**：没读完却报一个总数，那个数是假的 */
          totalRows: z.int().min(0).optional(),
          delimiter: z.enum([",", "\t", ";"]),
          /** 截断要出声（规格 7.5）。缺席 = 完整读完了 */
          truncated: z.string().min(1).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pdf"),
      mediaType: z.literal("application/pdf"),
      /** 字节。**经守卫过的后端取回，不给渲染进程 `file://`** */
      base64: z.string(),
      bytes: z.int().min(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      mediaType: z.string(),
      text: z.string(),
      bytes: z.int().min(0),
      /** 截断要说清**省了多少**（规格 7.5） */
      truncated: z
        .object({ originalBytes: z.int(), keptBytes: z.int() })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("image"),
      mediaType: z.string(),
      /** base64。**不给 file:// 路径**——那等于把守卫的判断权交给渲染进程 */
      base64: z.string(),
      bytes: z.int().min(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("other"),
      mediaType: z.string(),
      bytes: z.int().min(0),
      reason: z.string().min(1),
    })
    .strict(),
])
