/**
 * 团队调度器（team-board，2026-08-22，学自 dsh-agent-teams `scheduler.ts`）。
 *
 * **事件驱动，不轮询。** 每次状态变了（建任务、转派、一轮结束、来了消息）都 `踢一下()`：
 * 对每个空闲成员——先送未送达的邮件，再挑一项就绪任务领了起一轮；同时跑着的成员不超过 `maxConcurrent`。
 * 一轮结束：结果出示领取时的令牌去结算；令牌对不上（中途被转派 / 接管）就**丢掉并出声**。
 *
 * 真相在磁盘：每次变更「读 → 变 → 写」，内存里不留一份会过期的副本。
 * 一个会话一个调度器；成员之间、队长与成员之间都是进程边界。
 */
import { join } from "node:path"
import type { SubagentDefinition } from "../subagent/definitions.js"
import { 跑一轮, type 跑一轮选项 } from "./runner.js"
import {
  读团队, 写团队, 团队目录, 团队错误, 挑就绪任务, 领取, 开始做, 结算, 未送达的消息, 标记送达, 找成员, 发消息, 成员手上的任务, 统计, 未满足的依赖, 代入上游, 死掉的依赖,
} from "./state.js"
import { 团队上限, type 团队, type 成员 } from "./types.js"

export interface 调度器选项 {
  sessionDir: string
  /** 名册：按名字找定义（每轮重读，改了定义不用重启） */
  定义: () => readonly SubagentDefinition[]
  跑: Pick<跑一轮选项, "childOf" | "context">
  /** 状态变了（给界面与账本） */
  onChange: (team: 团队) => void
  /** 一轮开始 / 结束（账本记 Run 用） */
  onTurn?: (e: { team: 团队; member: string; taskId?: string | undefined; phase: "start" | "end"; ok?: boolean; error?: string }) => void
  /** 一轮最多跑多久 */
  turnTimeoutMs?: number
  now?: () => number
}

export class 团队调度器 {
  private readonly 跑着 = new Map<string, AbortController>()
  private 踢中 = false
  private 再踢 = false
  private readonly 等着的 = new Set<() => void>()

  constructor(private readonly opts: 调度器选项) {}

  dir(teamId: string) {
    return 团队目录(this.opts.sessionDir, teamId)
  }

  读(teamId: string): 团队 {
    const t = 读团队(this.dir(teamId))
    if (!t) throw new 团队错误(`没有 id 为「${teamId}」的团队。`)
    return t
  }

  /** 读 → 改 → 写 → 通知。所有变更都走这里 */
  改(teamId: string, f: (team: 团队) => void): 团队 {
    const team = this.读(teamId)
    f(team)
    写团队(this.dir(teamId), team)
    this.opts.onChange(team)
    for (const w of this.等着的) w()
    this.等着的.clear()
    return team
  }

  /**
   * 等到状态变一次（某个成员一轮结束、来了消息），或超时。给队长的 `team_wait` 用——
   * 队长的那一轮不用一遍遍 `team_status` 空转。返回 true = 变了，false = 超时。
   */
  等变化(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.等着的.delete(w)
        resolve(false)
      }, timeoutMs)
      const w = () => {
        clearTimeout(timer)
        resolve(true)
      }
      this.等着的.add(w)
    })
  }

  几个在跑(): number {
    return this.跑着.size
  }

  正在跑的成员(): string[] {
    return [...this.跑着.keys()].map((k) => k.split("/")[1]!)
  }

  /** 中止某个成员正在跑的那一轮（转派 / 移除 / 结束团队时） */
  中止(teamId: string, member: string): void {
    this.跑着.get(`${teamId}/${member}`)?.abort()
  }

  中止全部(teamId: string): void {
    for (const [k, c] of this.跑着) if (k.startsWith(`${teamId}/`)) c.abort()
  }

  /**
   * 踢一下：给每个空闲成员找活。**可重入**——跑着的时候又被踢，记一笔，跑完再来一遍。
   */
  async 踢一下(teamId: string): Promise<void> {
    if (this.踢中) {
      this.再踢 = true
      return
    }
    this.踢中 = true
    try {
      do {
        this.再踢 = false
        this.派一轮(teamId)
      } while (this.再踢)
    } finally {
      this.踢中 = false
    }
  }

  private 派一轮(teamId: string): void {
    const team = this.读(teamId)
    if (team.finishedAt) return
    for (const m of team.members) {
      if (m.status === "removed") continue
      if (this.跑着.has(`${teamId}/${m.name}`)) continue
      if (this.跑着.size >= 团队上限.maxConcurrent) return
      const 信 = 未送达的消息(team, m.name)
      if (信.length > 0) {
        // 先送信：消息本身就是一轮的输入
        this.改(teamId, (t) => 标记送达(t, 信.map((x) => x.id), this.now()))
        void this.起一轮(teamId, m.name, undefined, 信件文本(信))
        continue
      }
      const 任务 = 挑就绪任务(team, m.name)
      if (任务) {
        let attemptId = ""
        try {
          this.改(teamId, (t) => {
            attemptId = 领取(t, 任务.id, m.name, this.now()).attemptId
          })
        } catch (e) {
          // 领不了（磁盘上刚被别人改过）：**跳过这一项，别让整轮派活中断**——2026-08-22 一个重名 id 曾把调度器绊倒，
          // 队长收一条系统消息，人在坞里看得到
          this.改(teamId, (t) => 发消息(t, { from: m.name, to: "captain", content: `（系统）没能领下 ${任务.id}：${e instanceof Error ? e.message : String(e)}` }, this.now()))
          continue
        }
        const 最新 = this.读(teamId)
        const 派单 = 派单文本(最新, 任务.id)
        void this.起一轮(teamId, m.name, { taskId: 任务.id, attemptId }, 派单)
      }
    }
  }

  private async 起一轮(teamId: string, member: string, 任务: { taskId: string; attemptId: string } | undefined, prompt: string): Promise<void> {
    const key = `${teamId}/${member}`
    const ctrl = new AbortController()
    this.跑着.set(key, ctrl)
    let team = this.改(teamId, (t) => {
      const m = 找成员(t, member)
      if (m) m.status = "working"
      if (任务) 开始做(t, 任务.taskId, 任务.attemptId, this.now())
    })
    const m = 找成员(team, member)!
    const def = this.opts.定义().find((d) => d.name === m.agent)
    this.opts.onTurn?.({ team, member, taskId: 任务?.taskId, phase: "start" })
    let 结果: { ok: boolean; output: string; error?: string }
    if (!def) {
      结果 = { ok: false, output: "", error: `名册里没有叫「${m.agent}」的子 agent（成员「${member}」用的人设）。` }
    } else {
      const 成员目录 = join(this.dir(teamId), m.sessionDir)
      结果 = await 跑一轮(
        {
          definition: def,
          memberName: member,
          teamId,
          prompt,
          systemPrompt: 成员人设(def.systemPrompt, team, m),
          sessionDir: 成员目录,
          resume: m.turns > 0,
          agentDir: join(成员目录, "agent", String(m.turns)),
          ...(m.provider && m.model ? { provider: m.provider, model: m.model } : {}),
        },
        {
          childOf: this.opts.跑.childOf,
          context: this.opts.跑.context,
          signal: ctrl.signal,
          timeoutMs: this.opts.turnTimeoutMs ?? 30 * 60_000,
          onCall: (name, params) => this.答成员(teamId, member, name, params),
        },
      )
    }
    this.跑着.delete(key)
    // 结算：令牌对不上就丢掉并出声（转派 / 接管 / 取消都会让它对不上）
    let 丢了: string | undefined
    team = this.改(teamId, (t) => {
      const mm = 找成员(t, member)
      if (mm && mm.status !== "removed") {
        mm.status = "idle"
        mm.turns += 1
      }
      if (任务) {
        try {
          结算(t, 任务.taskId, 任务.attemptId, { ok: 结果.ok, output: 结果.ok ? 结果.output : 结果.error ?? "失败，没有说原因" }, this.now())
        } catch (e) {
          丢了 = e instanceof Error ? e.message : String(e)
        }
      } else if (!结果.ok) {
        // 送信那一轮挂了：把原因寄给队长，别静默
        发消息(t, { from: member, to: "captain", content: `（系统）这一轮处理消息时失败：${结果.error}` }, this.now())
      }
    })
    if (丢了) {
      this.改(teamId, (t) => 发消息(t, { from: member, to: "captain", content: `（系统）「${member}」迟到的结果被丢弃：${丢了}` }, this.now()))
    }
    this.opts.onTurn?.({ team, member, taskId: 任务?.taskId, phase: "end", ok: 结果.ok, ...(结果.error ? { error: 结果.error } : {}) })
    // 它空闲了、任务图变了——再踢
    await this.踢一下(teamId)
  }

  /** 成员的工具调用：`team_send` / `team_status`。成员不能冒名——`from` 永远是它自己 */
  private async 答成员(teamId: string, member: string, name: string, params: unknown): Promise<string> {
    const p = (params ?? {}) as Record<string, unknown>
    if (name === "team_send") {
      const to = typeof p.to === "string" ? p.to : ""
      const content = typeof p.content === "string" ? p.content : ""
      this.改(teamId, (t) => 发消息(t, { from: member, to, content }, this.now()))
      if (to !== "captain") void this.踢一下(teamId)
      return `已送到「${to}」的邮箱。`
    }
    if (name === "team_status") return 状态文本(this.读(teamId), member)
    throw new 团队错误(`没有叫「${name}」的团队工具。`)
  }

  private now() {
    return (this.opts.now ?? Date.now)()
  }
}

function 信件文本(信: { from: string; content: string }[]): string {
  return `你收到了 ${信.length} 条消息：\n\n${信.map((m) => `【来自 ${m.from}】\n${m.content}`).join("\n\n")}\n\n按消息行事；需要回话就用 team_send。`
}

function 派单文本(team: 团队, taskId: string): string {
  const t = team.tasks.find((x) => x.id === taskId)!
  const 描述 = 代入上游(team, t.description ?? "")
  const 上游 = t.dependencies
    .map((d) => team.tasks.find((x) => x.id === d))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => `- ${x.id}「${x.subject}」的结果：\n${(x.output ?? "").slice(0, 8000)}`)
  return [
    `任务 ${t.id}：${t.subject}`,
    描述.text ? `\n${描述.text}` : "",
    上游.length ? `\n上游任务的结果：\n${上游.join("\n")}` : "",
    描述.missing.length ? `\n（注意：文本里的 ${描述.missing.map((x) => `{${x}}`).join("、")} 还没有结果，留了原样）` : "",
    "\n做完之后，最后一条回复写清结果——它会原样记为这项任务的 output，下游任务靠它。",
  ].join("\n")
}

/** 成员人设 = 名册里那份 + 团队规则（照 dsh-agent-teams 的 memberPersona 写） */
export function 成员人设(定义提示: string, team: 团队, m: 成员): string {
  return `${定义提示}

---
你现在是团队「${team.name}」的成员，名字叫 ${m.name}${m.role ? `，角色：${m.role}` : ""}。团队目标：${team.goal}
队长（captain）带队；你是干活的成员。每条派单或消息都是新的一轮：照着做，做完用最后一条回复报告结果。

工作规则：
1. 派给你的任务做完之后，最后一条回复就是任务的结果（会原样记录，下游任务靠它）——写清做了什么、关键结论、产物在哪。**哪怕全文已经写进了文件，最后也必须回一段要点**：文件路径 + 三五条结论；什么都不说会被记成「没有文字结果」。
2. 卡住了或发现问题，用 team_send 发给 captain；要问队友就 team_send 发给队友（to 填名字），不用经过队长。
3. team_status 能看团队现状。
4. 你是成员：不建团队、不建任务、不转派、不加减人——那是队长的事。
5. 一次只做手上这一项；别抢别人的活。`
}

export function 状态文本(team: 团队, 视角?: string): string {
  const c = 统计(team)
  const 行: string[] = [
    `团队「${team.name}」（${team.id}）${team.finishedAt ? "（已结束）" : ""}`,
    `目标：${team.goal}`,
    `任务：${team.tasks.length}（待领 ${c.pending} · 已领 ${c.claimed} · 进行中 ${c.in_progress} · 完成 ${c.completed} · 失败 ${c.failed} · 取消 ${c.cancelled}）`,
    "",
    "成员：",
    ...team.members.map((m) => `- ${m.name}（${m.agent}${m.role ? `，${m.role}` : ""}${m.model ? `，模型 ${m.provider}/${m.model}` : ""}）：${m.status}${成员手上的任务(team, m.name) ? `，手上 ${成员手上的任务(team, m.name)!.id}` : ""}，跑过 ${m.turns} 轮`),
    "",
    "任务：",
    ...team.tasks.map((t) => {
      const 缺 = 未满足的依赖(team, t)
      const 死 = 死掉的依赖(team, t)
      return `- ${t.id}「${t.subject}」：${t.status}${t.assignee ? ` @${t.assignee}` : ""}${t.dependencies.length ? `，依赖 ${t.dependencies.join("、")}` : ""}${缺.length && t.status === "pending" ? `（等 ${缺.join("、")}）` : ""}${死.length ? `（依赖 ${死.join("、")} 已失败/取消，永远等不到）` : ""}${t.output ? `\n  结果：${t.output.slice(0, 300)}${t.output.length > 300 ? "…" : ""}` : ""}`
    }),
  ]
  const 信 = 视角 ? 未送达的消息(team, 视角) : 未送达的消息(team, "captain")
  if (信.length) 行.push("", `${视角 ?? "队长"}邮箱里未读 ${信.length} 条：`, ...信.map((x) => `- 来自 ${x.from}：${x.content.slice(0, 300)}`))
  return 行.join("\n")
}
