/**
 * 定时任务六个操作 + 执行器整条路（7.19，schedule）。
 * turn_end 只收口一次模型发言；idle 才代表整次请求结束。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { ScheduleStore } from "../../src/store/schedules.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { AgentEvent, SessionId, SessionSpec } from "../../src/runtime/types.js"

/** 会把这一轮说完的假模型 */
class 会收尾的假模型 extends FakeRuntime {
  override write(sessionId: SessionId, data: string): void {
    super.write(sessionId, data)
    // FakeRuntime 的 emit 是私有的；借 stop 之外唯一的出口——再发一条 turn_end
    ;(this as unknown as { emit: (e: { kind: "turn_end"; sessionId: SessionId }) => void }).emit({ kind: "turn_end", sessionId })
    ;(this as unknown as { emit: (e: AgentEvent) => void }).emit({ kind: "idle", sessionId })
  }
}

/** 手动推进真实事件中枢，精确停在多次模型迭代之间。 */
class 分步模型 extends FakeRuntime {
  sessionId?: SessionId
  override write(sessionId: SessionId): void { this.sessionId = sessionId }
  send(event: AgentEvent): void {
    ;(this as unknown as { emit: (e: AgentEvent) => void }).emit(event)
  }
  say(text: string): void {
    this.send({ kind: "output", sessionId: this.sessionId!, data: text })
    this.send({ kind: "turn_end", sessionId: this.sessionId! })
  }
  finish(): void { this.send({ kind: "idle", sessionId: this.sessionId! }) }
  async abort(): Promise<void> { this.finish() }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  vi.useRealTimers()
})

function make(runtime: FakeRuntime = new 会收尾的假模型(), timeoutMinutes = 1) {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry })
  const schedules = new ScheduleStore(db)
  const disposers: (() => void | Promise<void>)[] = []
  const finished = vi.fn()
  const scratchRoot = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  dirs.push(scratchRoot)
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry, events,
    tasks: new TaskStore(db), schedules, scheduleConfig: { 超时分钟: timeoutMinutes, 最多并发: 1 },
    scratchRoot, 注册收摊: f => disposers.push(f), 定时结束了: finished,
  })
  const dispose = async () => { for (const f of disposers.reverse()) await f(); await sessions.stopAll(); events.dispose(); db.close() }
  cleanups.push(dispose)
  return { backend, schedules, sessions, events, finished, dispose }
}

describe("定时任务", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = mkdtempSync(join(tmpdir(), "dawn-sch-"))
    dirs.push(repo)
  })
  const 计划 = { kind: "daily" as const, time: "08:00", timeZone: "Asia/Shanghai" }

  it("建 / 改 / 列 / 删：改了版本号 +1；列表带下一次；删了定义记录还在", async () => {
    const d = (await ctx.backend.createSchedule({ name: "早报", prompt: "看看数据", schedule: 计划, agentId: "ds-chat", workspace: repo })) as { id: string; revision: number; nextAt?: string; where: string }
    expect(d).toMatchObject({ revision: 1, where: repo })
    expect(d.nextAt).toMatch(/T00:00:00\.000Z$/)
    const 改 = (await ctx.backend.updateSchedule({ id: d.id, status: "paused", name: "早报 2" })) as { revision: number; status: string; nextAt?: string }
    expect(改).toMatchObject({ revision: 2, status: "paused" })
    expect(改.nextAt).toBeUndefined()
    const 列 = (await ctx.backend.listSchedules({})) as { schedules: { name: string }[] }
    expect(列.schedules.map((x) => x.name)).toEqual(["早报 2"])
    await ctx.backend.deleteSchedule({ id: d.id })
    expect(((await ctx.backend.listSchedules({})) as { schedules: unknown[] }).schedules).toEqual([])
  })

  it("坏计划、不存在的 agent、没连的服务器，各自拒", async () => {
    await expect(ctx.backend.createSchedule({ name: "x", prompt: "y", schedule: { kind: "daily", time: "08:00", timeZone: "Mars/X" }, agentId: "ds-chat", workspace: repo })).rejects.toThrow(/时区/)
    await expect(ctx.backend.createSchedule({ name: "x", prompt: "y", schedule: 计划, agentId: "没有", workspace: repo })).rejects.toThrow(/agent/)
    await expect(ctx.backend.createSchedule({ name: "x", prompt: "y", schedule: 计划, agentId: "ds-chat", connectionId: "没这台" })).rejects.toThrow(/服务器|远端/)
  })

  it("**立即运行走完整条路**：全新会话、标题带任务名、摘要是 agent 那一轮的话、会话留在项目里", async () => {
    const d = (await ctx.backend.createSchedule({ name: "早报", prompt: "看看数据", schedule: 计划, agentId: "ds-chat", workspace: repo })) as { id: string }
    const r = (await ctx.backend.runScheduleNow({ id: d.id })) as { id: string; trigger: string }
    expect(r.trigger).toBe("manual")
    await new Promise((res) => setTimeout(res, 300))
    const 记录 = ctx.schedules.getRun(r.id)!
    expect(记录.status).toBe("succeeded")
    expect(记录.summary).toBe("echo:看看数据")
    expect(记录.sessionId).toBeTruthy()
    const rec = ctx.sessions.get(记录.sessionId!)!
    expect(rec.title).toMatch(/^早报 · /)
    const 摘 = (await ctx.backend.listSchedules({})) as { schedules: { lastRun?: { status: string } }[] }
    expect(摘.schedules[0]!.lastRun).toMatchObject({ status: "succeeded" })
    const 跑 = (await ctx.backend.listScheduleRuns({ id: d.id, limit: 10 })) as { runs: { status: string }[] }
    expect(跑.runs).toHaveLength(1)
  })
})

const daily = { kind: "daily" as const, time: "08:00", timeZone: "Asia/Shanghai" }
async function startStepRun(timeoutMinutes = 1) {
  const runtime = new 分步模型()
  const ctx = make(runtime, timeoutMinutes)
  const definition = await ctx.backend.createSchedule({ name: "分步分析", prompt: "分析数据并交付", schedule: daily, agentId: "ds-chat" }) as { id: string }
  const run = await ctx.backend.runScheduleNow({ id: definition.id }) as { id: string }
  await vi.waitFor(() => expect(runtime.sessionId).toBeTruthy())
  return { ...ctx, runtime, run, definition }
}

describe("定时运行的完整回合", () => {
  it("中间发言结束仍在运行并占用容量，只有 idle 后才用最终回复结算一次", async () => {
    const c = await startStepRun()
    const observed = new Promise<void>(resolve => {
      const off = c.events.onAnyUpdate(u => {
        if (u.sessionId === c.runtime.sessionId && u.type === "item" && u.item.type === "turn" && u.item.final) { off(); resolve() }
      })
    })
    c.runtime.say("我先读取数据，之后再分析")
    await observed
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(c.schedules.getRun(c.run.id)?.status).toBe("running")
    expect(c.finished).not.toHaveBeenCalled()
    const next = await c.backend.runScheduleNow({ id: c.definition.id }) as { id: string }
    expect(c.schedules.getRun(next.id)?.status).toBe("queued")
    c.runtime.say("结果已经保存，分析结束")
    c.runtime.finish()
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "succeeded", summary: "结果已经保存，分析结束" }))
    expect(c.finished).toHaveBeenCalledTimes(1)
  })

  it("中间回复后的模型失败由 idle 结算为 failed，保留实际错误", async () => {
    const c = await startStepRun()
    c.runtime.say("先检查输入")
    c.runtime.send({ kind: "notice", sessionId: c.runtime.sessionId!, text: "模型调用失败", rawError: "mock: service unavailable", failed: true })
    c.runtime.finish()
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "failed", error: { code: "agent_error", message: "模型调用失败：mock: service unavailable" } }))
    expect(c.finished).toHaveBeenCalledTimes(1)
  })

  it("idle 会收口尚未 turn_end 的最终回复；迟到的结束事件不重复结算", async () => {
    const c = await startStepRun()
    c.runtime.send({ kind: "output", sessionId: c.runtime.sessionId!, data: "最终答复" })
    c.runtime.finish()
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "succeeded", summary: "最终答复" }))
    c.runtime.finish()
    expect(c.finished).toHaveBeenCalledTimes(1)
  })

  it("无文本但正常结束可以完成，不编造摘要", async () => {
    const c = await startStepRun()
    c.runtime.finish()
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)?.status).toBe("succeeded"))
    expect(c.schedules.getRun(c.run.id)?.summary).toBeUndefined()
  })

  it("超时先标失败，中止产生的同步 idle 和迟到回复不能改成成功", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const c = await startStepRun(0.01)
    c.runtime.say("分析尚未结束")
    await vi.advanceTimersByTimeAsync(600)
    expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "failed", error: { code: "timeout" } })
    c.runtime.say("迟到的成功")
    c.runtime.finish()
    expect(c.schedules.getRun(c.run.id)?.status).toBe("failed")
    expect(c.finished).toHaveBeenCalledTimes(1)
  })

  it("宿主停止时保持 cancelled，中止的同步 idle 不抢先成功", async () => {
    const c = await startStepRun()
    c.runtime.say("仍在分析")
    await c.dispose()
    cleanups.splice(cleanups.indexOf(c.dispose), 1)
    expect(c.finished).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "cancelled", error: expect.objectContaining({ code: "cancelled" }) }))
  })

  it("用户在定时会话按停止，整轮 idle 结算为取消", async () => {
    const c = await startStepRun()
    c.runtime.say("仍在分析")
    await c.backend.abortSession({ sessionId: c.runtime.sessionId! })
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "cancelled", error: { code: "cancelled" } }))
    expect(c.finished).toHaveBeenCalledTimes(1)
  })

  it("创建会话期间宿主停止，启动晚到后不发送任务说明", async () => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    class 启动慢的模型 extends 分步模型 {
      override async start(spec: SessionSpec) { entered(); await gate; return super.start(spec) }
    }
    const runtime = new 启动慢的模型()
    const c = make(runtime)
    const definition = await c.backend.createSchedule({ name: "慢启动", prompt: "不要在取消后发送", schedule: daily, agentId: "ds-chat" }) as { id: string }
    await c.backend.runScheduleNow({ id: definition.id })
    await started
    const stopped = c.dispose()
    release()
    await stopped
    cleanups.splice(cleanups.indexOf(c.dispose), 1)
    expect(runtime.sessionId).toBeUndefined()
    expect(c.finished).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "cancelled" }))
  })

  it("中间回复后会话退出仍是失败，迟到 idle 不改写", async () => {
    const c = await startStepRun()
    c.runtime.say("仍在分析")
    await c.sessions.stop(c.runtime.sessionId!)
    await vi.waitFor(() => expect(c.schedules.getRun(c.run.id)).toMatchObject({ status: "failed", error: { code: "session_exited" } }))
    c.runtime.finish()
    expect(c.finished).toHaveBeenCalledTimes(1)
  })
})
