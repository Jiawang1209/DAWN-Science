/**
 * 给 agent 的数据工具（2026-08-14）。
 *
 * ## 它替掉的是什么
 *
 * 在这之前，agent 想知道一份数据长什么样，只能用 `read` 把文件读进来——
 * **于是 CSV 的前几十行原样进了上下文**。那有三个坏处：
 * 占掉大量 token、模型要自己数列、而「有多少行、哪列缺得多」这类问题
 * 它只能**估**（估出来的数看起来和真的一样）。
 *
 * 这个工具给的是**算出来的摘要**：行列数、每列的推断类型、每列缺多少。
 * 数是数出来的，不是模型看几行猜的——这正是不变式 5 的方向：
 * **事实层的东西由事实层算**。
 *
 * ## 为什么不起内核
 *
 * 第一版**纯本地解析**，复用 `files/table.ts`（那一层有 22 条用例）。
 * 起内核意味着人得先配好 Python 或 R，而「这份数据有多少行」
 * 不该需要一个解释器才能回答。
 *
 * 均值、分位数、相关性这些**要算的**统计量确实需要内核，
 * 那是下一步的事——各上各的生态（pandas / dplyr），但工具名只有一套。
 */
import { Type } from "typebox"
import { readFileForPreview } from "../files/access.js"
import { UserFacingError } from "../errors.js"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {}),
  details: undefined,
})

/** 顺带给几行样子。**只给 3 行**——要的是「长什么样」，不是把数据搬进上下文 */
const 样例行数 = 3

const parameters = Type.Object({
  path: Type.String({
    description: "数据文件在工作区里的相对路径，例如 data/raw/samples.csv",
  }),
})

interface Params {
  path?: unknown
}

export function createDescribeDatasetTool(opts: { workspace: string }) {
  return {
    name: "describe_dataset",
    label: "describe_dataset",
    description:
      "读一份表格数据（csv / tsv）的结构：行列数、每列的推断类型与缺失个数，" +
      `外加前 ${样例行数} 行样子。**要了解一份数据先用这个，不要用 read 把整个文件读进来**——` +
      "那会占掉大量上下文，而且行数与缺失个数只能靠估。",
    parameters,

    async execute(_toolCallId: string, params: Params): Promise<ToolResult> {
      const p = typeof params.path === "string" ? params.path.trim() : ""
      if (!p) return text("要给 path：数据文件在工作区里的相对路径。", true)

      let 读到: ReturnType<typeof readFileForPreview>
      try {
        读到 = readFileForPreview(opts.workspace, p)
      } catch (e) {
        /**
         * **路径守卫的拒绝要原样说出来**（它是 `UserFacingError`）：
         * 「越界了」与「文件不存在」是两回事，笼统回一句「读不了」
         * 会让模型反复换着法子试同一条死路。
         */
        return text(
          e instanceof UserFacingError ? e.message : `读不了 ${p}：${String(e)}`,
          true,
        )
      }

      if (读到.kind !== "table") {
        /**
         * **不是表格就明说是什么**，并指一条路——
         * 模型据此改用 `read`，而不是对着这个工具反复重试。
         */
        return text(
          `${p} 不是分隔文本（识别为 ${读到.mediaType}），这个工具只读 csv / tsv。` +
            `要看它的内容请用 read。`,
          true,
        )
      }

      const t = 读到.table
      const 行数 = t.totalRows === undefined ? "未知（文件太大，没读完）" : String(t.totalRows)
      const 列 = t.columns
        .map((c) => `  - ${c.name}：${c.inferred}${c.missing > 0 ? `，缺 ${c.missing}` : ""}`)
        .join("\n")
      const 样例 = t.rows
        .slice(0, 样例行数)
        .map((r) => `  ${r.join(" | ")}`)
        .join("\n")

      return text(
        [
          `${p}`,
          `行数：${行数}　列数：${t.columns.length}　分隔符：${t.delimiter === "\t" ? "制表符" : t.delimiter}`,
          "",
          "列（类型是**推断**的，csv 没有 schema）：",
          列 || "  （没有列）",
          "",
          `前 ${Math.min(样例行数, t.rows.length)} 行：`,
          样例 || "  （没有数据行）",
          // **缺失计数只覆盖读到的那些行**：说清楚，否则它会被当成全表的数
          `\n注：缺失个数是在读到的前 ${t.rowsRead} 行里数的。` +
            (t.truncated ? `${t.truncated}。` : ""),
        ].join("\n"),
      )
    },
  }
}
