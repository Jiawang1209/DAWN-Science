/**
 * `propose_plan`：先出方案时，agent 把分析方案交给人审（2026-09-27，spec `2026-09-27-先出方案-design.md` §4.3）。
 *
 * - **只在方案期启用**（`NativeRuntime` 用 `setActiveToolsByName` 启停，与 `read_main_session` 同一条路）。
 * - **方案期指引就是它的 `promptGuidelines`**：pi 只在这件工具启用时把它们拼进系统提示——开关一关，指引跟着走，
 *   不必去改建会话时算一次的 `appendSystemPromptOverride`。
 * - 交完 `terminate: true`：这一轮到此为止，等人回话（pi-agent-core `AgentToolResult.terminate`）。
 */
import { Type } from "typebox"
import { 出方案工具名, 缺的小节, 必填小节 } from "../protocol/plan.js"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
  terminate?: boolean
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {}),
  details: undefined,
})

export const 方案期指引 = [
  "现在是「生成方案」：你只能看、不能改。写文件、run_code、装包、派子 agent 都会被拒——被拒了不要换个办法再试，把那一步写进方案。",
  "要了解数据：read 看小的文本文件；inspect_data 看表格的结构（行列数、列类型、缺失、前几行、单变量分布）。不做相关、不拟合模型——定方案之前不看结果。",
  `想清楚之后调用 propose_plan 交方案。方案是 markdown，必须有这五个二级标题：${必填小节.map((h) => `「## ${h}」`).join("")}。`,
  "「## 产物」下每行一个产物，路径写在反引号里，照项目的科研目录约定落位（图 figures/、表 results/tables/、模型 results/models/、报告 results/reports/、脚本 analysis/scripts/）。",
  "交完方案这一轮就结束了，等用户看。用户说要改，就改完再交一版。",
]

export function createProposePlanTool(opts: {
  /** 交给运行时：记进方案簿、发 `plan` 事件。回第几版 */
  交: (toolCallId: string, 方案: { title: string; plan: string }) => { version: number }
}) {
  return {
    name: 出方案工具名,
    label: 出方案工具名,
    description:
      "生成方案时，把分析方案交给用户审。用户批了才开始执行。" +
      `plan 是 markdown，必须有五个二级标题：${必填小节.join("、")}；「产物」一节里每个产物的路径写在反引号里。`,
    promptSnippet: "propose_plan：生成方案时把分析方案交给用户审",
    promptGuidelines: 方案期指引,
    parameters: Type.Object({
      title: Type.String({ description: "一句话标题，会成为存档文件名的一部分" }),
      plan: Type.String({ description: "方案全文（markdown，五个必填二级标题）" }),
    }),
    async execute(toolCallId: string, params: { title?: unknown; plan?: unknown }): Promise<ToolResult> {
      const title = typeof params.title === "string" ? params.title.trim() : ""
      const plan = typeof params.plan === "string" ? params.plan.trim() : ""
      if (!title) return text("title 是空的。给方案起一句话的标题再交。", true)
      const 缺 = 缺的小节(plan)
      if (缺.length > 0) {
        return text(`方案缺这几节：${缺.map((h) => `「## ${h}」`).join("")}。补齐再交（二级标题要一字不差）。`, true)
      }
      /**
       * 交不上（方案簿写盘失败等）要出声（规格 7.5）：原因原样回给模型，**不 terminate**——
       * 这一轮没有东西可等，停下来只会让人对着一张不存在的卡发呆。
       */
      let version: number
      try {
        version = opts.交(toolCallId, { title, plan }).version
      } catch (e) {
        return text(`方案没交上：${e instanceof Error ? e.message : String(e)}`, true)
      }
      return {
        ...text(`方案第 ${version} 版已交给用户。这一轮到此为止——等用户看；用户要改就改完再交一版。`),
        terminate: true,
      }
    },
  }
}
