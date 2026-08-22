/**
 * 定时任务六个操作 + 执行器整条路（7.19，schedule）。
 * 运行时是会说 turn_end 的假模型：写进去 → 回 `echo:<说明>` → 这一轮结束 → run 记成 succeeded、摘要就是那句。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
import type { SessionId } from "../../src/runtime/types.js"

/** 会把这一轮说完的假模型 */
class 会收尾的假模型 extends FakeRuntime {
  override write(sessionId: SessionId, data: string): void {
    super.write(sessionId, data)
    // FakeRuntime 的 emit 是私有的；借 stop 之外唯一的出口——再发一条 turn_end
    ;(this as unknown as { emit: (e: { kind: "turn_end"; sessionId: SessionId }) => void }).emit({ kind: "turn_end", sessionId })
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make() {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const runtime = new 会收尾的假模型()
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry })
  const schedules = new ScheduleStore(db)
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry, events,
    tasks: new TaskStore(db), schedules, scheduleConfig: { 超时分钟: 1 },
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
  })
  return { backend, schedules, sessions, events }
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
