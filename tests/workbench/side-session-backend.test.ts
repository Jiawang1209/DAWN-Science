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
  const 开一段 = async () => ((await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }).sessionId
  return { backend, events, runtime, 开一段, 读: (sid: string) => 读主对话?.(sid) }
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
