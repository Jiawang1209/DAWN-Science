/**
 * 定时任务的领域模型（schedule，2026-08-22，学自 dsh-automation 的 domain.ts）。纯数据与纯函数。
 *
 * 两条铁律照它的：
 *   - **一次运行是一个快照**：入队那一刻把任务说明与定义版本拷进 run；定义后来改了，已排队的那次按旧的跑。
 *   - **at-most-once**：`occurrenceKey = 定义id:版本:到期时刻`，run id 是它的哈希——重启、双 pump、时钟抖动都不会跑两次。
 */
import { createHash, randomUUID } from "node:crypto"
import type { 计划 } from "./recurrence.js"
import type { 权限档 } from "../policy/permissions.js"

export type 定义状态 = "active" | "paused"
export type 运行状态 = "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled"

export interface 定义 {
  id: string
  revision: number
  name: string
  /** 每次独立运行都用的、自包含的任务说明 */
  prompt: string
  status: 定义状态
  schedule: 计划
  agentId: string
  /** 本机项目的工作区；与 `connectionId` 二选一 */
  workspace?: string | undefined
  /** 远端：在那台服务器上开会话（会话的 cwd 由连接的默认目录决定） */
  connectionId?: string | undefined
  permission: 权限档
  createdAt: string
  updatedAt: string
}

export interface 运行 {
  id: string
  scheduleId: string
  revision: number
  occurrenceKey: string
  trigger: "schedule" | "manual"
  scheduledFor: string
  status: 运行状态
  prompt: string
  sessionId?: string | undefined
  startedAt?: string | undefined
  finishedAt?: string | undefined
  summary?: string | undefined
  error?: { code: string; message: string } | undefined
}

export function occurrenceKey(scheduleId: string, revision: number, scheduledFor: string): string {
  return `${scheduleId}:${revision}:${new Date(Date.parse(scheduledFor)).toISOString()}`
}

export function runIdFor(key: string): string {
  return `srun-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`
}

export function 造到期运行(d: 定义, scheduledFor: string): 运行 {
  const key = occurrenceKey(d.id, d.revision, scheduledFor)
  return { id: runIdFor(key), scheduleId: d.id, revision: d.revision, occurrenceKey: key, trigger: "schedule", scheduledFor, status: "queued", prompt: d.prompt }
}

export function 造手动运行(d: 定义, now: string, nonce = randomUUID()): 运行 {
  const key = `manual:${d.id}:${nonce}`
  return { id: runIdFor(key), scheduleId: d.id, revision: d.revision, occurrenceKey: key, trigger: "manual", scheduledFor: now, status: "queued", prompt: d.prompt }
}
