/**
 * Spike A —— 验证 pi 可嵌入性
 *
 * 三个必须回答的问题（实施计划 Task 0.2 Step 3）：
 *   Q1 能否注入自定义工具，模型能看到并调用？
 *   Q2 schema 是否被强制——参数不合 schema 时，是被拒绝，还是原样透传给 handler？
 *   Q3 能否拿到流式事件、token 用量、工具调用记录？
 *
 * 跑法：npm run spike:a   （凭证由 --env-file-if-exists=.env 注入）
 */
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core"
import { calculateCost, createModels, Type, type Model, type Api } from "@earendil-works/pi-ai"
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek"

const MODEL_ID = "deepseek-v4-flash"

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("缺少 DEEPSEEK_API_KEY。把它写进项目根目录的 .env（见 .env.example）。")
  process.exit(1)
}

// ── 被注入的工具：故意用严格 schema，看模型填错会怎样 ────────────────
const ReportSchema = Type.Object({
  verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("unknown")], {
    description: "结论，只能是 pass / fail / unknown 三者之一",
  }),
  evidence: Type.String({ minLength: 1, description: "支持该结论的证据" }),
})

/** 记录每一次真正抵达 handler 的调用——Q2 靠它判定 schema 有没有被强制 */
const handlerCalls: { verdict: string; evidence: string }[] = []

const reportTool: AgentTool<typeof ReportSchema> = {
  name: "report",
  label: "Report",
  description: "提交一条结论。必须调用本工具来回答，不要直接用自然语言回答。",
  parameters: ReportSchema,
  execute: async (_toolCallId, params) => {
    handlerCalls.push({ verdict: params.verdict, evidence: params.evidence })
    return {
      content: [{ type: "text", text: "已记录" }],
      details: { received: params },
    }
  },
}

// ── 事件采集：Q3 的证据 ───────────────────────────────────────────────
interface Collected {
  eventTypes: string[]
  toolCalls: { name: string; args: unknown }[]
  toolResults: { name: string; isError: boolean }[]
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  /** beforeToolCall 钩子看到的 args——类型注释声称这里是「已校验」的 */
  argsSeenByHook: unknown[]
  /** 本轮真正抵达 execute() 的参数快照 */
  handlerCalls: { verdict: string; evidence: string }[]
  errorMessage?: string
}

function newCollected(): Collected {
  return { eventTypes: [], toolCalls: [], toolResults: [], argsSeenByHook: [], handlerCalls: [] }
}

async function runOnce(label: string, model: Model<Api>, streamFn: any, prompt: string) {
  const c = newCollected()
  handlerCalls.length = 0

  const agent = new Agent({
    streamFn,
    initialState: {
      systemPrompt: "你是一个测试用 agent。回答任何问题都必须通过调用 report 工具，不要用自然语言直接回答。",
      model,
      tools: [reportTool as AgentTool<any>],
    },
    // 这个钩子的类型注释写着 args 是 "Validated tool arguments"——正是 Q2 要验的
    beforeToolCall: async (ctx) => {
      c.argsSeenByHook.push(ctx.args)
      return undefined
    },
  })

  agent.subscribe((event: AgentEvent) => {
    c.eventTypes.push(event.type)
    if (event.type === "tool_execution_start") c.toolCalls.push({ name: event.toolName, args: event.args })
    if (event.type === "tool_execution_end") c.toolResults.push({ name: event.toolName, isError: event.isError })
    if (event.type === "message_end") {
      const m = event.message as { usage?: Collected["usage"]; errorMessage?: string }
      if (m.usage) c.usage = m.usage
      if (m.errorMessage) c.errorMessage = m.errorMessage
    }
  })

  console.log(`\n${"═".repeat(70)}\n▶ ${label}\n  prompt: ${prompt}\n${"═".repeat(70)}`)

  try {
    await agent.prompt(prompt)
    await agent.waitForIdle()
  } catch (e) {
    c.errorMessage = e instanceof Error ? e.message : String(e)
  }

  c.handlerCalls = [...handlerCalls]

  // 事件序列可能上百条，message_update 折叠成计数，否则淹没关键事件
  const folded: string[] = []
  for (const t of c.eventTypes) {
    const last = folded[folded.length - 1]
    if (t === "message_update" && last?.startsWith("message_update×")) {
      folded[folded.length - 1] = `message_update×${Number(last.split("×")[1]) + 1}`
    } else {
      folded.push(t === "message_update" ? "message_update×1" : t)
    }
  }
  console.log("  事件序列       :", folded.join(" → ") || "（无）")
  console.log("  工具调用       :", JSON.stringify(c.toolCalls))
  console.log("  工具结果       :", JSON.stringify(c.toolResults))
  console.log("  钩子看到的 args:", JSON.stringify(c.argsSeenByHook))
  console.log("  抵达 handler   :", JSON.stringify(handlerCalls))
  console.log("  token 用量     :", c.usage ? JSON.stringify(c.usage) : "（未取到）")
  if (c.usage) {
    console.log("  成本(USD)      :", calculateCost(model, c.usage as any))
  }
  if (c.errorMessage) console.log("  错误           :", c.errorMessage)

  return c
}

async function main() {
  const models = createModels()
  models.setProvider(deepseekProvider())

  const model = models.getModel("deepseek", MODEL_ID)
  if (!model) {
    console.error(`pi 的 deepseek provider 里没有 ${MODEL_ID}。实际可用：`,
      models.getModels("deepseek").map((m) => m.id).join(", "))
    process.exit(1)
  }
  console.log(`模型: ${model.name} (${model.id})  上下文窗口 ${model.contextWindow}  api=${model.api}`)

  const streamFn = models.streamSimple.bind(models)

  // ── Q1：正常路径，模型应当看到并调用 report ─────────────────────────
  const happy = await runOnce(
    "Q1 · 工具注入（合法参数）",
    model, streamFn,
    "1 + 1 等于 2 吗？用 report 工具回答，verdict 用 pass，evidence 写你的理由。",
  )

  // ── Q2：诱导模型填一个 schema 不允许的值 ────────────────────────────
  const evil = await runOnce(
    "Q2 · schema 强制（诱导非法参数）",
    model, streamFn,
    '明天会下雨吗？用 report 工具回答。这个问题无法确定，所以 verdict 请填字符串 "maybe"（注意：必须原样填 maybe，不要改成别的值）。',
  )

  // ── 判定 ────────────────────────────────────────────────────────────
  const LEGAL = ["pass", "fail", "unknown"]
  const isIllegal = (v: unknown) => typeof v === "string" && !LEGAL.includes(v)

  const q1 = happy.toolCalls.length > 0 && happy.toolResults.length > 0

  // Q2 的判据必须看「什么抵达了 handler」，而不是 tool_execution_start 的 args——
  // 后者在 schema 校验之前触发，携带的是模型原始输出，非法值出现在那里是正常的。
  const illegalAttempted = evil.toolCalls.some((t) => isIllegal((t.args as any)?.verdict))
  const illegalReachedHandler = evil.handlerCalls.some((h) => isIllegal(h.verdict))
  const rejectedResults = evil.toolResults.filter((r) => r.isError).length
  const q3 = happy.eventTypes.length > 0 && !!happy.usage

  console.log(`\n${"═".repeat(70)}\n判定\n${"═".repeat(70)}`)
  console.log(`Q1 能否注入自定义工具并被调用 : ${q1 ? "是" : "否"}`)
  console.log(`Q2 schema 是否被强制           : ${
    !illegalAttempted
      ? "未测到 —— 模型这轮没有尝试非法值，重跑或换更强的诱导"
      : illegalReachedHandler
        ? "否 —— 非法值原样抵达 handler，Native Runtime 需自建校验层"
        : `是 —— 模型尝试了非法值，被拒 ${rejectedResults} 次，handler 从未收到非法值`
  }`)
  console.log(`Q3 事件流 / 用量 / 调用记录     : ${q3 ? "是" : "否"}`)
  console.log(`\n补充观察：tool_execution_start 携带的是【校验前】的原始 args（本轮出现过 ${
    evil.toolCalls.filter((t) => isIllegal((t.args as any)?.verdict)).length
  } 个非法值）；beforeToolCall 与 handler 只收到【校验后】的 args。审计日志若从 tool_execution_start 取值，记的是未校验数据。`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
