import {z} from 'zod'
import {TaskArrangementSchema,serializeTaskArrangement,parseTaskArrangement,type TaskArrangement} from '../protocol/task-arrangement.js'
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
  "现在是「先出方案」：你只能看、不能改。写文件、run_code、装包、派子 agent 都会被拒——被拒了不要换个办法再试，把那一步写进方案。",
  "要了解数据：read 看小的文本文件；inspect_data 看表格的结构（行列数、列类型、缺失、前几行、单变量分布）。不做相关、不拟合模型——定方案之前不看结果。",
  `想清楚之后调用 propose_plan 交方案。方案是 markdown，必须有这五个二级标题：${必填小节.map((h) => `「## ${h}」`).join("")}。`,
  "「## 产物」下每行一个产物，路径写在反引号里，照项目的科研目录约定落位（图 figures/、表 results/tables/、模型 results/models/、报告 results/reports/、脚本 analysis/scripts/）。",
  "用户要求自动安排时，根据具体任务、数据、输出和依赖自主决定任务块数与角色，使用 arrangement 提交结构。简单任务可以一块；不得固定拆成三块。每块说明目标、输入、输出、依赖与验收；并行必须独立且不能共写目标，审阅必须单列不同角色。缺信息写 questions 等用户补充。任务数不是 Agent 数。",
  "交完方案这一轮就结束了，等用户看。用户说要改，就改完再交一版。",
]

export function createProposePlanTool(opts: {
  /** 交给运行时：记进方案簿、发 `plan` 事件。回第几版 */
  requireArrangement?:()=>boolean
  executionAgents?:()=>{name:string;description:string;tools?:string[]}[]
  交: (toolCallId: string, 方案: { title: string; plan: string }) => { version: number }
}) {
  return {
    name: 出方案工具名,
    label: 出方案工具名,
    description:
      "先出方案时，把分析方案交给用户审。用户批了才开始执行。" +
      `plan 是 markdown，必须有五个二级标题：${必填小节.join("、")}；「产物」一节里每个产物的路径写在反引号里。`,
    promptSnippet: "propose_plan：先出方案时把分析方案交给用户审",
    promptGuidelines: [...方案期指引,...(opts.executionAgents?[
      '自动安排应使用 dispatch="team-v1"，每项 execution={agent,contract}，最多 8 项。agent 必须来自下列名册；任务 inputs/outputs 与 contract 相同，contract.submission="tool"。只读使用 read-only，写声明产物使用 workspace-write，需要实际运行才使用 workspace-exec/requireExecution。独立审阅必须单独成员、只读 resultType="review" 且没有输出文件；报告写入交给执行任务。缺信息保留 questions，不能发明路径、科学阈值或扩大工具权限。',
      '可用执行者：'+JSON.stringify(opts.executionAgents()),
    ]:[])],
    parameters: Type.Object({
      title: Type.String({ description: "一句话标题，会成为存档文件名的一部分" }),
      plan: Type.String({ description: "方案全文（markdown，五个必填二级标题）" }),
      arrangement: Type.Optional(Type.Unsafe<TaskArrangement>(z.toJSONSchema(TaskArrangementSchema))),
    }),
    async execute(toolCallId: string, params: { title?: unknown; plan?: unknown; arrangement?:unknown }, signal?: AbortSignal): Promise<ToolResult> {
      if(signal?.aborted)return text('本轮已停止，方案未提交。',true)
      const title = typeof params.title === "string" ? params.title.trim() : ""
      let plan = typeof params.plan === "string" ? params.plan.trim() : ""
      if (!title) return text("title 是空的。给方案起一句话的标题再交。", true)
      const 缺 = 缺的小节(plan)
      if (缺.length > 0) {
        return text(`方案缺这几节：${缺.map((h) => `「## ${h}」`).join("")}。补齐再交（二级标题要一字不差）。`, true)
      }
      if(params.arrangement!==undefined){
        const arrangement=TaskArrangementSchema.safeParse(params.arrangement)
        if(!arrangement.success)return text('任务安排无效：'+arrangement.error.issues.map(i=>i.message).join('；'),true)
        if(parseTaskArrangement(plan).state!=='absent')return text('请仅通过 arrangement 提交任务结构，不要在 plan 中重复任务安排节。',true)
        plan+='\n\n'+serializeTaskArrangement(arrangement.data)
      }
      const parsed=parseTaskArrangement(plan)
      if(opts.requireArrangement?.()&&parsed.state==='absent')return text('自动安排请求必须提交 arrangement，任务块数由具体方案决定，不能省略分工与依赖。',true)
      if(parsed.state==='invalid')return text('任务安排无效：'+parsed.reason,true)
      if(opts.executionAgents&&opts.requireArrangement?.()&&parsed.state==='valid'&&!parsed.arrangement.questions.length&&!parsed.arrangement.dispatch)return text('自动安排需要可执行绑定：dispatch=team-v1，并为每项提供名册中的 agent 和冻结 contract。',true)
      if(params.arrangement!==undefined&&parsed.state!=='valid')return text('任务安排未能保存到正文，请检查未闭合的 Markdown 代码块。',true)
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
