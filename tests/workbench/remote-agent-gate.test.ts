/**
 * 远端建任务，只收「手能到服务器」的 agent（T3，2026-08-21）。
 *
 * 此前 `createTask({agentId, connectionId})` 什么 agent 都收：codex-acp、cli、kernel
 * 的运行时都不认 `spec.remote`，于是任务上标着「远端」，活跑在本机——静默错位。
 * 这道门在**连服务器之前**就拒，拒绝的话要说清为什么。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { EventEmitter } from "node:events"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { RunStore } from "../../src/store/runs.js"
import { SessionStore } from "../../src/store/sessions.js"
import { TaskStore } from "../../src/store/tasks.js"
import { ConnectionStore } from "../../src/store/connections.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionManager } from "../../src/session/manager.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { RemoteConnections } from "../../src/remote/connections.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { WorkbenchServer } from "../../src/workbench/server.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { SshClientLike } from "../../src/remote/ssh.js"

const registry: ProviderRegistry = {
  agents: {
    "codex-acp": { kind: "acp", command: "npx", args: [], capabilities: ["chat"], remoteCapable: false },
    "ds-chat": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["chat"] },
    "claude-acp": { kind: "acp", command: "npx", args: [], capabilities: ["chat"], remoteCapable: true },
  },
}

/** 一台会握手、会报家目录的假机器（与 remote-resume.test.ts 同一台） */
function 假客户端(): SshClientLike {
  const c = new EventEmitter() as EventEmitter & SshClientLike
  c.connect = (() => setTimeout(() => c.emit("ready"), 1)) as SshClientLike["connect"]
  c.exec = ((_cmd: string, cb: (e: Error | undefined, ch: unknown) => void) => {
    const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    ch.stderr = new EventEmitter()
    cb(undefined, ch)
    setTimeout(() => {
      ch.emit("data", Buffer.from("DAWNENV_HOME=/home/user\nDAWNENV_PATH=/usr/bin\n"))
      ch.emit("close", 0, undefined)
    }, 1)
  }) as SshClientLike["exec"]
  c.end = (() => setTimeout(() => c.emit("close"), 1)) as SshClientLike["end"]
  return c
}

function 起一套() {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runtime = new FakeRuntime()
  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: { native: runtime, pty: runtime, acp: runtime },
    workspaceRoot: tmpdir(),
  })
  const projectStore = new ProjectStore(db)
  const runs = new RunStore(db)
  const projects = new ProjectManager({ projects: projectStore, sessions: sessionStore, runs, registry })
  const store = new ConnectionStore(db)
  const manager = new RemoteConnections({ createClient: 假客户端, secretFor: () => undefined })
  const backend = createWorkbenchBackend({
    projects,
    projectStore,
    runs,
    sessions,
    registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }),
    credentials: memoryCredentials(),
    tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    remote: { store, manager },
  })
  return { server: new WorkbenchServer(backend), backend }
}

describe("远端建任务的准入", () => {
  it("codex 类 acp（不借手）→ 拒绝，并说清它会在本机跑", async () => {
    const { server, backend } = 起一套()
    const c = (await backend.saveConnection({ label: "gs", host: "gs.example", username: "u" })) as { id: string }
    const r = await server.handle("createTask", { agentId: "codex-acp", connectionId: c.id })
    expect(r.ok).toBe(false)
    const 话 = JSON.stringify(r)
    expect(话).toContain("到不了服务器")
    expect(话).toContain("codex-acp")
  })

  it("native 与标了 remoteCapable 的 acp → 建得成", async () => {
    const { server, backend } = 起一套()
    const c = (await backend.saveConnection({ label: "gs", host: "gs.example", username: "u" })) as { id: string }
    for (const agentId of ["ds-chat", "claude-acp"]) {
      const r = await server.handle("createTask", { agentId, connectionId: c.id })
      expect(r.ok, `${agentId}：${JSON.stringify(r)}`).toBe(true)
    }
  })

  it("本机任务不受影响：codex 类 acp 照建", async () => {
    const { server } = 起一套()
    const r = await server.handle("createTask", { agentId: "codex-acp" })
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })
})
