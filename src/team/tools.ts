/**
 * 队长的工具（team-board，2026-08-22，学自 dsh-agent-teams 的 10 个 `agent_teams_*`，合成 7 个）。
 * 坐在 `subagent` 工具同一层（pi 的 `customTools`），一个会话一份调度器。
 *
 * 队长 = 当前会话。成员的工具（`team_send` / `team_status`）不在这里——那是子进程里的，见 `subagent/child.ts`。
 * `团队错误` 是模型的错（id 写错、依赖不存在、令牌对不上）：原样回给模型让它改，不崩。
 */
import { Type } from "typebox"
import type { SubagentDefinition } from "../subagent/definitions.js"
import { 团队调度器, 状态文本 } from "./scheduler.js"
import { 建团队, 加成员, 加任务, 转派, 取消任务, 发消息, 未送达的消息, 标记送达, 领取, 结算, 结束团队, 全部终态, 移除成员, 写团队, 读团队, 团队错误, 成员手上的任务 } from "./state.js"
import { 团队上限, type 团队 } from "./types.js"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}
const text = (s: string, isError = false): ToolResult => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}), details: undefined })

export interface 团队工具选项 {
  sessionId: string
  调度器: 团队调度器
  定义: () => readonly SubagentDefinition[]
  /** 当前活着的团队 id（一个队长同时只带一个团队） */
  当前: { get(): string | undefined; set(id: string | undefined): void }
  /** 目录里有哪些模型（`provider/model`）；成员指定的模型不在里面就拒——别让它跑起来才报「模型不存在」 */
  已知模型: () => Promise<readonly { provider: string; model: string }[]>
}

const 成员项 = Type.Object({
  name: Type.String({ description: "团队里叫什么（唯一；字母数字下划线连字符）" }),
  agent: Type.String({ description: "用名册里哪个子 agent 当人设" }),
  role: Type.Optional(Type.String({ description: "一句话说它负责什么" })),
  model: Type.Optional(Type.String({ description: "可选，写成 provider/model（如 deepseek/deepseek-v4-flash）。**缺省跟你当前的模型**；只在人明确要求不同分工用不同模型时才给" })),
})
const 任务项 = Type.Object({
  id: Type.Optional(Type.String({ description: "可选；不给就 t1、t2…。给了就能在后面的任务里引用" })),
  subject: Type.String({ description: "一句标题" }),
  description: Type.Optional(Type.String({ description: "要做什么、产物放哪。可以写 {t1} 引上游任务的结果" })),
  assignee: Type.Optional(Type.String({ description: "成员名；不给就进共享池，谁空闲谁领；\"captain\" = 队长自己做" })),
  dependencies: Type.Optional(Type.Array(Type.String(), { description: "要先完成的任务 id（必须是前面已经建好的）" })),
})

export function createTeamTools(opts: 团队工具选项) {
  const 调 = opts.调度器
  const 当前团队 = (): string => {
    const id = opts.当前.get()
    if (!id) throw new 团队错误("现在没有活着的团队。先 team_create。")
    return id
  }
  const 跑 = async (f: () => Promise<string> | string): Promise<ToolResult> => {
    try {
      return text(await f())
    } catch (e) {
      if (e instanceof 团队错误) return text(e.message, true)
      throw e
    }
  }

  return [
    {
      name: "team_create",
      label: "team_create",
      description:
        "建一支团队并成为队长：一次给齐成员与带依赖的任务表，调度器会自动把就绪任务派给空闲成员（各自一个子进程、各自可续的会话），" +
        `最多 ${团队上限.maxMembers} 个成员、${团队上限.maxTasks} 个任务、同时跑 ${团队上限.maxConcurrent} 个。` +
        "一个队长同时只带一个团队。建完用 team_wait 等进展，team_status 看全景；阻塞了先 team_reassign；全部终态后汇总给人，再 team_finish。",
      parameters: Type.Object({
        name: Type.String({ description: "团队名" }),
        goal: Type.String({ description: "团队目标，一两句" }),
        members: Type.Array(成员项, { description: "成员" }),
        tasks: Type.Optional(Type.Array(任务项, { description: "任务表，按依赖顺序写（上游在前）" })),
      }),
      async execute(_id: string, p: { name: string; goal: string; members: { name: string; agent: string; role?: string; model?: string }[]; tasks?: { id?: string; subject: string; description?: string; assignee?: string; dependencies?: string[] }[] }) {
        return 跑(async () => {
          if (opts.当前.get()) throw new 团队错误(`已经有一支活着的团队（${opts.当前.get()}），先 team_finish 再建新的。`)
          const 名册 = opts.定义()
          const team = 建团队({ name: p.name, goal: p.goal, captainSessionId: opts.sessionId })
          for (const m of p.members ?? []) {
            if (!名册.some((d) => d.name === m.agent)) throw new 团队错误(`名册里没有叫「${m.agent}」的子 agent。有的是：${名册.map((d) => d.name).join(" / ") || "（一个都没有）"}`)
            加成员(team, { ...m, ...(await 解析模型(m.model, opts.已知模型)) })
          }
          for (const t of p.tasks ?? []) 加任务(team, t)
          写团队(调.dir(team.id), team)
          opts.当前.set(team.id)
          调.改(team.id, () => {})
          void 调.踢一下(team.id)
          return `团队「${team.name}」（${team.id}）建好了：${team.members.length} 个成员，${team.tasks.length} 个任务。就绪的任务已经派出去。\n\n${状态文本(调.读(team.id))}`
        })
      },
    },
    {
      name: "team_add_task",
      label: "team_add_task",
      description: "往当前团队加一项任务（可带依赖、指派）。加完调度器会自动派。",
      parameters: 任务项,
      async execute(_id: string, p: { id?: string; subject: string; description?: string; assignee?: string; dependencies?: string[] }) {
        return 跑(async () => {
          const id = 当前团队()
          let 新: string = ""
          调.改(id, (t) => {
            新 = 加任务(t, p).id
          })
          void 调.踢一下(id)
          return `任务 ${新} 加好了。`
        })
      },
    },
    {
      name: "team_reassign",
      label: "team_reassign",
      description:
        "转派或接管一项任务：旧的执行（attempt）作废、正在跑的那一轮中止、任务回到待领并指派给 to。" +
        "to 填成员名，或 \"captain\" 表示队长自己接手（接手后用 team_update_task 结算），不填 = 回共享池。阻塞、过慢、跑偏时先用它，别自己重做。",
      parameters: Type.Object({ taskId: Type.String(), to: Type.Optional(Type.String()), reason: Type.Optional(Type.String({ description: "为什么转（会寄给原负责人）" })) }),
      async execute(_id: string, p: { taskId: string; to?: string; reason?: string }) {
        return 跑(async () => {
          const id = 当前团队()
          let 原: string | undefined
          const team = 调.改(id, (t) => {
            原 = t.tasks.find((x) => x.id === p.taskId)?.assignee
            转派(t, p.taskId, p.to)
            if (原 && 原 !== "captain" && p.reason) 发消息(t, { from: "captain", to: 原, content: `任务 ${p.taskId} 已转走：${p.reason}` })
          })
          if (原 && 原 !== "captain") 调.中止(id, 原)
          if (p.to === "captain") {
            const { attemptId } = 领取(team, p.taskId, "captain")
            写团队(调.dir(id), team)
            调.改(id, () => {})
            return `任务 ${p.taskId} 由你接手。做完用 team_update_task 结算，attemptId=${attemptId}`
          }
          void 调.踢一下(id)
          return `任务 ${p.taskId} 已转派${p.to ? `给 ${p.to}` : "回共享池"}。`
        })
      },
    },
    {
      name: "team_update_task",
      label: "team_update_task",
      description: "队长结算自己接手的任务（team_reassign to=captain 之后）：出示 attemptId，写结果。也可用 cancel 取消一项任务。",
      parameters: Type.Object({
        taskId: Type.String(),
        attemptId: Type.Optional(Type.String({ description: "接手时拿到的令牌" })),
        status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("cancelled")]),
        output: Type.Optional(Type.String({ description: "结果" })),
      }),
      async execute(_id: string, p: { taskId: string; attemptId?: string; status: "completed" | "failed" | "cancelled"; output?: string }) {
        return 跑(async () => {
          const id = 当前团队()
          调.改(id, (t) => {
            if (p.status === "cancelled") {
              const 谁 = t.tasks.find((x) => x.id === p.taskId)?.assignee
              取消任务(t, p.taskId)
              if (谁 && 谁 !== "captain") 调.中止(id, 谁)
              return
            }
            if (!p.attemptId) throw new 团队错误("结算要出示 attemptId（team_reassign to=captain 时给你的那个）。")
            结算(t, p.taskId, p.attemptId, { ok: p.status === "completed", output: p.output ?? "" })
          })
          void 调.踢一下(id)
          return `任务 ${p.taskId} 记为 ${p.status}。`
        })
      },
    },
    {
      name: "team_send",
      label: "team_send",
      description: "给某个成员发一条消息（进它的邮箱并唤醒它一轮）。指导、追问、补充信息都用它。",
      parameters: Type.Object({ to: Type.String({ description: "成员名" }), content: Type.String() }),
      async execute(_id: string, p: { to: string; content: string }) {
        return 跑(async () => {
          const id = 当前团队()
          调.改(id, (t) => 发消息(t, { from: "captain", to: p.to, content: p.content }))
          void 调.踢一下(id)
          return `已送到「${p.to}」的邮箱。`
        })
      },
    },
    {
      name: "team_status",
      label: "team_status",
      description: "团队全景：成员状态、任务与依赖、每项的结果、你邮箱里未读的消息（读过就算送达）。",
      parameters: Type.Object({}),
      async execute() {
        return 跑(async () => {
          const id = 当前团队()
          const team = 调.读(id)
          const out = 状态文本(team)
          const 信 = 未送达的消息(team, "captain")
          if (信.length) 调.改(id, (t) => 标记送达(t, 信.map((x) => x.id)))
          return out
        })
      },
    },
    {
      name: "team_wait",
      label: "team_wait",
      description:
        "等团队有进展（某个成员一轮结束、有消息给你），最多等 timeoutSec 秒（缺省 120，上限 600）。返回时附全景。" +
        "**用它代替反复 team_status**：所有任务都到终态时它立刻返回。",
      parameters: Type.Object({ timeoutSec: Type.Optional(Type.Integer({ minimum: 1, maximum: 600 })) }),
      async execute(_id: string, p: { timeoutSec?: number }) {
        return 跑(async () => {
          const id = 当前团队()
          const 秒 = Math.min(600, Math.max(1, p.timeoutSec ?? 120))
          const 起 = Date.now()
          let team = 调.读(id)
          let 变了 = false
          while (!全部终态(team) && 未送达的消息(team, "captain").length === 0 && Date.now() - 起 < 秒 * 1000) {
            变了 = await 调.等变化(秒 * 1000 - (Date.now() - 起))
            team = 调.读(id)
            if (!变了) break
            // 只有「一轮结束 / 来信」才值得把队长叫醒；成员刚变 working 不算
            if (调.几个在跑() === 0 || 未送达的消息(team, "captain").length > 0 || team.tasks.some((t) => t.updatedAt > 起 && (t.status === "completed" || t.status === "failed"))) break
          }
          const 信 = 未送达的消息(team, "captain")
          if (信.length) 调.改(id, (t) => 标记送达(t, 信.map((x) => x.id)))
          const 头 = 全部终态(team) ? "所有任务都到终态了。" : 变了 ? "有进展。" : `等了 ${秒} 秒没有变化（${调.正在跑的成员().join("、") || "没有人"}在跑）。`
          return `${头}\n\n${状态文本(team)}`
        })
      },
    },
    {
      name: "team_finish",
      label: "team_finish",
      description: "结束当前团队：中止还在跑的成员，开放任务记为取消，团队记录归档保留（不删）。先把结果汇总给人，再调它。",
      parameters: Type.Object({}),
      async execute() {
        return 跑(async () => {
          const id = 当前团队()
          调.中止全部(id)
          调.改(id, (t) => 结束团队(t))
          opts.当前.set(undefined)
          return `团队 ${id} 已结束并归档。`
        })
      },
    },
    {
      name: "team_remove_member",
      label: "team_remove_member",
      description: "移除一个成员：中止它正在跑的一轮，它手上与名下的任务回到共享池。",
      parameters: Type.Object({ name: Type.String() }),
      async execute(_id: string, p: { name: string }) {
        return 跑(async () => {
          const id = 当前团队()
          调.中止(id, p.name)
          调.改(id, (t) => {
            移除成员(t, p.name)
          })
          void 调.踢一下(id)
          return `「${p.name}」已移除。`
        })
      },
    },
  ]
}

/** `provider/model` → 拆开并对着目录核一遍。没给 = 跟队长（返回空对象） */
async function 解析模型(写法: string | undefined, 已知: () => Promise<readonly { provider: string; model: string }[]>): Promise<{ provider?: string; model?: string }> {
  const s = 写法?.trim()
  if (!s) return {}
  const i = s.indexOf("/")
  if (i <= 0 || i === s.length - 1) throw new 团队错误(`成员的 model 要写成 provider/model，收到的是「${s}」。`)
  const provider = s.slice(0, i)
  const model = s.slice(i + 1)
  const 全部 = await 已知()
  if (!全部.some((x) => x.provider === provider && x.model === model)) {
    const 同家 = 全部.filter((x) => x.provider === provider).map((x) => x.model)
    throw new 团队错误(
      同家.length
        ? `provider「${provider}」下没有模型「${model}」。有的是：${同家.join(", ")}`
        : `没有 provider「${provider}」。有的是：${[...new Set(全部.map((x) => x.provider))].join(", ") || "（目录是空的）"}`,
    )
  }
  return { provider, model }
}

/** 队长协议：进系统提示（照 dsh-agent-teams 的七步写，加了 team_wait） */
export const 队长协议 = `## 团队模式（team_*）
当人要你「用团队」「分工」「组队」做一件事，或消息以 /team 开头时，你是队长。协议：
1. 先想清分工，再一次 team_create 建齐：成员用名册里合适的子 agent 当人设（名字取角色名，如 取数、统计、审稿），任务表按依赖顺序写，上游在前，下游的 description 里用 {t1} 引上游结果。成员**缺省用你当前的模型**；只有人明确说了「统计用 A、取数用 B」这类不同分工用不同模型时，才给那个成员填 model（provider/model），别自作主张。
2. 建完调度器自动把就绪任务派给空闲成员；你用 team_wait 等进展（不要反复 team_status 空转），用 team_send 指导、追问。
3. 阻塞、过慢、跑偏：先 team_reassign（转给别人，或 to=captain 自己接手后 team_update_task 结算）。不要因为队友慢就悄悄自己重做。
4. 每项任务的结果以记录为准（team_status 里的「结果」），不以你的印象为准。
5. 全部任务到终态后，把结果汇总给人（谁做了什么、结论、产物在哪、失败的说清），然后 team_finish。
6. 只能带一支团队；简单的一两件事别组队，直接 subagent 或自己做。`

export type { 团队 }
export { 读团队, 成员手上的任务 }
