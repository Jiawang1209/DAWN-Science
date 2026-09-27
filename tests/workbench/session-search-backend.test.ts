/**
 * `searchSessionContent` 接到后端（2026-09-27）。搜索器本身的规则在 `session-search.test.ts`。
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
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { 写一段pi记录 } from "../helpers/pi-record.js"
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
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  dirs.push(scratch)
  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }), tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => rmSync(p, { recursive: true, force: true }),
  })
  return { backend, sessions }
}

describe("searchSessionContent", () => {
  it("项目里的一段：搜得到，卡上写项目名；归档之后仍搜得到、标 archived", async () => {
    const { backend, sessions } = make()
    const repo = mkdtempSync(join(tmpdir(), "dawn-cs-repo-"))
    dirs.push(repo)
    const t = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    写一段pi记录(sessions.get(t.sessionId)!.sessionDir, [{ who: "user", text: "做个 Cox 回归" }, { who: "agent", text: "好" }])
    type R = { sessions: { sessionId: string; archived: boolean; place?: { kind: string; name: string } }[] }
    const r = (await backend.searchSessionContent({ query: "cox", limit: 30 })) as R
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0]).toMatchObject({ sessionId: t.sessionId, archived: false, place: { kind: "project" } })
    await backend.setSessionArchived({ sessionId: t.sessionId, archived: true })
    const r2 = (await backend.searchSessionContent({ query: "cox" })) as R
    expect(r2.sessions[0]).toMatchObject({ sessionId: t.sessionId, archived: true })
  })

  it("普通对话（临时项目）不写所在；删掉的会话搜不到", async () => {
    const { backend, sessions } = make()
    const t = (await backend.createTask({ agentId: "ds-chat" })) as { sessionId: string; taskId: string }
    写一段pi记录(sessions.get(t.sessionId)!.sessionDir, [{ who: "user", text: "Cox 回归" }, { who: "agent", text: "好" }])
    type R = { sessions: { sessionId: string; place?: unknown }[] }
    const r = (await backend.searchSessionContent({ query: "cox" })) as R
    expect(r.sessions[0]!.place).toBeUndefined()
    await backend.deleteSession({ sessionId: t.sessionId })
    expect(((await backend.searchSessionContent({ query: "cox" })) as R).sessions).toEqual([])
  })
})
