/**
 * 输入租约：谁此刻握有这个会话的写权（Task 1.5，设计依据规格 7.1）。
 *
 * 四个要点：
 *   1. TTL —— 租约会过期，避免持有者崩溃后写权被永久锁死
 *   2. 观察者与控制者分离 —— 看不需要抢，抢的只是写权
 *   3. 夺权前可预览 —— 先告诉你会发生什么，再让你决定
 *   4. 每次转移留审计 —— 包括过期
 *
 * **不对称抢占：user 可抢占 engine，engine 不可抢占 user。**
 * 理由是二者的代价不对称——engine 被打断只是重跑一次，人被打断则可能丢掉
 * 正在输入的内容，且人无法像引擎那样重试。
 */
import { createHash } from "node:crypto"
import type { SessionId } from "../runtime/types.js"

export type Holder = "engine" | "user"

export interface ControllerLease {
  sessionId: SessionId
  holder: Holder
  expiresAt: string
  fingerprint: string
}

export interface TakeoverPreview {
  sessionId: SessionId
  currentHolder: Holder | null
  requester: Holder
  wouldPreempt: boolean
  allowed: boolean
}

export interface LeaseAuditEvent {
  sessionId: SessionId
  action: "acquire" | "takeover" | "release" | "expire"
  holder: Holder
  at: string
  fingerprint: string
}

function fingerprint(sessionId: string, holder: Holder, at: Date): string {
  return createHash("sha256")
    .update(`${sessionId}|${holder}|${at.toISOString()}`)
    .digest("hex")
    .slice(0, 16)
}

export class LeaseManager {
  private readonly leases = new Map<SessionId, ControllerLease>()
  private readonly observers_ = new Map<SessionId, Set<string>>()
  private readonly audits = new Map<SessionId, LeaseAuditEvent[]>()
  private readonly lastSeen = new Map<SessionId, number>()
  private readonly ttlSeconds: number

  constructor(opts: { ttlSeconds: number }) {
    this.ttlSeconds = opts.ttlSeconds
  }

  private isExpired(lease: ControllerLease, now: Date): boolean {
    return new Date(lease.expiresAt).getTime() <= now.getTime()
  }

  /**
   * 单调时间断言。写权的审计链若允许时间回退就失去证据价值——
   * 「谁先谁后」是判定责任的唯一依据。
   */
  private assertMonotonic(sessionId: SessionId, now: Date): void {
    const last = this.lastSeen.get(sessionId)
    if (last !== undefined && now.getTime() < last) {
      throw new Error(`会话 "${sessionId}" 的时间戳回退：${now.toISOString()} 早于上次记录`)
    }
    this.lastSeen.set(sessionId, now.getTime())
  }

  private record(ev: LeaseAuditEvent): void {
    const list = this.audits.get(ev.sessionId) ?? []
    list.push(ev)
    this.audits.set(ev.sessionId, list)
  }

  /**
   * 清掉已过期的租约并补记 `expire` 审计。
   *
   * 过期同样是一次写权转移，审计链不能在这里断掉，否则「engine 为什么突然拿到了
   * 写权」在日志里将无法解释。事件时间取租约的 expiresAt 而非发现它的时刻——
   * 前者才是它真正失效的时间。
   */
  private reapExpired(sessionId: SessionId, now: Date): void {
    const lease = this.leases.get(sessionId)
    if (!lease || !this.isExpired(lease, now)) return
    this.leases.delete(sessionId)
    this.record({
      sessionId,
      action: "expire",
      holder: lease.holder,
      at: lease.expiresAt,
      fingerprint: lease.fingerprint,
    })
  }

  /** 当前有效租约；已过期则视为不存在。本方法无副作用。 */
  current(sessionId: SessionId, now: Date = new Date()): ControllerLease | undefined {
    const lease = this.leases.get(sessionId)
    if (!lease) return undefined
    return this.isExpired(lease, now) ? undefined : lease
  }

  /** 纯查询：不改状态、不写审计、不推进时间戳。 */
  previewTakeover(sessionId: SessionId, requester: Holder, now: Date = new Date()): TakeoverPreview {
    const active = this.current(sessionId, now)
    if (!active) {
      return { sessionId, currentHolder: null, requester, wouldPreempt: false, allowed: true }
    }
    // user 可抢占 engine；engine 不可抢占 user；同一方视为续期
    const allowed = requester === "user" || active.holder === requester
    return {
      sessionId,
      currentHolder: active.holder,
      requester,
      wouldPreempt: active.holder !== requester,
      allowed,
    }
  }

  acquire(sessionId: SessionId, holder: Holder, now: Date = new Date()): ControllerLease {
    this.assertMonotonic(sessionId, now)
    this.reapExpired(sessionId, now)

    const preview = this.previewTakeover(sessionId, holder, now)
    if (!preview.allowed) {
      // 拒绝路径上不得改动任何状态——失败的抢占不应留下痕迹或破坏现有租约
      throw new Error(
        `会话 "${sessionId}" 的写权由 ${preview.currentHolder} 持有，${holder} 不得抢占`,
      )
    }

    const lease: ControllerLease = {
      sessionId,
      holder,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
      fingerprint: fingerprint(sessionId, holder, now),
    }
    this.leases.set(sessionId, lease)
    this.record({
      sessionId,
      action: preview.wouldPreempt ? "takeover" : "acquire",
      holder,
      at: now.toISOString(),
      fingerprint: lease.fingerprint,
    })
    return lease
  }

  release(sessionId: SessionId, now: Date = new Date()): void {
    this.assertMonotonic(sessionId, now)
    this.reapExpired(sessionId, now) // 已过期的走 expire，不该再记一条 release
    const lease = this.leases.get(sessionId)
    if (!lease) return
    this.leases.delete(sessionId)
    this.record({
      sessionId,
      action: "release",
      holder: lease.holder,
      at: now.toISOString(),
      fingerprint: lease.fingerprint,
    })
  }

  /** 观察者只读，与写权无关。返回退订函数。 */
  observe(sessionId: SessionId, clientId: string): () => void {
    let set = this.observers_.get(sessionId)
    if (!set) {
      set = new Set()
      this.observers_.set(sessionId, set)
    }
    const target = set // 固定引用，避免退订时误删后来重建的集合
    target.add(clientId)
    return () => {
      target.delete(clientId)
    }
  }

  observers(sessionId: SessionId): string[] {
    return [...(this.observers_.get(sessionId) ?? [])]
  }

  audit(sessionId: SessionId): LeaseAuditEvent[] {
    return [...(this.audits.get(sessionId) ?? [])]
  }
}
