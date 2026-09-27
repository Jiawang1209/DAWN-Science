/**
 * 先出方案的后端一侧（spec §4.5）：`answerPlan` 分码与租约、非 native、中枢的 `plan` 条目与 `propose_plan` 不画工具行。
 *
 * 真 `createWorkbenchBackend` + 真 `SessionManager`；运行时是 `FakeRuntime` 的替身（`make()` 照 `redirect-backend.test.ts`）。
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

/** native 的替身：会答方案，回什么由用例定 */
class 会答方案的 extends FakeRuntime {
  readonly 记: string[] = []
  答: () => Promise<{ savedPath?: string }> = async () => ({ savedPath: "analysis/plans/x.md" })
  async answerPlan(_s: SessionId, planId: string, action: "approve" | "discard", text?: string) {
    this.记.push(`${action}:${planId}${text ? `:${text}` : ""}`)
    return this.答()
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime: FakeRuntime = new 会答方案的()) {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  const repo = mkdtempSync(join(tmpdir(), "dawn-plan-"))
  dirs.push(scratch, repo)
  const backend = createWorkbenchBackend({
    projects, projectStore: new ProjectStore(db), runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const 开一段 = async () => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    await backend.acquireLease({ sessionId, holder: "user" })
    return sessionId
  }
  return { backend, runtime, repo, 开一段 }
}

describe("answerPlan", () => {
  it("native：转给运行时（带改过的正文），回存档路径", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    expect(await ctx.backend.answerPlan({ sessionId: s, planId: "c1", action: "approve", text: "改过" })).toEqual({ savedPath: "analysis/plans/x.md" })
    expect((ctx.runtime as 会答方案的).记).toEqual(["approve:c1:改过"])
  })

  it("discard：回空对象，不编一条存档路径", async () => {
    const ctx = make()
    ;(ctx.runtime as 会答方案的).答 = async () => ({})
    const s = await ctx.开一段()
    expect(await ctx.backend.answerPlan({ sessionId: s, planId: "c1", action: "discard" })).toEqual({})
  })

  it.each([
    ["没有这一版方案：c9", "not_found"],
    ["这一版方案已经不是最新的了，看最新那一版", "conflict"],
    ["这一版方案已经批过了", "conflict"],
    ["EACCES: permission denied, open '/w/analysis/plans/x.md'", "internal_error"],
  ])("运行时说「%s」→ %s，原话转述", async (话, 码) => {
    const ctx = make()
    ;(ctx.runtime as 会答方案的).答 = async () => {
      throw new Error(话)
    }
    const s = await ctx.开一段()
    const err = await ctx.backend.answerPlan({ sessionId: s, planId: "c9", action: "approve" }).catch((e: unknown) => e)
    expect(err).toMatchObject({ workbenchCode: 码 })
    expect((err as Error).message).toContain(话)
  })

  it("没有写权：conflict；非 native（没有 answerPlan）：invalid_request", async () => {
    const ctx = make()
    // 建一段但**不取写权**（协议只有 `acquireLease`，没有释放——不取就是没有）
    const { sessionId: s } = (await ctx.backend.createTask({ agentId: "ds-chat", workspace: ctx.repo })) as { sessionId: string }
    await expect(ctx.backend.answerPlan({ sessionId: s, planId: "c1", action: "discard" })).rejects.toMatchObject({ workbenchCode: "conflict" })
    expect((ctx.runtime as 会答方案的).记, "没写权就不该转给运行时").toEqual([])

    const 别的 = make(new FakeRuntime())
    const s2 = await 别的.开一段()
    await expect(别的.backend.answerPlan({ sessionId: s2, planId: "c1", action: "discard" })).rejects.toMatchObject({ workbenchCode: "invalid_request" })
  })

  it("没有这段会话：not_found", async () => {
    const ctx = make()
    await expect(ctx.backend.answerPlan({ sessionId: "nope", planId: "c1", action: "discard" })).rejects.toMatchObject({ workbenchCode: "not_found" })
  })
})

describe("中枢", () => {
  it("plan 事件按 plan:<planId> 覆盖；propose_plan 成功不画工具行、失败照画", () => {
    const hub = new SessionTranscripts({ terminalMaxChars: 10_000 })
    hub.track("s", "native")
    const 卡 = { planId: "c1", version: 1, title: "t", markdown: "m", status: "proposed" as const }
    hub.ingest("s", { kind: "tool_start", sessionId: "s", toolCallId: "c1", toolName: "propose_plan", input: {} })
    hub.ingest("s", { kind: "plan", sessionId: "s", plan: 卡 })
    hub.ingest("s", { kind: "tool_end", sessionId: "s", toolCallId: "c1", toolName: "propose_plan", isError: false, text: "ok", truncated: false, bytes: 2 })
    hub.ingest("s", { kind: "plan", sessionId: "s", plan: { ...卡, status: "approved", savedPath: "a.md", approvedAt: 1 } })
    const items = hub.subscribe("s").items
    expect(items).toEqual([{ type: "plan", id: "plan:c1", ...卡, status: "approved", savedPath: "a.md", approvedAt: 1 }])

    hub.ingest("s", { kind: "tool_start", sessionId: "s", toolCallId: "c2", toolName: "propose_plan", input: {} })
    hub.ingest("s", { kind: "tool_end", sessionId: "s", toolCallId: "c2", toolName: "propose_plan", isError: true, text: "缺节", truncated: false, bytes: 6 })
    expect(hub.subscribe("s").items.at(-1)).toMatchObject({ type: "tool", name: "propose_plan", status: "error", result: "缺节" })
  })
})
