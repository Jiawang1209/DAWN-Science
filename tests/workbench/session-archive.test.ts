/**
 * 归档三个操作 + 删会话真删目录（7.18，session-archive，学自 dsh-archive-manager）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

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
  const runtime = new FakeRuntime()
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs: runStore, registry })
  const 扔了: string[] = []
  const 账: string[] = []
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }), tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    trashItem: async (p) => { 扔了.push(p); rmSync(p, { recursive: true, force: true }) },
    记一次会话: (e, _p, sid) => 账.push(`${e}:${sid}`),
  })
  return { backend, sessions, 扔了, 账 }
}

describe("归档", () => {
  let ctx: ReturnType<typeof make>
  let repo: string
  beforeEach(() => {
    ctx = make()
    repo = mkdtempSync(join(tmpdir(), "dawn-arch-"))
    dirs.push(repo)
  })
  const 开一段 = async () => {
    const t = (await ctx.backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    const projectId = ctx.sessions.get(t.sessionId)!.projectId!
    return { sessionId: t.sessionId, projectId }
  }
  const 列 = async (pid: string) => ((await ctx.backend.listSessions({ projectId: pid, pageSize: 50 })) as { sessionId: string }[]).map((s) => s.sessionId)

  it("归档后项目列表没它、归档列表有它（带项目名）；取消归档回来；各落一条账", async () => {
    const a = await 开一段()
    const b = await 开一段()
    await ctx.backend.setSessionArchived({ sessionId: a.sessionId, archived: true })
    expect(await 列(a.projectId)).toEqual([b.sessionId])
    const 归 = (await ctx.backend.listArchivedSessions({})) as { sessions: { sessionId: string; projectName: string; archivedAt?: string }[] }
    expect(归.sessions.map((s) => s.sessionId)).toEqual([a.sessionId])
    expect(归.sessions[0]!.projectName).toBeTruthy()
    expect(归.sessions[0]!.archivedAt).toMatch(/^\d{4}-/)
    await ctx.backend.setSessionArchived({ sessionId: a.sessionId, archived: false })
    expect(await 列(a.projectId)).toEqual([b.sessionId, a.sessionId])
    expect(ctx.账).toEqual([`archive:${a.sessionId}`, `unarchive:${a.sessionId}`])
  })

  it("**删会话把会话目录送进废纸篓**，并如实回 transcriptTrashed；没目录时是 false 但不算错", async () => {
    const a = await 开一段()
    const rec = ctx.sessions.get(a.sessionId)!
    mkdirSync(rec.sessionDir, { recursive: true })
    writeFileSync(join(rec.sessionDir, "session.jsonl"), "{}\n")
    const r = (await ctx.backend.deleteSession({ sessionId: a.sessionId })) as { transcriptTrashed: boolean; problem?: string }
    expect(r.transcriptTrashed).toBe(true)
    expect(ctx.扔了).toEqual([rec.sessionDir])
    expect(existsSync(rec.sessionDir)).toBe(false)

    const b = await 开一段()
    const r2 = (await ctx.backend.deleteSession({ sessionId: b.sessionId })) as { transcriptTrashed: boolean; problem?: string }
    expect(r2).toMatchObject({ transcriptTrashed: false })
    expect(r2.problem).toBeUndefined()
  })

  it("删掉全部归档的：只删归档了的，没归档的留着；说清几个目录进了废纸篓", async () => {
    const a = await 开一段()
    const b = await 开一段()
    const c = await 开一段()
    for (const s of [a, b]) {
      await ctx.backend.setSessionArchived({ sessionId: s.sessionId, archived: true })
      mkdirSync(ctx.sessions.get(s.sessionId)!.sessionDir, { recursive: true })
    }
    const r = await ctx.backend.deleteArchivedSessions({})
    expect(r).toEqual({ deleted: 2, transcriptsTrashed: 2, problems: [] })
    expect(await 列(a.projectId)).toEqual([c.sessionId])
    expect(((await ctx.backend.listArchivedSessions({})) as { sessions: unknown[] }).sessions).toEqual([])
  })
})
