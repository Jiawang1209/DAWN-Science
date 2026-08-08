import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionEventHub } from "../../src/workbench/events.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionManager } from "../../src/session/manager.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { WorkbenchServer } from "../../src/workbench/server.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

const registry: ProviderRegistry = {
  endpoints: {
    ds: { baseUrl: "https://api.deepseek.com/v1", apiKey: "k", models: ["deepseek-v4-flash"] },
  },
  agents: {
    "ds-chat": { kind: "native", endpoint: "ds", model: "deepseek-v4-flash", capabilities: ["chat"] },
  },
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-wb-"))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env })
  writeFileSync(join(dir, "seed.txt"), "seed\n")
  execFileSync("git", ["add", "."], { cwd: dir, env })
  execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir, env })
  return dir
}

function make() {
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const runtime = new FakeRuntime()
  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: tmpdir(),
  })
  const projects = new ProjectManager({
    projects: projectStore, sessions: sessionStore, runs: runStore, registry,
  })
  const events = new SessionEventHub({ maxChars: 10_000 })
  const backend = createWorkbenchBackend({ projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry, events })
  return { db, projectStore, runStore, sessions, projects, backend, events, server: new WorkbenchServer(backend) }
}

describe("真实后端 · 经服务端端到端", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = newRepo()
  })

  it("openProject → listProjects 能看到它", async () => {
    const opened = await ctx.server.handle("openProject", { workspace: repo })
    expect(opened.ok).toBe(true)
    const list = await ctx.server.handle("listProjects", {})
    expect((list as { data: unknown[] }).data).toHaveLength(1)
  })

  it("重复 openProject 不产生第二个项目", async () => {
    await ctx.server.handle("openProject", { workspace: repo })
    await ctx.server.handle("openProject", { workspace: repo })
    const list = await ctx.server.handle("listProjects", {})
    expect((list as { data: unknown[] }).data).toHaveLength(1)
  })

  it("不存在的项目 → not_found，而不是 internal_error", async () => {
    const r = await ctx.server.handle("getProject", { projectId: "nope" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })

  it("createSession 后 listSessions 能看到，且归属正确", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    const created = await ctx.server.handle("createSession", { projectId: pid, agentId: "ds-chat" })
    expect(created.ok).toBe(true)

    const list = await ctx.server.handle("listSessions", { projectId: pid })
    const sessions = (list as { data: { sessionId: string; projectId: string }[] }).data
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.projectId).toBe(pid)
  })

  it("无租约写入 → conflict，而不是 internal_error", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    const c = await ctx.server.handle("createSession", { projectId: pid, agentId: "ds-chat" })
    const sid = (c as { data: { sessionId: string } }).data.sessionId

    const w = await ctx.server.handle("writeToSession", { sessionId: sid, data: "hi", as: "user" })
    expect(w.ok).toBe(false)
    if (!w.ok) expect(w.error.code).toBe("conflict")
  })

  it("取得租约后写入成功", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    const c = await ctx.server.handle("createSession", { projectId: pid, agentId: "ds-chat" })
    const sid = (c as { data: { sessionId: string } }).data.sessionId

    expect((await ctx.server.handle("acquireLease", { sessionId: sid, holder: "user" })).ok).toBe(true)
    expect((await ctx.server.handle("writeToSession", { sessionId: sid, data: "hi", as: "user" })).ok).toBe(true)
  })

  it("说了一句话，subscribeSession 里能看见自己说的和 agent 回的 —— MVP 那条路的核心一环", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    const c = await ctx.server.handle("createSession", { projectId: pid, agentId: "ds-chat" })
    const sid = (c as { data: { sessionId: string } }).data.sessionId

    await ctx.server.handle("acquireLease", { sessionId: sid, holder: "user" })
    await ctx.server.handle("writeToSession", { sessionId: sid, data: "你好", as: "user" })

    const s = await ctx.server.handle("subscribeSession", { sessionId: sid })
    expect(s.ok).toBe(true)
    const events = (s as { data: { events: { kind: string; who?: string; text?: string }[] } }).data.events
    const turns = events.filter((e) => e.kind === "turn")
    expect(turns.map((t) => t.who)).toContain("user")
    expect(turns.map((t) => t.who)).toContain("agent")
    expect(turns.find((t) => t.who === "agent")?.text).toContain("echo:你好")
  })

  it("会话不在本进程中活动 → not_found，而不是一个空历史", async () => {
    // 空历史会被读成「这个会话什么都没说过」，那和「这个会话不存在」是两回事
    const s = await ctx.server.handle("subscribeSession", { sessionId: "no-such" })
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.error.code).toBe("not_found")
  })

  it("getRun 带上 git 产出事实，且标注可能混入手动修改", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    const c = await ctx.server.handle("createSession", { projectId: pid, agentId: "ds-chat" })
    const sid = (c as { data: { sessionId: string } }).data.sessionId

    // 会话开始后有人改了文件
    writeFileSync(join(repo, "changed.txt"), "x\n")

    ctx.runStore.insert({
      runId: "r1", projectId: pid, sessionId: sid, origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })

    const r = await ctx.server.handle("getRun", { runId: "r1" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as { fileChanges?: { files: string[]; mayIncludeUserEdits: boolean } }
      expect(data.fileChanges?.files).toContain("changed.txt")
      expect(data.fileChanges?.mayIncludeUserEdits).toBe(true)
    }
  })

  it("拿不到基线时不返回 fileChanges —— 缺字段读成「不知道」，空数组会被读成「什么都没改」", async () => {
    const p = await ctx.server.handle("openProject", { workspace: repo })
    const pid = (p as { data: { projectId: string } }).data.projectId
    // 不建会话，直接插一条指向未知会话的 run：没有基线
    ctx.runStore.insert({
      runId: "r9", projectId: pid, sessionId: "no-baseline", origin: "agent",
      requestType: "agent_turn", status: "running",
      startedAt: "2026-08-08T00:00:00Z", hasError: false,
    })
    const r = await ctx.server.handle("getRun", { runId: "r9" })
    if (r.ok) expect((r.data as { fileChanges?: unknown }).fileChanges).toBeUndefined()
  })

  it("不存在的 run → not_found", async () => {
    const r = await ctx.server.handle("getRun", { runId: "nope" })
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })

  it("没有溯源记录的资源 → not_found，而不是编一个空链", async () => {
    const r = await ctx.server.handle("getProvenance", { resourceId: "nope" })
    if (!r.ok) expect(r.error.code).toBe("not_found")
  })
})
