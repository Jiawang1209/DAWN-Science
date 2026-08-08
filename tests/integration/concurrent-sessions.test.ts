/**
 * G1 决策门第一问：**四个会话能并存吗？**
 *
 * 这一条在实施计划 Task 1.11 的验收清单里漏掉了，但它在主规划 §5 的 G1 里。
 * 跨真实进程边界验证，不用 mock。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"
import { SessionManager } from "../../src/session/manager.js"
import { PtyRuntime } from "../../src/runtime/pty.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const registry: ProviderRegistry = {
  endpoints: {
    ds: { baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-test", models: ["deepseek-v4-flash"] },
  },
  agents: {
    "sh-a": { kind: "pty", command: "bash", args: ["--norc", "--noprofile"], capabilities: ["exec"] },
    "sh-b": { kind: "pty", command: "bash", args: ["--norc", "--noprofile"], capabilities: ["exec"] },
    "sh-c": { kind: "pty", command: "sh", args: [], capabilities: ["exec"] },
    "ds-agent": { kind: "native", endpoint: "ds", model: "deepseek-v4-flash", capabilities: ["chat"] },
  },
}

function waitFor(pred: () => boolean, ms = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now()
    const tick = setInterval(() => {
      if (pred()) {
        clearInterval(tick)
        resolve()
      } else if (Date.now() - t0 > ms) {
        clearInterval(tick)
        reject(new Error("等待超时"))
      }
    }, 50)
  })
}

function makeManager() {
  const db = new Database(":memory:")
  migrate(db)
  const store = new SessionStore(db)
  const fake = new FakeRuntime()
  const mgr = new SessionManager({
    store,
    registry,
    // native 用 fake 替身：本用例验证的是并存与隔离，不是模型对话
    runtimes: { native: fake, pty: fake },
    ptyRuntimeFor: (_id, def) => new PtyRuntime({ command: def.command, args: def.args }),
    workspaceRoot: tmpdir(),
  })
  return { mgr, store }
}

describe("G1 · 四个会话能并存", () => {
  it("四个会话同时存活，pid 互不相同，全部落库为 alive", async () => {
    const { mgr, store } = makeManager()
    const ws = mkdtempSync(join(tmpdir(), "dawn-cc-"))

    const sessions = await Promise.all(
      ["sh-a", "sh-b", "sh-c", "ds-agent"].map((id) => mgr.create(id, ws)),
    )

    expect(sessions).toHaveLength(4)
    expect(new Set(sessions.map((s) => s.id)).size).toBe(4)
    expect(new Set(sessions.map((s) => s.pid)).size).toBe(4)
    for (const s of sessions) expect(store.get(s.id)?.state).toBe("alive")

    await Promise.all(sessions.map((s) => mgr.stop(s.id)))
  })

  it("并存的 pty 会话输出互不串台", async () => {
    const { mgr } = makeManager()
    const ws = mkdtempSync(join(tmpdir(), "dawn-cc-"))
    const a = await mgr.create("sh-a", ws)
    const b = await mgr.create("sh-b", ws)

    const outA: string[] = []
    const outB: string[] = []
    mgr.attach(a.id, (e: AgentEvent) => e.kind === "output" && outA.push(e.data))
    mgr.attach(b.id, (e: AgentEvent) => e.kind === "output" && outB.push(e.data))

    mgr.leases.acquire(a.id, "user")
    mgr.leases.acquire(b.id, "user")
    mgr.write(a.id, "echo ONLY_IN_A\n", "user")

    await waitFor(() => outA.join("").includes("ONLY_IN_A"))
    expect(outB.join("")).not.toContain("ONLY_IN_A")

    await Promise.all([mgr.stop(a.id), mgr.stop(b.id)])
  })

  it("每个会话有独立的租约，互不影响", async () => {
    const { mgr } = makeManager()
    const ws = mkdtempSync(join(tmpdir(), "dawn-cc-"))
    const a = await mgr.create("sh-a", ws)
    const b = await mgr.create("sh-b", ws)

    mgr.leases.acquire(a.id, "engine")
    mgr.leases.acquire(b.id, "user")

    expect(mgr.leases.current(a.id)?.holder).toBe("engine")
    expect(mgr.leases.current(b.id)?.holder).toBe("user")
    // a 上 engine 仍持有，b 上 engine 抢不动 user
    expect(() => mgr.leases.acquire(b.id, "engine")).toThrow(/user/)

    await Promise.all([mgr.stop(a.id), mgr.stop(b.id)])
  })

  it("停掉其中一个不影响其余会话", async () => {
    const { mgr, store } = makeManager()
    const ws = mkdtempSync(join(tmpdir(), "dawn-cc-"))
    const all = await Promise.all(["sh-a", "sh-b", "sh-c"].map((id) => mgr.create(id, ws)))

    await mgr.stop(all[1]!.id)

    expect(store.get(all[1]!.id)?.state).toBe("exited")
    expect(store.get(all[0]!.id)?.state).toBe("alive")
    expect(store.get(all[2]!.id)?.state).toBe("alive")

    // 存活的仍可写入
    mgr.leases.acquire(all[0]!.id, "user")
    expect(() => mgr.write(all[0]!.id, "echo still-alive\n", "user")).not.toThrow()

    await Promise.all([mgr.stop(all[0]!.id), mgr.stop(all[2]!.id)])
  })

  it("每个会话有独立的 sessionDir", async () => {
    const { mgr, store } = makeManager()
    const ws = mkdtempSync(join(tmpdir(), "dawn-cc-"))
    const all = await Promise.all(["sh-a", "sh-b", "sh-c"].map((id) => mgr.create(id, ws)))
    const dirs = all.map((s) => store.get(s.id)!.sessionDir)
    expect(new Set(dirs).size).toBe(3)
    await Promise.all(all.map((s) => mgr.stop(s.id)))
  })
})
