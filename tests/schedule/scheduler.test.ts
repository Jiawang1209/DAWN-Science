/**
 * 调度器（schedule，2026-08-22，学自 dsh-automation 的 service.ts）。假时钟、假执行器、真 SQLite（内存）。
 * 铁律：at-most-once；重叠跳过并记一条；超过补跑窗口跳过并记一条；重启把没跑完的记成失败；暂停的不认领。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { ScheduleStore } from "../../src/store/schedules.js"
import { Scheduler, type 执行器 } from "../../src/schedule/scheduler.js"
import type { 定义 } from "../../src/schedule/domain.js"

const dbs: Database.Database[] = []
afterEach(() => {
  for (const d of dbs.splice(0)) d.close()
  vi.useRealTimers()
})

function 造(now = "2026-08-22T00:00:00.000Z", opts: { 执行?: 执行器; 补跑分钟?: number } = {}) {
  const db = new Database(":memory:")
  dbs.push(db)
  migrate(db)
  const store = new ScheduleStore(db)
  let 钟 = Date.parse(now)
  const 跑过: string[] = []
  let 放行: (() => void) | undefined
  const 执行: 执行器 =
    opts.执行 ??
    (async (d, r) => {
      跑过.push(r.id)
      return { status: "succeeded", summary: `跑了 ${d.name}`, sessionId: `s-${r.id}` }
    })
  const s = new Scheduler({ store, now: () => new Date(钟).toISOString(), 执行, 补跑窗口毫秒: (opts.补跑分钟 ?? 15) * 60_000, 最多并发: 2, 每条留几条记录: 50, log: () => {} })
  const 拨到 = async (iso: string) => {
    钟 = Date.parse(iso)
    await s.pumpOnce()
  }
  const 定义 = (部分: Partial<定义> = {}): 定义 => ({
    id: "d1", revision: 1, name: "每天八点", prompt: "看看数据", status: "active",
    schedule: { kind: "daily", time: "08:00", timeZone: "Asia/Shanghai" },
    // 定义建在前一天：到期时刻 <= updatedAt 的不认领（那不是它要的），用例里别撞上
    agentId: "a", workspace: "/w", permission: "deny-risky", createdAt: "2026-08-21T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z", ...部分,
  })
  return { db, store, s, 拨到, 跑过, 定义, 放行: () => 放行?.(), 设放行: (f: () => void) => (放行 = f) }
}

describe("Scheduler", () => {
  it("到期一次只跑一次：pump 跑几遍都只有一条记录；下一次到期再跑一次", async () => {
    const { store, s, 拨到, 跑过, 定义 } = 造()
    store.put(定义())
    await 拨到("2026-08-22T00:00:00.000Z") // 上海 08:00
    await s.等跑完()
    expect(跑过).toHaveLength(1)
    await 拨到("2026-08-22T00:05:00.000Z")
    await 拨到("2026-08-22T00:10:00.000Z")
    await s.等跑完()
    expect(跑过).toHaveLength(1)
    expect(store.runs("d1")).toHaveLength(1)
    expect(store.runs("d1")[0]).toMatchObject({ status: "succeeded", summary: "跑了 每天八点", sessionId: "s-" + 跑过[0], trigger: "schedule", scheduledFor: "2026-08-22T00:00:00.000Z" })
    await 拨到("2026-08-23T00:00:30.000Z")
    await s.等跑完()
    expect(跑过).toHaveLength(2)
  })

  it("定义建好之前的到期不算（updatedAt 之后才认领）", async () => {
    const { store, s, 拨到, 跑过, 定义 } = 造("2026-08-22T01:00:00.000Z")
    store.put(定义({ createdAt: "2026-08-22T01:00:00.000Z", updatedAt: "2026-08-22T01:00:00.000Z" }))
    await 拨到("2026-08-22T01:00:00.000Z") // 今天 08:00 已过、但在定义之前
    await s.等跑完()
    expect(跑过).toHaveLength(0)
  })

  it("上一次还在跑：这一次记成 skipped(overlap)，不并跑", async () => {
    let 放 = () => {}
    const 执行: 执行器 = (_d, _r) => new Promise((resolve) => { 放 = () => resolve({ status: "succeeded" }) })
    const { store, s, 拨到, 定义 } = 造("2026-08-22T00:00:00.000Z", { 执行 })
    store.put(定义({ schedule: { kind: "interval", everyMinutes: 5, anchor: "2026-08-22T00:00:00.000Z", timeZone: "Asia/Shanghai" } }))
    await 拨到("2026-08-22T00:00:00.000Z")
    await 拨到("2026-08-22T00:05:00.000Z")
    const 记录 = store.runs("d1")
    expect(记录.map((r) => r.status).sort()).toEqual(["running", "skipped"])
    expect(记录.find((r) => r.status === "skipped")?.error?.code).toBe("overlap")
    放()
    await s.等跑完()
    expect(store.runs("d1").find((r) => r.scheduledFor === "2026-08-22T00:00:00.000Z")?.status).toBe("succeeded")
  })

  it("宿主回来时超过补跑窗口：记成 skipped(misfire)，不补跑；窗口内补跑", async () => {
    const { store, s, 拨到, 跑过, 定义 } = 造()
    store.put(定义())
    await 拨到("2026-08-22T00:10:00.000Z") // 晚 10 分钟，窗口 15 → 补
    await s.等跑完()
    expect(跑过).toHaveLength(1)
    await 拨到("2026-08-23T01:00:00.000Z") // 晚 60 分钟 → 跳
    await s.等跑完()
    expect(跑过).toHaveLength(1)
    const 跳 = store.runs("d1").find((r) => r.scheduledFor === "2026-08-23T00:00:00.000Z")
    expect(跳).toMatchObject({ status: "skipped", error: { code: "misfire" } })
  })

  it("重启：还 queued / running 的记成 failed(host_interrupted)", async () => {
    const { store, s, 定义 } = 造()
    store.put(定义())
    store.putRun({ id: "r1", scheduleId: "d1", revision: 1, occurrenceKey: "k1", trigger: "schedule", scheduledFor: "2026-08-21T00:00:00.000Z", status: "running", prompt: "x" })
    s.启动时收拾()
    expect(store.getRun("r1")).toMatchObject({ status: "failed", error: { code: "host_interrupted" } })
  })

  it("暂停的不认领；立即运行不管暂停、不管到期，且与到期那次互不冲突", async () => {
    const { store, s, 拨到, 跑过, 定义 } = 造()
    store.put(定义({ status: "paused" }))
    await 拨到("2026-08-22T00:00:00.000Z")
    await s.等跑完()
    expect(跑过).toHaveLength(0)
    const r = await s.立即运行("d1")
    await s.等跑完()
    expect(跑过).toHaveLength(1)
    expect(store.getRun(r.id)).toMatchObject({ trigger: "manual", status: "succeeded" })
  })

  it("执行器抛错：记成 failed(executor_error)，说清原因", async () => {
    const { store, s, 拨到, 定义 } = 造("2026-08-22T00:00:00.000Z", { 执行: async () => { throw new Error("模型没配钥匙") } })
    store.put(定义())
    await 拨到("2026-08-22T00:00:00.000Z")
    await s.等跑完()
    expect(store.runs("d1")[0]).toMatchObject({ status: "failed", error: { code: "executor_error", message: "模型没配钥匙" } })
  })

  it("下一次到期的 timer 按最近的那条定义设", async () => {
    vi.useFakeTimers()
    const { store, s, 定义 } = 造("2026-08-22T00:00:00.000Z")
    store.put(定义({ id: "晚", schedule: { kind: "daily", time: "20:00", timeZone: "Asia/Shanghai" } }))
    store.put(定义({ id: "早", schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Shanghai" } }))
    expect(s.下一次到期("2026-08-22T00:00:00.000Z")).toBe("2026-08-22T01:00:00.000Z")
  })
})
