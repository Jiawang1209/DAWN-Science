import { afterEach, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { RunRecorder } from "../../src/project/run-recorder.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { SessionSnapshot } from "../../src/protocol/index.js"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

it("迁移、重复选择目录及停止恢复后，原会话的回复和用量各传一次", async () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-rehome-"))
  const db = new Database(":memory:")
  migrate(db)
  const registry = { agents: { chat: { kind: "native" as const, provider: "deepseek", model: "deepseek-flash", capabilities: [] } } }
  // 真正的 start/stop/attach 生命周期；模型事件从边界注入，不发推理请求。
  const runtime = new NativeRuntime({ credentials: {
    read: async () => ({ type: "api_key" as const, key: "sk-offline" }),
    list: async () => [{ providerId: "deepseek", type: "api_key" as const }],
    modify: async () => undefined,
    delete: async () => {},
  } })
  const sessionStore = new SessionStore(db)
  const projectStore = new ProjectStore(db)
  const runs = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: root })
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const recorder = new RunRecorder({ runs, projectOf: id => sessionStore.get(id)?.projectId })
  const ingest = vi.spyOn(recorder, "ingest")
  const shutdown: (() => Promise<void> | void)[] = []
  const backend = createWorkbenchBackend({ projects, projectStore, runs, sessions, registry, events,
    credentials: memoryCredentials(), tasks: new TaskStore(db), scratchRoot: root, runRecorder: recorder,
    注册收摊: f => shutdown.push(f),
  })
  cleanups.push(async () => {
    await sessions.stopAll()
    for (const f of shutdown) await f()
    db.close()
    rmSync(root, { recursive: true, force: true })
  })
  const task = await backend.createTask({ agentId: "chat" }) as { taskId: string; sessionId: string }
  const sid = task.sessionId
  const emit = (e: AgentEvent) => (runtime as unknown as { emit(e: AgentEvent): void }).emit(e)
  let turn = 0
  const checkReply = async () => {
    const text = `迁移后的回答-${++turn}`
    ingest.mockClear()
    recorder.beginTurn(sid)
    const runId = recorder.当前回合(sid)!
    emit({ kind: "output", sessionId: sid, data: text })
    emit({ kind: "turn_usage", sessionId: sid, usage: { input: 12, output: 8 } })
    emit({ kind: "turn_end", sessionId: sid })
    emit({ kind: "idle", sessionId: sid })
    expect(ingest.mock.calls.filter(([e]) => e.kind === "output")).toHaveLength(1)
    expect(ingest.mock.calls.filter(([e]) => e.kind === "turn_usage")).toHaveLength(1)
    const snap = await backend.subscribeSession({ sessionId: sid }) as SessionSnapshot
    expect(snap.state).toBe("alive")
    expect(JSON.stringify(snap.items).split(text)).toHaveLength(2)
    expect(runs.get(runId)?.cost).toMatchObject({ inputTokens: 12, outputTokens: 8 })
  }

  await checkReply()
  const workspace = join(root, "project")
  await backend.setTaskWorkspace({ taskId: task.taskId, workspace })
  await checkReply()
  await backend.setTaskWorkspace({ taskId: task.taskId, workspace })
  await checkReply()
  await backend.setTaskWorkspace({ taskId: task.taskId })
  await checkReply()
  await sessions.stop(sid)
  await backend.subscribeSession({ sessionId: sid })
  await checkReply()
})
