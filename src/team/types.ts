/**
 * 团队（team-board，2026-08-22，学自 NanmiCoder/dsh-agent-teams；解读见
 * `ccb_hive_code_learn/dsh-agent-teams-解读.md`）。
 *
 * 一支团队 = 一个队长（当前会话）+ 若干成员（名册里的子 agent，**各自一个子进程、各自一份可续的会话目录**）
 * + 一张带依赖的任务表 + 一个邮箱。真相在磁盘：`<会话目录>/teams/<id>/team.json`。
 *
 * 进程边界不变（不变式 1：验证者拿不到生产者的上下文）；「可续聊」靠**同一个成员下次起新进程续它那份会话文件**，
 * 不是同进程里留一个活着的子会话。
 */

export type 任务状态 = "pending" | "claimed" | "in_progress" | "completed" | "failed" | "cancelled"
export const 终态: readonly 任务状态[] = ["completed", "failed", "cancelled"]

export interface 任务 {
  /** `t1`、`t2`…… 在团队里稳定 */
  id: string
  subject: string
  description?: string
  status: 任务状态
  /** 成员名，或 `captain`（队长自己做）。没有 = 进共享池，谁空闲谁领 */
  assignee?: string
  /** 这些任务全部 `completed` 之后才能领 */
  dependencies: string[]
  /** 完成 / 失败时写的结果 */
  output?: string
  /**
   * 单调的执行代数。转派 / 接管把它 +1——**迟到的结果对不上当前 attempt 就丢掉**，
   * 这是整件事里最值钱的一条（它的验证脚本压过 50 次迟到写入）。
   */
  attempt: number
  /** 当前这次执行的能力令牌；结算时必须出示 */
  attemptId?: string
  createdAt: number
  updatedAt: number
}

export type 成员状态 = "idle" | "working" | "removed"

export interface 成员 {
  /** 团队内唯一的显示名，也是邮箱名 */
  name: string
  /** 名册里的子 agent 名（决定人设与模型） */
  agent: string
  role?: string
  /**
   * 这个成员自己的模型（作者 2026-08-22 要的）。**缺省跟队长当前的模型**；人明确要求「统计用 A、取数用 B」时才给。
   * 优先级：这里 → 子 agent 定义里的 `model` → 队长当前模型。
   */
  provider?: string
  model?: string
  status: 成员状态
  /** 它那份可续的会话目录（相对团队目录）：`members/<name>` */
  sessionDir: string
  /** 跑过几轮。0 = 还没起过进程，下一轮是新会话；>0 则续上一份 */
  turns: number
  joinedAt: number
}

export interface 消息 {
  id: string
  /** `captain` 或成员名 */
  from: string
  to: string
  content: string
  ts: number
  /** 收件人那一轮开始时打上；没打的是还没送到 */
  deliveredAt?: number
}

export interface 团队 {
  id: string
  name: string
  goal: string
  captainSessionId: string
  createdAt: number
  finishedAt?: number
  members: 成员[]
  tasks: 任务[]
  messages: 消息[]
  taskSeq: number
}

/** 一轮成员执行的结果（子进程回来的） */
export interface 成员轮结果 {
  ok: boolean
  output: string
  error?: string
}

export const 团队上限 = {
  /** 同时跑着的成员进程 */
  maxConcurrent: 4,
  /** 一支团队最多几个成员 */
  maxMembers: 8,
  /** 一支团队最多几个任务 */
  maxTasks: 32,
  /** 一轮输出最多多少字节（与 subagent 同一个数） */
  maxOutputBytes: 64 * 1024,
} as const
