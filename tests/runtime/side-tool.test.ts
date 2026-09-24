/**
 * 侧边对话的工具启停（2026-09-24，spec `2026-09-24-侧边对话-design.md` §3.4）。
 *
 * **真起 pi 会话**（同 `native.test.ts`：假凭证、不打网络）——「建会话后默认停用」
 * 走的是真 `createAgentSession` 与真 `setActiveToolsByName`，替身演不出 pi 的
 * 「customTools 建会话时全部启用」这件事，演出来的只是我们对它的猜测。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { NativeRuntime, type NativeRuntimeOptions } from "../../src/runtime/native.js"
import { READ_MAIN_SESSION } from "../../src/tools/read-main-session.js"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"
import { SessionManager } from "../../src/session/manager.js"
import type { AgentRuntime, SessionSpec } from "../../src/runtime/types.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})

const specFor = (sessionId = "n1"): SessionSpec => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-side-"))
  return { sessionId, workspace: dir, sessionDir: join(dir, ".dawn"), native: { provider: "deepseek", model: "deepseek-flash" } }
}

type 会话 = { getActiveToolNames(): string[]; getAllTools(): { name: string }[] }
const pi会话 = (rt: NativeRuntime, id: string) =>
  (rt as unknown as { sessions: Map<string, { session: 会话 }> }).sessions.get(id)!.session

const 起 = async (opts: NativeRuntimeOptions = {}, id = "n1") => {
  const rt = new NativeRuntime({ credentials: fakeCredentials(), 读主对话: () => "摘要", ...opts })
  await rt.start(specFor(id))
  return rt
}

/** 两条 return 各走一遍：没有 `subagentChildEntry`（CLI / 测试）与有（桌面版真实装配） */
for (const [分支, 额外] of [
  ["无 subagentChildEntry", {}],
  ["有 subagentChildEntry（桌面版那条 return）", { subagentChildEntry: "/nonexistent/subagent-child.js" }],
] as const) {
  describe(`read_main_session 启停 · ${分支}`, () => {
    it("装上了、但没配对时新建的会话默认停用", async () => {
      const rt = await 起(额外)
      const s = pi会话(rt, "n1")
      const 全部 = s.getAllTools().map((t) => t.name)
      expect(全部).toContain(READ_MAIN_SESSION)
      // 确认真走了这一条 return（有 subagent 就是桌面版那条），别「判据没红」是因为走错了分支
      expect(全部.includes("subagent")).toBe("subagentChildEntry" in 额外)
      expect(s.getActiveToolNames()).not.toContain(READ_MAIN_SESSION)
      // 别的工具没被一起停掉
      expect(s.getActiveToolNames().length).toBeGreaterThan(0)
      await rt.stop("n1")
    })

    it("setSideTool 开 → 在；关 → 不在；别的工具原样", async () => {
      const rt = await 起(额外)
      const s = pi会话(rt, "n1")
      const 原来 = s.getActiveToolNames()
      rt.setSideTool("n1", true)
      expect(s.getActiveToolNames()).toContain(READ_MAIN_SESSION)
      rt.setSideTool("n1", true) // 重复开不重复加
      expect(s.getActiveToolNames().filter((n) => n === READ_MAIN_SESSION)).toHaveLength(1)
      rt.setSideTool("n1", false)
      expect(s.getActiveToolNames()).toEqual(原来)
      await rt.stop("n1")
    })

    it("会话未起时先开，再起会话 → 起来就开着", async () => {
      const rt = new NativeRuntime({ credentials: fakeCredentials(), 读主对话: () => "摘要", ...额外 })
      rt.setSideTool("n1", true)
      await rt.start(specFor("n1"))
      expect(pi会话(rt, "n1").getActiveToolNames()).toContain(READ_MAIN_SESSION)
      await rt.stop("n1")
    })

    it("不给 `读主对话` 就根本不装", async () => {
      const rt = new NativeRuntime({ credentials: fakeCredentials(), ...额外 })
      await rt.start(specFor("n1"))
      expect(pi会话(rt, "n1").getAllTools().map((t) => t.name)).not.toContain(READ_MAIN_SESSION)
      // 没装的时候开也只是记一笔，不报错、不凭空多一个名字
      rt.setSideTool("n1", true)
      expect(pi会话(rt, "n1").getActiveToolNames()).not.toContain(READ_MAIN_SESSION)
      await rt.stop("n1")
    })
  })
}

it("停了再起（仍在坞里）：开关跟着会话 id 走，不跟着这一次的 pi 会话走", async () => {
  const rt = new NativeRuntime({ credentials: fakeCredentials(), 读主对话: () => "摘要" })
  const spec = specFor("n1")
  await rt.start(spec)
  rt.setSideTool("n1", true)
  await rt.stop("n1")
  await rt.start({ ...spec, resume: true })
  expect(pi会话(rt, "n1").getActiveToolNames()).toContain(READ_MAIN_SESSION)
  await rt.stop("n1")
})

describe("SessionManager · setSideTool / canReadMain", () => {
  const registry = {
    agents: {
      "ds-agent": { kind: "native" as const, provider: "deepseek", model: "deepseek-flash", capabilities: [] },
      "claude-code": { kind: "pty" as const, command: "claude", args: [], capabilities: [] },
    },
  }
  const stub = (over: Partial<AgentRuntime> = {}): AgentRuntime => ({
    start: async (s) => ({ sessionId: s.sessionId, pid: 1 }),
    attach: () => () => {},
    write: () => {},
    stop: async () => {},
    ...over,
  })
  const 摆 = () => {
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const 调用: [string, boolean][] = []
    const native = stub({ setSideTool: (id, on) => void 调用.push([id, on]) })
    const pty = stub()
    const mgr = new SessionManager({ store, registry, runtimes: { native, pty }, workspaceRoot: "/tmp/dawn-test" })
    return { mgr, store, 调用 }
  }

  it("活着的 native 会话：透传，canReadMain 为真", async () => {
    const { mgr, 调用 } = 摆()
    const s = await mgr.create("ds-agent", "/tmp/w")
    mgr.setSideTool(s.id, true)
    expect(调用).toEqual([[s.id, true]])
    expect(mgr.canReadMain(s.id)).toBe(true)
  })

  it("**还没绑运行时**的 native 会话（重启后界面先配对）也送到 native 那一份", () => {
    const { mgr, store, 调用 } = 摆()
    store.insert({ id: "old", agentId: "ds-agent", workspace: "/tmp/w", sessionDir: "/tmp/w/.dawn/old", state: "exited", createdAt: new Date().toISOString() })
    expect(mgr.isLive("old")).toBe(false)
    mgr.setSideTool("old", true)
    expect(调用).toEqual([["old", true]])
    expect(mgr.canReadMain("old")).toBe(true)
  })

  it("pty / 未知会话：不送、不抛，canReadMain 为假", async () => {
    const { mgr, 调用 } = 摆()
    const t = await mgr.create("claude-code", "/tmp/w")
    mgr.setSideTool(t.id, true)
    mgr.setSideTool("没这段", true)
    expect(调用).toEqual([])
    expect(mgr.canReadMain(t.id)).toBe(false)
    expect(mgr.canReadMain("没这段")).toBe(false)
  })
})
