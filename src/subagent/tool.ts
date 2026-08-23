/**
 * `subagent` 工具定义（①-B″ · S1）。
 *
 * 这是父会话看得见的那一面：模型调用它，它把活分给子进程。
 * 三件东西在这里汇合——**定义加载**（有哪些可选）、**执行器**（谁去跑）、
 * **账本**（每个子 agent 落一条 Run）。
 *
 * ## 描述是给模型读的，所以它必须说真话
 *
 * 工具描述里列出当前有哪些子 agent。**读不进来的定义也要列出来**——
 * 否则用户写错了 frontmatter，表现是「我明明建了这个 agent，它却不在列表里」，
 * 而模型和用户都无从知道为什么。这与 `definitions.ts` 不静默跳过是同一条纪律
 * 的下游：出了声，还得有人把声音传出去。
 *
 * ## 定义每次调用都重新读
 *
 * 学自 pi 的示例（*"Agents discovered fresh on each invocation
 * (allows editing mid-session)"*）。代价是每次多一次目录读取，
 * 换来的是「改完定义不用重启会话」。对手写 markdown 的东西，这个交换是划算的。
 */
import { Type } from "typebox"
import { loadSubagentsFrom, type DefinitionLoad, loadSubagentDefinitions } from "./definitions.js"
import {
  SubagentExecutor,
  SUBAGENT_LIMITS,
  type ChildFactory,
  type SubagentContext,
  type SubagentRequest,
  type SubagentResult,
} from "./executor.js"
import type { AgentEvent, SessionId } from "../runtime/types.js"

export interface SubagentToolOptions {
  sessionId: SessionId
  /** 定义从这里找：`<projectRoot>/.dawn/agents/*.md` */
  projectRoot: string
  /**
   * 三层目录（2026-08-22）：自带 / 你写的 / 项目。给了就按它读（项目 > 全局 > 自带），
   * 没给退回只读项目那一层（老行为）。`disabled` 的不给模型。
   */
  dirs?: readonly { dir: string; from: "builtin" | "global" | "project" }[] | undefined
  /** 自带的停没停（设置里那把键）；与 `dirs` 一起给 */
  自带停用?: ((name: string) => boolean) | undefined
  childOf: ChildFactory
  /**
   * 子进程规格里与任务无关的那一半（模型、凭证、工作区、agentDir）。
   * **必填**——少了它每个子 agent 都会报「模型不存在」，而那要跨进程才查得出来。
   */
  context: SubagentContext
  /** 账本要听的事件从这里出去 */
  emit: (event: AgentEvent) => void
}

const TaskItem = Type.Object({
  agent: Type.String({ description: "子 agent 的名字" }),
  task: Type.String({ description: "交给它的任务" }),
})

/**
 * 三种模式写成三组可选字段，**由 execute 校验「恰好给一组」**。
 *
 * 没写成可辨识联合，是因为多数模型对 `oneOf` 的遵守程度不如对
 * 「几个可选字段 + 描述里说清楚」——而这里选错的代价是一次白跑的子进程。
 * 校验放在 execute 里，**报错回给模型让它重试**（Spike A：schema 由引擎强制
 * 且带自动重试，我们只需把这一层的规则说清楚）。
 */
const parameters = Type.Object({
  agent: Type.Optional(Type.String({ description: "single 模式：用哪个子 agent" })),
  task: Type.Optional(Type.String({ description: "single 模式：任务内容" })),
  tasks: Type.Optional(
    Type.Array(TaskItem, {
      description: `parallel 模式：并发执行，最多 ${SUBAGENT_LIMITS.maxTasks} 个`,
    }),
  ),
  chain: Type.Optional(
    Type.Array(TaskItem, {
      description: "chain 模式：顺序执行，任务里可用 {previous} 引上一步的结果",
    }),
  ),
})

interface Params {
  agent?: string
  task?: string
  tasks?: { agent: string; task: string }[]
  chain?: { agent: string; task: string }[]
}

/** pi 的工具结果形状。**不引 pi 的类型**——这一层只需要形状对 */
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

export function createSubagentTool(opts: SubagentToolOptions) {
  const load = (): DefinitionLoad => {
    const r = opts.dirs ? loadSubagentsFrom(opts.dirs, { 自带停用: opts.自带停用 }) : loadSubagentDefinitions(opts.projectRoot)
    return { ...r, agents: r.agents.filter((a) => !a.disabled) }
  }

  return {
    name: "subagent",
    label: "subagent",
    description: describe(load()),
    parameters,

    async execute(toolCallId: string, params: Params): Promise<ToolResult> {
      const req = toRequest(params)
      if ("error" in req) return text(req.error, true)

      const { agents, problems } = load()
      const executor = new SubagentExecutor({
        childOf: opts.childOf,
        context: opts.context,
        onProgress: (p) => {
          // **账本靠这两条**。`toolCallId` 让它挂到发起它的那次工具调用下面
          if (p.type === "started") {
            opts.emit({
              kind: "subagent_start",
              sessionId: opts.sessionId,
              toolCallId,
              index: p.index,
              agent: p.agent,
              task: p.task,
            })
          }
          // `settled` 时还拿不到失败原因（执行器只给 ok），
          // 所以 end 事件在下面拿到结果之后再发——**带上原因**
        },
      })

      const summary = await executor.run(req.request, agents)

      // 每个任务发一条 end。**必须带原因**，账本的 terminalReason 靠它
      summary.results.forEach((r, index) => {
        opts.emit({
          kind: "subagent_end",
          sessionId: opts.sessionId,
          toolCallId,
          index,
          ok: r.ok,
          ...(r.ok ? {} : { error: r.error ?? "子 agent 失败，但没有给出原因" }),
        })
      })

      if (summary.rejected) return text(summary.rejected, true)

      const failed = summary.results.filter((r) => !r.ok)
      const body = render(summary.results, summary.stoppedAtStep, problems)
      // **失败要如实回给模型**，不能只把成功的那些回上去
      return text(body, failed.length > 0)
    },
  }
}

/** 工具描述：**当前有哪些子 agent，以及哪些定义读不进来** */
function describe(load: ReturnType<typeof loadSubagentDefinitions>): string {
  const lines = [
    "把一件事交给子 agent 去做。每个子 agent 在**独立进程**里跑，有自己的上下文窗口。",
    `三种模式：single（agent + task）、parallel（tasks，最多 ${SUBAGENT_LIMITS.maxTasks} 个，` +
      `${SUBAGENT_LIMITS.maxConcurrent} 并发）、chain（chain，可用 {previous} 引上一步结果）。` +
      "**恰好给一组，不要同时给两组。**",
  ]

  /**
   * **两级**（2026-08-22，学自 dsh-agency-agents 的 `list_experts`）：这里只列名字与分组，
   * 详情靠 `dawn_list_subagents` 一次查——二十几份的说明每轮都塞进描述，模型每轮都要付那些 token。
   */
  if (load.agents.length === 0) {
    lines.push("当前**没有定义任何子 agent**（在 .dawn/agents/ 下写 markdown 定义文件）。")
  } else {
    const 按组 = new Map<string, string[]>()
    for (const a of load.agents) {
      const g = a.group ?? "其它"
      按组.set(g, [...(按组.get(g) ?? []), a.name])
    }
    lines.push(
      `可用的子 agent（按组）：${[...按组.entries()].map(([g, 名]) => `${g}：${名.join("、")}`).join("；")}。` +
        "不确定哪个合适时先调 dawn_list_subagents 看各自的说明；**没有合适的就别派**，自己做。",
    )
  }

  // 读不进来的也要说。用户写错 frontmatter 时，这是唯一会出声的地方
  if (load.problems.length > 0) {
    lines.push(
      `⚠ 有 ${load.problems.length} 个定义文件读不进来：` +
        load.problems.map((p) => `${p.filePath}（${p.reason}）`).join("；"),
    )
  }

  return lines.join("\n")
}

/** 参数 → 请求。**恰好一组，多了少了都报错** */
function toRequest(p: Params): { request: SubagentRequest } | { error: string } {
  const modes = [
    p.agent !== undefined || p.task !== undefined ? "single" : undefined,
    p.tasks !== undefined ? "parallel" : undefined,
    p.chain !== undefined ? "chain" : undefined,
  ].filter(Boolean)

  if (modes.length === 0) {
    return { error: "没有指定模式：要么给 agent + task，要么给 tasks，要么给 chain。" }
  }
  if (modes.length > 1) {
    // **不挑一个执行。** 猜错的代价是白跑一批子进程，而且用户看不出是猜的
    return { error: `同时给了 ${modes.join(" 和 ")} 两种模式，只能给一种。` }
  }

  if (p.tasks) return { request: { mode: "parallel", tasks: p.tasks } }
  if (p.chain) return { request: { mode: "chain", chain: p.chain } }
  if (!p.agent || !p.task) return { error: "single 模式要同时给 agent 和 task。" }
  return { request: { mode: "single", agent: p.agent, task: p.task } }
}

/** 结果 → 回给模型的文本 */
function render(
  results: SubagentResult[],
  stoppedAtStep: number | undefined,
  problems: ReturnType<typeof loadSubagentDefinitions>["problems"],
): string {
  const parts = results.map((r, i) => {
    const head = `## [${i + 1}] ${r.agent}：${r.ok ? "完成" : "失败"}`
    if (!r.ok) return `${head}\n${r.error ?? "（没有给出原因）"}`
    // 截断了就说清省了多少——真数，不是「已截断」四个字（规格 7.5）
    const note = r.outputTruncated
      ? `\n\n（输出已截断：原始 ${r.outputBytes} 字节，只回了前 ${Buffer.byteLength(r.output, "utf8")} 字节）`
      : ""
    return `${head}\n${r.output}${note}`
  })

  if (stoppedAtStep !== undefined) {
    parts.push(`⚠ chain 在第 ${stoppedAtStep} 步失败，**后续步骤没有执行**。`)
  }
  if (problems.length > 0) {
    parts.push(`⚠ 另有 ${problems.length} 个子 agent 定义文件读不进来，见工具描述。`)
  }
  return parts.join("\n\n")
}
