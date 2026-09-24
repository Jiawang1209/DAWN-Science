/**
 * 侧边对话的后端一侧（7.37，spec `2026-09-24-侧边对话-design.md` §3.2 / §3.3）。
 *
 * 真 `createWorkbenchBackend` + 真 `SessionManager`，运行时是 `FakeRuntime` 的替身：
 * native 那份多长一个 `setSideTool`（记下每次开关），另一份不长——即 acp / cli 那类「看不见主对话」的。
 * 工具本身读不读得到、模型会不会调，归 native 的单元测试与 e2e。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId } from "../../src/runtime/types.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { WorkbenchServer, fault原样 } from "../../src/workbench/server.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

/** native 的替身：记下每一次开关 */
class 带侧边工具的 extends FakeRuntime {
  readonly 开关: string[] = []
  setSideTool(sessionId: SessionId, on: boolean): void {
    this.开关.push(`${sessionId}:${on}`)
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime: FakeRuntime = new 带侧边工具的()) {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  let 读主对话: ((sid: string) => string | undefined) | undefined
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
    挂上读主对话: (读) => { 读主对话 = 读 },
  })
  const repo = mkdtempSync(join(tmpdir(), "dawn-side-"))
  dirs.push(repo)
  const 开任务 = async () => (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string; taskId: string }
  const 开一段 = async () => (await 开任务()).sessionId
  return { backend, events, runtime, sessions, runStore, 开一段, 开任务, 读: (sid: string) => 读主对话?.(sid) }
}

describe("setSideSession", () => {
  it("挂上 → 那段启用一次；拿下 → 停用；主区换了不动坞里那段", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    const m2 = await ctx.开一段()
    expect(await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })).toEqual({ canReadMain: true })
    expect(rt.开关).toEqual([`${s}:true`])
    await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m2 })
    expect(rt.开关).toEqual([`${s}:true`])
    expect(await ctx.backend.setSideSession({ sideSessionId: null, mainSessionId: m2 })).toEqual({})
    expect(rt.开关).toEqual([`${s}:true`, `${s}:false`])
  })

  it("运行时没有这件工具 → canReadMain: false（界面据此写「看不见主对话」）", async () => {
    const ctx = make(new FakeRuntime())
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    expect(await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })).toEqual({ canReadMain: false })
  })

  it("坞里那段被归档 / 删除 / 关闭 → 工具停用、对照表摘掉", async () => {
    for (const 怎么没的 of ["archive", "delete", "stop"] as const) {
      const ctx = make()
      const rt = ctx.runtime as 带侧边工具的
      const s = await ctx.开一段()
      const m = await ctx.开一段()
      await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
      if (怎么没的 === "archive") await ctx.backend.setSessionArchived({ sessionId: s, archived: true })
      else if (怎么没的 === "delete") await ctx.backend.deleteSession({ sessionId: s })
      else await ctx.backend.stopSession({ sessionId: s })
      expect(rt.开关, 怎么没的).toEqual([`${s}:true`, `${s}:false`])
      // 摘掉了：再说一次「没有侧边」不会重复停用
      await ctx.backend.setSideSession({ sideSessionId: null, mainSessionId: m })
      expect(rt.开关, 怎么没的).toEqual([`${s}:true`, `${s}:false`])
    }
  })

  it("主区那段被删 → 只清主，坞里那段的工具不动", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
    await ctx.backend.deleteSession({ sessionId: m })
    expect(rt.开关).toEqual([`${s}:true`])
    expect(ctx.读(s)).toBeUndefined()
  })
})

it("主区那段被关闭 → 配对留着：它的转录还在，侧边照样读得到；坞里那段的工具不动", async () => {
  const ctx = make()
  const rt = ctx.runtime as 带侧边工具的
  const s = await ctx.开一段()
  const m = await ctx.开一段()
  ctx.events.userTurn(m, "先跑一遍差异分析")
  await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
  await ctx.backend.stopSession({ sessionId: m })
  expect(rt.开关).toEqual([`${s}:true`])
  expect(ctx.读(s)).toContain("先跑一遍差异分析")
})

describe("读主对话", () => {
  it("配对后读得到主对话的发言；拿下后 undefined；不是侧边的那段读不到", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    ctx.events.userTurn(m, "帮我把 counts.csv 画成热图")
    ctx.events.ingest(m, { kind: "output", sessionId: m, data: "好的，先读一下这份表" })
    expect(ctx.读(s)).toBeUndefined()

    await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
    const 字 = ctx.读(s)
    expect(字).toContain("帮我把 counts.csv 画成热图")
    expect(字).toContain("好的，先读一下这份表")
    expect(ctx.读(m)).toBeUndefined()

    await ctx.backend.setSideSession({ sideSessionId: null, mainSessionId: m })
    expect(ctx.读(s)).toBeUndefined()
  })
})

describe("查无此会话（审查 09-24）", () => {
  it("side 不存在：不记、原来那段照常停用、回 sideGone", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
    expect(await ctx.backend.setSideSession({ sideSessionId: "关着时被删了", mainSessionId: m })).toEqual({ sideGone: true })
    expect(rt.开关).toEqual([`${s}:true`, `${s}:false`])
    expect(ctx.读("关着时被删了")).toBeUndefined()
    // 真没记：再说一次「没有侧边」不会多停一次，也不会去停那段死 id
    await ctx.backend.setSideSession({ sideSessionId: null, mainSessionId: m })
    expect(rt.开关).toEqual([`${s}:true`, `${s}:false`])
  })

  it("main 不存在：当作没有主区——侧边照挂，但读不到主对话", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    expect(await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: "没这段" })).toEqual({ canReadMain: true })
    expect(rt.开关).toEqual([`${s}:true`])
    expect(ctx.读(s)).toBeUndefined()
  })

  it("side 与 main 是同一段 → 当作没有侧边", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    expect(await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: s })).toEqual({})
    expect(rt.开关).toEqual([])
    expect(ctx.读(s)).toBeUndefined()
  })
})

describe("别的删法也摘坞", () => {
  it("deleteProject / deleteArchivedSessions / deleteTask 各自把坞里那段停掉、对照表摘掉", async () => {
    for (const 怎么删 of ["project", "archived", "task"] as const) {
      const ctx = make()
      const rt = ctx.runtime as 带侧边工具的
      const 侧任务 = await ctx.开任务()
      const s = 侧任务.sessionId
      const m = await ctx.开一段()
      await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
      if (怎么删 === "project") {
        await ctx.backend.deleteProject({ projectId: ctx.sessions.get(s)!.projectId! })
      } else if (怎么删 === "archived") {
        // 归档那一下已经摘了；这里要证的是「删全部归档」自己也摘——所以先绕过后端直接归档
        ctx.sessions.setArchived(s, true)
        await ctx.backend.deleteArchivedSessions({})
      } else {
        await ctx.backend.deleteTask({ taskId: 侧任务.taskId })
      }
      expect(rt.开关, 怎么删).toEqual([`${s}:true`, `${s}:false`])
      await ctx.backend.setSideSession({ sideSessionId: null, mainSessionId: null })
      expect(rt.开关, 怎么删).toEqual([`${s}:true`, `${s}:false`])
    }
  })

  it("归档的是主区那段 → 只清主，坞里那段的工具不动", async () => {
    const ctx = make()
    const rt = ctx.runtime as 带侧边工具的
    const s = await ctx.开一段()
    const m = await ctx.开一段()
    ctx.events.userTurn(m, "主区的话")
    await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
    await ctx.backend.setSessionArchived({ sessionId: m, archived: true })
    expect(rt.开关).toEqual([`${s}:true`])
    expect(ctx.读(s)).toBeUndefined()
  })
})

it("读主对话带上待发单、产物与没记下的次数", async () => {
  const ctx = make()
  const s = await ctx.开一段()
  const m = await ctx.开一段()
  ctx.events.userTurn(m, "跑一下")
  ctx.events.setQueued(m, [{ id: "q1", text: "顺便画个火山图", behavior: "followUp" }])
  const 基 = { projectId: ctx.sessions.get(m)!.projectId!, sessionId: m, origin: "agent" as const, status: "completed" as const, startedAt: "2026-09-24T00:00:00Z", finishedAt: "2026-09-24T00:00:01Z", hasError: false }
  ctx.runStore.insert({ ...基, runId: "r1", requestType: "tool_call:bash", filesCreated: ["outputs/volcano.png"], toolCallId: "c1" })
  ctx.runStore.insert({ ...基, runId: "r2", requestType: "tool_call:bash", toolCallId: "c2" })
  await ctx.backend.setSideSession({ sideSessionId: s, mainSessionId: m })
  const 字 = ctx.读(s)!
  expect(字).toContain("顺便画个火山图")
  expect(字).toContain("outputs/volcano.png")
  expect(字).toContain("另有 1 次工具调用没有记下它写了哪些文件")
})

/**
 * 坞里那段「真没了」的结构化信号（Task 6 复审 F1）：界面不再认错误文本，看 `details.gone`。
 * 走真 `WorkbenchServer`——要证的是这个标记**过得了协议那一层**，不只是后端抛出来的对象上有。
 */
describe("subscribeSession 的 gone 标记", () => {
  it("压根没有这段记录 → not_found 且 details.gone === true", async () => {
    const ctx = make()
    const server = new WorkbenchServer(ctx.backend)
    const r = await server.handle("subscribeSession", { sessionId: "从来没有这段" })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe("not_found")
    expect((r.error.details as { gone?: boolean } | undefined)?.gone).toBe(true)
  })

  it("有记录的那段订阅得上，不会被误判成没了", async () => {
    const ctx = make()
    const server = new WorkbenchServer(ctx.backend)
    const s = await ctx.开一段()
    expect((await server.handle("subscribeSession", { sessionId: s })).ok).toBe(true)
  })

  it("fault原样 挂的 detail 与 i18n 并存；不挂时 details 照旧不出现", async () => {
    const 挂了 = new WorkbenchServer({ ...make().backend, listProjects: async () => { throw fault原样("not_found", "x", { gone: true }) } })
    const r1 = await 挂了.handle("listProjects", {})
    expect(!r1.ok && r1.error.details).toEqual({ gone: true })
    const 没挂 = new WorkbenchServer({ ...make().backend, listProjects: async () => { throw fault原样("not_found", "x") } })
    const r2 = await 没挂.handle("listProjects", {})
    expect(!r2.ok && r2.error.details).toBeUndefined()
  })
})
