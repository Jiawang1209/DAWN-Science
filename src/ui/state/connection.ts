/**
 * 连接状态：**五种态，各有各的出路**。
 *
 * Hermes `AGENTS.md`：
 * > *"The states around loading are distinct experiences — empty, loading,
 * > reconnecting, degraded/stale, and exhausted-recovery **each deserve their
 * > own honest copy and their own way out**."*
 *
 * 此前只有 `ready` 布尔 + `fatal` 字符串。两态把三件事混成了一件：
 *   - 「正在连」与「连不上了」长得一样
 *   - 「后端挂了」与「还没选项目」都占满全屏（后者根本不该）
 *   - 重试**无界**，最终表现为一个永远转不完的圈
 *
 * **权威在主进程**——它知道后端到底能不能用。渲染进程只是显示它。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

/**
 * 放弃前最多试几次。
 *
 * **有界是硬要求**，不是调优参数。Hermes：*"Retries are bounded and end in a
 * real recovery affordance — **never an infinite spinner or a hot loop**."*
 * 无界重试的用户体验是「它好像卡住了，但我不知道该不该继续等」——
 * 那比直接告诉他失败了更糟。
 */
export const MAX_CONNECT_ATTEMPTS = 3

export type ConnectionState =
  /** 正在连。首次启动与用户点重试后都是这个 */
  | { phase: "connecting" }
  /** 连上了，数据是新的 */
  | { phase: "ready" }
  /** 断了但还在重试范围内。**要说清这是第几次**，不能笼统转圈 */
  | { phase: "reconnecting"; attempt: number; reason: string }
  /**
   * **后端仍可用，但显示的数据可能过期。**
   * 这不是断线——所以界面绝不该被全屏挡住，只给一条横幅。
   */
  | { phase: "degraded"; reason: string }
  /** 重试用尽。**必须给出真的能点的出路** */
  | { phase: "exhausted"; reason: string; attempts: number }

export const $connection = atom<ConnectionState>({ phase: "connecting" })

/** 兼容旧读法：只在「真的可用」时为 true */
export const $ready = atom(false)

/** 最近几条提示。规格 7.5：失败必须出声 */
export const $notes = atom<readonly string[]>([])

const MAX_NOTES = 4

/**
 * 记一条提示。
 *
 * **连续重复的同一条不刷屏**——一个每 200ms 重试一次的失败会在两秒内
 * 顶掉全部四条槽位，把真正有用的上下文挤走。
 */
export function note(message: string): void {
  const prev = $notes.get()
  if (prev.at(-1) === message) return
  $notes.set([...prev, message].slice(-MAX_NOTES))
}

/** 开始（或重新开始）连接。**exhausted 之后走这里回到 connecting** */
export function connectStarted(): void {
  $connection.set({ phase: "connecting" })
  setValue($ready, false)
}

export function connectSucceeded(): void {
  $connection.set({ phase: "ready" })
  setValue($ready, true)
}

/**
 * 一次连接尝试失败。
 *
 * 累计到 `MAX_CONNECT_ATTEMPTS` 就进 `exhausted` 并**停止**——
 * 计数从当前状态里读，所以连续调用会自然累加。
 */
export function connectFailed(reason: string): void {
  const c = $connection.get()
  const attempt = (c.phase === "reconnecting" ? c.attempt : c.phase === "exhausted" ? c.attempts : 0) + 1
  setValue($ready, false)
  if (attempt >= MAX_CONNECT_ATTEMPTS) {
    $connection.set({ phase: "exhausted", reason, attempts: attempt })
    return
  }
  $connection.set({ phase: "reconnecting", attempt, reason })
}

/**
 * 后端还在，但这次刷新没拿到新数据。
 *
 * **降级不是断线**：已有内容仍然可用可读，只是可能不是最新的。
 * 把它做成断线会让用户以为什么都干不了了——而实际上什么都还能干。
 */
export function markStale(reason: string): void {
  const c = $connection.get()
  // 还没连上就谈不上"过期"——那是连接失败，不是数据陈旧
  if (c.phase === "connecting" || c.phase === "reconnecting" || c.phase === "exhausted") return
  $connection.set({ phase: "degraded", reason })
}

/**
 * 致命错误的兼容读法。
 *
 * `exhausted` 才是"真的用不了"。**`degraded` 不算**——那正是此前两态模型
 * 分不清的那条界线。
 */
export const fatalReason = (): string | undefined => {
  const c = $connection.get()
  return c.phase === "exhausted" ? c.reason : undefined
}
