/**
 * 调度器（schedule，2026-08-22，学自 dsh-automation 的 service.ts，Apache-2.0，思路借、代码自己写）。
 *
 * 形状：一个 `pumpOnce`——对每条 active 定义认领「最近一次到期」→ 按容量启动排队的 → 按下一次到期设 timer。
 * 公开操作串成一条 promise 链，不用锁。**时钟与执行器都注入**，单测用假的。
 *
 * 没跑成也要留一条记录、说清为什么（规格 7.5）：
 *   上一次还在跑 → `skipped(overlap)`；宿主回来超过补跑窗口 → `skipped(misfire)`；
 *   宿主重启时还没跑完 → `failed(host_interrupted)`；定义在启动前被删 → `failed(definition_deleted)`；执行器抛错 → `failed(executor_error)`。
 */
import type { ScheduleStore } from "../store/schedules.js"
import { 最近一次到期, 下一次 } from "./recurrence.js"
import { 造到期运行, 造手动运行, type 定义, type 运行 } from "./domain.js"

export interface 完成 {
  status: "succeeded" | "failed" | "cancelled"
  summary?: string | undefined
  sessionId?: string | undefined
  error?: { code: string; message: string } | undefined
}
/** 真去跑一次：开会话、写任务说明、等一轮结束。由 backend 装配 */
export type 执行器 = (d: 定义, r: 运行, signal: AbortSignal) => Promise<完成>

export interface 调度器依赖 {
  store: ScheduleStore
  now: () => string
  执行: 执行器
  补跑窗口毫秒: number
  最多并发: number
  每条留几条记录: number
  log: (msg: string) => void
  /** 状态变了（界面要重取）。可不给 */
  onChange?: (() => void) | undefined
}

/** 一次 timer 最多睡 60 s（2026-08-23 审查抓的）：合盖期间单调时钟不走，一个长 timer 醒来时墙钟早过了，到期的那次会变成 misfire；短轮询醒来后立刻按墙钟判 */
const 最大timer = 60_000

export class Scheduler {
  private readonly 活着 = new Map<string, { abort: AbortController; promise: Promise<void> }>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private 链: Promise<unknown> = Promise.resolve()
  private 停了 = false

  constructor(private readonly deps: 调度器依赖) {}

  /** 启动：收拾上次没跑完的，然后 pump */
  start(): void {
    this.启动时收拾()
    void this.requestPump()
  }

  /** 宿主重启时还 queued / running 的，记成失败——它们没有机会到终态了 */
  启动时收拾(): void {
    const now = this.deps.now()
    for (const r of this.deps.store.unfinished()) {
      this.deps.store.putRun({ ...r, status: "failed", finishedAt: now, error: { code: "host_interrupted", message: "DAWN 在这次运行结束前停了" } })
    }
  }

  async stop(): Promise<void> {
    this.停了 = true
    if (this.timer) clearTimeout(this.timer)
    for (const a of this.活着.values()) a.abort.abort()
    await Promise.allSettled([...this.活着.values()].map((a) => a.promise))
  }

  /** 串行化：定义改了、到期了、手动跑了，都排进同一条链 */
  requestPump(): Promise<void> {
    const p = this.链.then(() => this.pumpOnce()).catch((e: unknown) => this.deps.log(`pump 失败：${e instanceof Error ? e.message : String(e)}`))
    this.链 = p
    return p
  }

  /** 等正在跑的都结束（测试与 stop 用） */
  async 等跑完(): Promise<void> {
    await this.链
    while (this.活着.size > 0) await Promise.allSettled([...this.活着.values()].map((a) => a.promise))
    await this.链
  }

  async pumpOnce(): Promise<void> {
    if (this.停了) return
    const now = this.deps.now()
    for (const d of this.deps.store.list()) {
      if (d.status !== "active") continue
      this.认领最近一次(d, now)
    }
    this.启动排队的()
    this.设下一次timer(now)
  }

  private 认领最近一次(d: 定义, now: string): void {
    const 到期 = 最近一次到期(d.schedule, now)
    // 定义建好 / 改过之前的到期不算——那不是它要的
    if (!到期 || Date.parse(到期) <= Date.parse(d.updatedAt)) return
    const 候选 = 造到期运行(d, 到期)
    if (this.deps.store.hasOccurrence(候选.occurrenceKey) || this.deps.store.getRun(候选.id)) return
    const 同一条的 = this.deps.store.runs(d.id, 50)
    const 重叠 = 同一条的.some((r) => r.status === "queued" || r.status === "running")
    const 晚了 = Date.parse(now) - Date.parse(到期)
    if (重叠 || 晚了 > this.deps.补跑窗口毫秒) {
      this.deps.store.putRun({
        ...候选,
        status: "skipped",
        finishedAt: now,
        error: 重叠 ? { code: "overlap", message: "上一次还在跑，这一次跳过了" } : { code: "misfire", message: `DAWN 回来时已经晚了 ${Math.round(晚了 / 60_000)} 分钟，超过补跑窗口，这一次跳过了` },
      })
      this.deps.store.prune(d.id, this.deps.每条留几条记录)
      this.deps.onChange?.()
      return
    }
    this.deps.store.putRun(候选)
    this.deps.onChange?.()
  }

  private 启动排队的(): void {
    const 容量 = Math.max(0, this.deps.最多并发 - this.活着.size)
    if (容量 === 0) return
    const 在跑的定义 = new Set([...this.活着.keys()].map((id) => this.deps.store.getRun(id)?.scheduleId))
    const 排队 = this.deps.store
      .runs(undefined, 500)
      .filter((r) => r.status === "queued" && !this.活着.has(r.id))
      .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor))
    let 启了 = 0
    for (const r of 排队) {
      if (在跑的定义.has(r.scheduleId)) continue
      在跑的定义.add(r.scheduleId)
      this.跑(r)
      if (++启了 === 容量) break
    }
  }

  private 跑(r: 运行): void {
    const abort = new AbortController()
    const promise = this.执行一次(r, abort.signal)
      .catch((e: unknown) => {
        const 现在 = this.deps.store.getRun(r.id)
        if (!现在 || (现在.status !== "queued" && 现在.status !== "running")) return
        this.deps.store.putRun({ ...现在, status: "failed", finishedAt: this.deps.now(), error: { code: "executor_error", message: e instanceof Error ? e.message : String(e) } })
      })
      .finally(() => {
        this.活着.delete(r.id)
        this.deps.onChange?.()
        if (!this.停了) void this.requestPump()
      })
    this.活着.set(r.id, { abort, promise })
  }

  private async 执行一次(r: 运行, signal: AbortSignal): Promise<void> {
    const d = this.deps.store.get(r.scheduleId)
    const now = this.deps.now()
    if (!d) {
      this.deps.store.putRun({ ...r, status: "failed", finishedAt: now, error: { code: "definition_deleted", message: "这条定时任务在这次运行开始前被删了" } })
      return
    }
    const 跑着: 运行 = { ...r, status: "running", startedAt: now }
    this.deps.store.putRun(跑着)
    this.deps.onChange?.()
    const 完 = await this.deps.执行(d, 跑着, signal)
    this.deps.store.putRun({
      ...跑着,
      status: 完.status,
      finishedAt: this.deps.now(),
      ...(完.sessionId ? { sessionId: 完.sessionId } : {}),
      ...(完.summary ? { summary: 完.summary } : {}),
      ...(完.error ? { error: 完.error } : {}),
    })
    this.deps.store.prune(d.id, this.deps.每条留几条记录)
  }

  /** 立即运行：不管暂停、不管到期；key 带 nonce，与到期那次互不冲突 */
  async 立即运行(scheduleId: string): Promise<运行> {
    const d = this.deps.store.get(scheduleId)
    if (!d) throw new Error(`没有这条定时任务：${scheduleId}`)
    const r = 造手动运行(d, this.deps.now())
    this.deps.store.putRun(r)
    this.deps.onChange?.()
    await this.requestPump()
    return r
  }

  /** 所有 active 定义里最近的下一次到期 */
  下一次到期(now: string): string | undefined {
    let 最近: number | undefined
    for (const d of this.deps.store.list()) {
      if (d.status !== "active") continue
      const n = 下一次(d.schedule, now)
      if (!n) continue
      const t = Date.parse(n)
      if (最近 === undefined || t < 最近) 最近 = t
    }
    return 最近 === undefined ? undefined : new Date(最近).toISOString()
  }

  private 设下一次timer(now: string): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const n = this.下一次到期(now)
    if (!n) return
    const delay = Math.max(1, Math.min(Date.parse(n) - Date.parse(now), 最大timer))
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.requestPump()
    }, delay)
    // 不让这个 timer 拖住进程退出
    ;(this.timer as { unref?: () => void }).unref?.()
  }
}
