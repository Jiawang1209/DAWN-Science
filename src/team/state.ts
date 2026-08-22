/**
 * 团队状态机（team-board，2026-08-22）。**纯函数 + 一份落盘**：每个变更都是「读 → 变 → 原子写」。
 *
 * 规则照 dsh-agent-teams 的事实重写：
 * - 依赖未全部 `completed` 的任务不能领；一个成员同时只能持有一个未完成任务；
 * - 每次执行带单调 `attempt` + 唯一 `attemptId`，结算必须出示当前令牌，对不上就拒；
 * - 终态不可覆盖；转派 / 接管先把旧 attempt 作废（令牌换掉），迟到的结果自然被拒；
 * - 结束团队是归档（`finishedAt`），不是删。
 */
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { 团队上限, 终态, type 任务, type 任务状态, type 成员, type 团队 } from "./types.js"

export class 团队错误 extends Error {
  constructor(message: string) {
    super(message)
    this.name = "团队错误"
  }
}

const 开放 = (t: 任务) => !终态.includes(t.status)

export function 团队目录(sessionDir: string, teamId: string): string {
  return join(sessionDir, "teams", teamId)
}

export function 读团队(dir: string): 团队 | undefined {
  const f = join(dir, "team.json")
  if (!existsSync(f)) return undefined
  return JSON.parse(readFileSync(f, "utf8")) as 团队
}

/** 原子写：先写临时文件再改名，崩在半路也不会留下半份 */
export function 写团队(dir: string, team: 团队): void {
  mkdirSync(dir, { recursive: true })
  const f = join(dir, "team.json")
  const tmp = join(dirname(f), `.team.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmp, JSON.stringify(team, null, 2), "utf8")
  renameSync(tmp, f)
}

const 合法名 = /^[\p{L}\p{N}_-]{1,40}$/u

export function 建团队(input: {
  id?: string
  name: string
  goal: string
  captainSessionId: string
  now?: number
}): 团队 {
  const now = input.now ?? Date.now()
  return {
    id: input.id ?? `team-${now.toString(36)}`,
    name: input.name.trim() || "团队",
    goal: input.goal.trim(),
    captainSessionId: input.captainSessionId,
    createdAt: now,
    members: [],
    tasks: [],
    messages: [],
    taskSeq: 0,
  }
}

export function 加成员(team: 团队, m: { name: string; agent: string; role?: string | undefined; provider?: string | undefined; model?: string | undefined }, now = Date.now()): 成员 {
  const name = m.name.trim()
  if (!合法名.test(name)) throw new 团队错误(`成员名「${m.name}」不合规：只许字母、数字、下划线、连字符，1–40 个字符。`)
  if (name === "captain") throw new 团队错误("「captain」是队长的名字，成员不能叫这个。")
  if (team.members.some((x) => x.name === name && x.status !== "removed")) throw new 团队错误(`已经有一个叫「${name}」的成员。`)
  if (team.members.filter((x) => x.status !== "removed").length >= 团队上限.maxMembers) throw new 团队错误(`一支团队最多 ${团队上限.maxMembers} 个成员。`)
  const 成员: 成员 = {
    name,
    agent: m.agent.trim(),
    ...(m.role?.trim() ? { role: m.role.trim() } : {}),
    ...(m.provider?.trim() && m.model?.trim() ? { provider: m.provider.trim(), model: m.model.trim() } : {}),
    status: "idle",
    sessionDir: join("members", name),
    turns: 0,
    joinedAt: now,
  }
  team.members.push(成员)
  return 成员
}

export function 找成员(team: 团队, name: string): 成员 | undefined {
  return team.members.find((m) => m.name === name && m.status !== "removed")
}

export function 加任务(
  team: 团队,
  t: { id?: string | undefined; subject: string; description?: string | undefined; assignee?: string | undefined; dependencies?: readonly string[] | undefined },
  now = Date.now(),
): 任务 {
  if (team.tasks.length >= 团队上限.maxTasks) throw new 团队错误(`一支团队最多 ${团队上限.maxTasks} 个任务。`)
  const subject = t.subject.trim()
  if (!subject) throw new 团队错误("任务要有一句标题。")
  let id = t.id?.trim()
  if (id) {
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(id)) throw new 团队错误(`任务 id「${id}」不合规。`)
    if (team.tasks.some((x) => x.id === id)) throw new 团队错误(`已经有一个 id 为「${id}」的任务。`)
  } else {
    team.taskSeq += 1
    id = `t${team.taskSeq}`
  }
  const deps = [...new Set((t.dependencies ?? []).map((d) => d.trim()).filter(Boolean))]
  for (const d of deps) {
    if (d === id) throw new 团队错误(`任务「${id}」不能依赖自己。`)
    if (!team.tasks.some((x) => x.id === d)) throw new 团队错误(`任务「${id}」依赖的「${d}」不存在——依赖只能指向已经建好的任务（先建上游，再建下游）。`)
  }
  const assignee = t.assignee?.trim()
  if (assignee && assignee !== "captain" && !找成员(team, assignee)) throw new 团队错误(`任务「${id}」指派给了不存在的成员「${assignee}」。`)
  const 任务: 任务 = {
    id,
    subject,
    ...(t.description?.trim() ? { description: t.description.trim() } : {}),
    status: "pending",
    ...(assignee ? { assignee } : {}),
    dependencies: deps,
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  }
  team.tasks.push(任务)
  return 任务
}

/** 没满足的依赖（还没 completed 的）。空 = 就绪 */
export function 未满足的依赖(team: 团队, t: 任务): string[] {
  return t.dependencies.filter((d) => team.tasks.find((x) => x.id === d)?.status !== "completed")
}

/** 某个依赖已经 failed / cancelled：下游永远等不到，如实说 */
export function 死掉的依赖(team: 团队, t: 任务): string[] {
  return t.dependencies.filter((d) => {
    const s = team.tasks.find((x) => x.id === d)?.status
    return s === "failed" || s === "cancelled"
  })
}

export function 成员手上的任务(team: 团队, name: string): 任务 | undefined {
  return team.tasks.find((t) => t.assignee === name && (t.status === "claimed" || t.status === "in_progress"))
}

/**
 * 给一个空闲成员挑一项就绪任务：先它名下的，再共享池里的；按创建顺序。
 * **不改状态**——领取是另一步，这样调度器能先看有没有活再决定起不起进程。
 */
export function 挑就绪任务(team: 团队, name: string): 任务 | undefined {
  if (成员手上的任务(team, name)) return undefined
  const 就绪 = (t: 任务) => t.status === "pending" && 未满足的依赖(team, t).length === 0
  return team.tasks.find((t) => 就绪(t) && t.assignee === name) ?? team.tasks.find((t) => 就绪(t) && !t.assignee)
}

/** 领取：pending → claimed，attempt +1，发新令牌 */
export function 领取(team: 团队, taskId: string, by: string, now = Date.now()): { task: 任务; attemptId: string } {
  const t = team.tasks.find((x) => x.id === taskId)
  if (!t) throw new 团队错误(`没有任务「${taskId}」。`)
  if (t.status !== "pending") throw new 团队错误(`任务「${taskId}」现在是 ${t.status}，不能领。`)
  const 缺 = 未满足的依赖(team, t)
  if (缺.length > 0) throw new 团队错误(`任务「${taskId}」的依赖还没完成：${缺.join("、")}。`)
  if (t.assignee && t.assignee !== by) throw new 团队错误(`任务「${taskId}」指派给了「${t.assignee}」，「${by}」不能领。`)
  if (by !== "captain" && 成员手上的任务(team, by)) throw new 团队错误(`「${by}」手上还有没做完的任务，不能同时领两个。`)
  t.status = "claimed"
  t.assignee = by
  t.attempt += 1
  t.attemptId = randomUUID()
  t.updatedAt = now
  return { task: t, attemptId: t.attemptId }
}

export function 开始做(team: 团队, taskId: string, attemptId: string, now = Date.now()): 任务 {
  const t = 验令牌(team, taskId, attemptId)
  if (t.status === "claimed") {
    t.status = "in_progress"
    t.updatedAt = now
  }
  return t
}

/** 结算：必须出示当前令牌；终态不可覆盖 */
export function 结算(team: 团队, taskId: string, attemptId: string, 结果: { ok: boolean; output: string }, now = Date.now()): 任务 {
  const t = 验令牌(team, taskId, attemptId)
  t.status = 结果.ok ? "completed" : "failed"
  t.output = 结果.output
  t.updatedAt = now
  return t
}

function 验令牌(team: 团队, taskId: string, attemptId: string): 任务 {
  const t = team.tasks.find((x) => x.id === taskId)
  if (!t) throw new 团队错误(`没有任务「${taskId}」。`)
  if (终态.includes(t.status)) throw new 团队错误(`任务「${taskId}」已经是 ${t.status}，终态不能再改。`)
  if (!t.attemptId || t.attemptId !== attemptId) {
    throw new 团队错误(`任务「${taskId}」的令牌对不上：这次执行（attempt）已被转派或接管作废，结果不收。停下来等新的安排。`)
  }
  return t
}

/**
 * 转派 / 接管：把当前 attempt 作废（令牌换掉、状态回 pending、指派给新人）。
 * 原成员迟到的结果对不上令牌，自然被拒。`captain` = 队长自己接手。
 */
export function 转派(team: 团队, taskId: string, to: string | undefined, now = Date.now()): 任务 {
  const t = team.tasks.find((x) => x.id === taskId)
  if (!t) throw new 团队错误(`没有任务「${taskId}」。`)
  if (终态.includes(t.status)) throw new 团队错误(`任务「${taskId}」已经是 ${t.status}，终态不能转派。`)
  const 新 = to?.trim()
  if (新 && 新 !== "captain" && !找成员(team, 新)) throw new 团队错误(`没有叫「${新}」的成员。`)
  if (新 && 新 !== "captain" && 成员手上的任务(team, 新)) throw new 团队错误(`「${新}」手上还有没做完的任务。`)
  t.status = "pending"
  delete t.attemptId
  if (新) t.assignee = 新
  else delete t.assignee
  t.updatedAt = now
  return t
}

export function 取消任务(team: 团队, taskId: string, now = Date.now()): 任务 {
  const t = team.tasks.find((x) => x.id === taskId)
  if (!t) throw new 团队错误(`没有任务「${taskId}」。`)
  if (终态.includes(t.status)) throw new 团队错误(`任务「${taskId}」已经是 ${t.status}。`)
  t.status = "cancelled"
  delete t.attemptId
  t.updatedAt = now
  return t
}

export function 发消息(team: 团队, m: { from: string; to: string; content: string }, now = Date.now()) {
  const to = m.to.trim()
  if (to !== "captain" && !找成员(team, to)) throw new 团队错误(`没有叫「${to}」的收件人（成员名或 captain）。`)
  if (m.from !== "captain" && !找成员(team, m.from)) throw new 团队错误(`「${m.from}」不是这支团队的人。`)
  const content = m.content.trim()
  if (!content) throw new 团队错误("消息是空的。")
  const msg = { id: randomUUID(), from: m.from, to, content, ts: now }
  team.messages.push(msg)
  return msg
}

export function 未送达的消息(team: 团队, to: string) {
  return team.messages.filter((m) => m.to === to && !m.deliveredAt)
}

export function 标记送达(team: 团队, ids: readonly string[], now = Date.now()): void {
  for (const m of team.messages) if (ids.includes(m.id)) m.deliveredAt = now
}

export function 移除成员(team: 团队, name: string, now = Date.now()): 成员 {
  const m = 找成员(team, name)
  if (!m) throw new 团队错误(`没有叫「${name}」的成员。`)
  // 它手上的活回到共享池（令牌作废）
  const t = 成员手上的任务(team, name)
  if (t) 转派(team, t.id, undefined, now)
  for (const x of team.tasks) if (x.status === "pending" && x.assignee === name) delete x.assignee
  m.status = "removed"
  return m
}

export function 结束团队(team: 团队, now = Date.now()): void {
  for (const t of team.tasks) if (开放(t)) 取消任务(team, t.id, now)
  for (const m of team.members) if (m.status !== "removed") m.status = "removed"
  team.finishedAt = now
}

/** 全部任务都到终态了？ */
export function 全部终态(team: 团队): boolean {
  return team.tasks.every((t) => 终态.includes(t.status))
}

export function 统计(team: 团队): Record<任务状态, number> {
  const c: Record<任务状态, number> = { pending: 0, claimed: 0, in_progress: 0, completed: 0, failed: 0, cancelled: 0 }
  for (const t of team.tasks) c[t.status] += 1
  return c
}

/**
 * 把上游输出代入任务文本：`{t1}` → 任务 t1 的 output。没完成的上游不代入（留原样并出声）。
 * 这是 chain 模式 `{previous}` 的推广。
 */
export function 代入上游(team: 团队, 文: string): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = 文.replace(/\{(t\d+|[\p{L}\p{N}_-]{1,40})\}/gu, (whole, id: string) => {
    const t = team.tasks.find((x) => x.id === id)
    if (!t) return whole
    if (t.status !== "completed" || t.output === undefined) {
      missing.push(id)
      return whole
    }
    return t.output
  })
  return { text, missing }
}
