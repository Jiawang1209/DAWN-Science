/**
 * 调整方向的后端一侧（8.0，spec `2026-09-25-调整方向-design.md` §4.3）。
 *
 * 真 `createWorkbenchBackend` + 真 `SessionManager`；运行时是 `FakeRuntime` 的替身：
 * 长着 `editQueue` / `redirect`（native 那样），记下每次调用，`redirect` 回什么由用例定。
 * 四步本身、真 pi 停不停，归 `tests/runtime/queue-mirror.test.ts` 与 `tests/integration/redirect.test.ts`。
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
import type { SessionId, 调整的那句 } from "../../src/runtime/types.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

/** native 的替身：有待发单、会调整方向 */
class 有待发单的 extends FakeRuntime {
  readonly 记: string[] = []
  readonly 排过: string[] = []
  没排回: (那句: 调整的那句) => string[] | Promise<string[]> = () => []
  /** pi 单上的（`clearQueue` 交回并清空）：用例自己往里放，好让「存根清没清」看得见（复审 M-4） */
  单上: string[] = []
  override write(sessionId: SessionId, data: string, _behavior?: "followUp", queueId?: string): void {
    if (queueId) this.排过.push(queueId)
    super.write(sessionId, data)
  }
  editQueue(_sessionId: SessionId, id: string): void {
    this.记.push(`remove:${id}`)
  }
  clearQueue(): string[] {
    return this.单上.splice(0)
  }
  async abort(): Promise<void> {
    this.记.push("abort")
  }
  async redirect(_sessionId: SessionId, 那句: 调整的那句): Promise<string[]> {
    this.记.push(`redirect:${那句.queueId}:${那句.data ?? "（单上的）"}`)
    return this.没排回(那句)
  }
}

const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime: FakeRuntime = new 有待发单的()) {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const backend = createWorkbenchBackend({
    projects, projectStore: new ProjectStore(db), runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const repo = mkdtempSync(join(tmpdir(), "dawn-redirect-"))
  dirs.push(repo)
  const 开一段 = async () => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    await backend.acquireLease({ sessionId, holder: "user" })
    return sessionId
  }
  const 说了 = (sid: string) => events.subscribe(sid).items.flatMap((i) => (i.type === "notice" ? [i.text] : []))
  return { backend, runtime, 开一段, 说了 }
}

describe("writeToSession · redirect", () => {
  it("native：交给运行时的 redirect（带原文），不走 write", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    const s = await ctx.开一段()
    expect(await ctx.backend.writeToSession({ sessionId: s, data: "直接换个做法", as: "user", behavior: "redirect" })).toEqual({})
    expect(rt.记).toHaveLength(1)
    expect(rt.记[0]).toMatch(/^redirect:q-.+:直接换个做法$/)
    expect(rt.排过).toEqual([])
  })

  it("重排不上的那几句：原文交回（withdrawn），并在转录里说一句", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    rt.没排回 = (那句) => [那句.queueId]
    const s = await ctx.开一段()
    expect(await ctx.backend.writeToSession({ sessionId: s, data: "这句没排上", as: "user", behavior: "redirect" })).toEqual({
      withdrawn: [{ text: "这句没排上" }],
    })
    expect(ctx.说了(s).join("")).toContain("这句没排上")
  })

  it("没有待发单的会话（acp / cli 那类）：invalid_request，不假装做了", async () => {
    const ctx = make(new FakeRuntime())
    const s = await ctx.开一段()
    await expect(ctx.backend.writeToSession({ sessionId: s, data: "x", as: "user", behavior: "redirect" })).rejects.toMatchObject({
      workbenchCode: "invalid_request",
    })
  })
})

describe("writeToSession · redirect 的出错与措辞", () => {
  it("运行时报「未启动」：not_found（与 editQueue 同一个码），存根清掉", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    rt.没排回 = (那句) => {
      // 让这个 id 出现在「单上」：存根要是没清，下面的停止就会把它当排着的交回（复审 M-4：此前这条断言恒真）
      rt.单上.push(那句.queueId)
      throw new Error('会话 "x" 未启动')
    }
    const s = await ctx.开一段()
    await expect(ctx.backend.writeToSession({ sessionId: s, data: "x", as: "user", behavior: "redirect" })).rejects.toMatchObject({
      workbenchCode: "not_found",
    })
    // 存根清掉了：停止时不会把它当排着的交回
    expect(await ctx.backend.abortSession({ sessionId: s })).toEqual({})
  })

  it("别的「未启动」（不是运行时那句「会话 … 未启动」）：不吞成 not_found（复审 M-3）", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    rt.没排回 = () => {
      throw new Error("内核未启动，先选一个解释器")
    }
    const s = await ctx.开一段()
    await expect(ctx.backend.writeToSession({ sessionId: s, data: "x", as: "user", behavior: "redirect" })).rejects.toMatchObject({
      workbenchCode: "invalid_request",
    })
  })

  it("调整方向还在等时关了会话：那句不在待发单上，也要在「会话停了」那句里说出来，不丢（复审 M-1）", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    let 放行!: (ids: string[]) => void
    rt.没排回 = () => new Promise<string[]>((r) => (放行 = r))
    const s = await ctx.开一段()
    const 调整 = ctx.backend.writeToSession({ sessionId: s, data: "换个做法", as: "user", behavior: "redirect" })
    await new Promise((r) => setTimeout(r, 0))
    await ctx.backend.stopSession({ sessionId: s })
    expect(ctx.说了(s).join("\n")).toContain("换个做法")
    放行([...rt.记.flatMap((x) => (x.startsWith("redirect:") ? [x.split(":")[1]!] : []))])
    // 运行时晚些交回 id：存根已随会话停掉，不再说第二遍
    expect(await 调整).toEqual({})
    expect(ctx.说了(s).filter((x) => x.includes("换个做法"))).toHaveLength(1)
  })

  it("停止计数只增不减：前一次调整方向里按过停止，不影响后一次的措辞", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    const 放行们: ((ids: string[]) => void)[] = []
    rt.没排回 = () => new Promise<string[]>((r) => 放行们.push(r))
    const s = await ctx.开一段()
    const 调整1 = ctx.backend.writeToSession({ sessionId: s, data: "第一回", as: "user", behavior: "redirect" })
    await new Promise((r) => setTimeout(r, 0))
    await ctx.backend.abortSession({ sessionId: s })
    放行们[0]!([rt.记.at(-2)!.split(":")[1]!])
    await 调整1
    const 调整2 = ctx.backend.writeToSession({ sessionId: s, data: "第二回", as: "user", behavior: "redirect" })
    await new Promise((r) => setTimeout(r, 0))
    放行们[1]!([rt.记.at(-1)!.split(":")[1]!])
    expect(await 调整2).toEqual({ withdrawn: [{ text: "第二回" }] })
    const 第二回那句 = ctx.说了(s).find((x) => x.includes("第二回"))!
    expect(第二回那句).toContain("没能重新排上")
  })

  it("native 会话但不是人发的：说「只有人能调整方向」，不说「只有 native 有」", async () => {
    const ctx = make()
    const s = await ctx.开一段()
    const err = await ctx.backend.writeToSession({ sessionId: s, data: "x", as: "engine", behavior: "redirect" }).catch((e: unknown) => e)
    expect(err).toMatchObject({ workbenchCode: "invalid_request" })
    expect(String((err as Error).message)).not.toContain("native")
  })

  it("调整方向还在等时按了停止：交回的那几句说是「停止」撤下的，不说「没能重新排上」", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    let 放行!: (ids: string[]) => void
    rt.没排回 = () => new Promise<string[]>((r) => (放行 = r))
    const s = await ctx.开一段()
    const 调整 = ctx.backend.writeToSession({ sessionId: s, data: "换个做法", as: "user", behavior: "redirect" })
    await new Promise((r) => setTimeout(r, 0))
    await ctx.backend.abortSession({ sessionId: s })
    放行([...rt.记.flatMap((x) => (x.startsWith("redirect:") ? [x.split(":")[1]!] : []))])
    expect(await 调整).toEqual({ withdrawn: [{ text: "换个做法" }] })
    const 说 = ctx.说了(s).join("\n")
    expect(说).toContain("换个做法")
    expect(说).toContain("停止")
    expect(说).not.toContain("没能重新排上")
  })
})

describe("editQueue", () => {
  it("remove：交回那一条（数组）", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    const s = await ctx.开一段()
    await ctx.backend.writeToSession({ sessionId: s, data: "排着的", as: "user", behavior: "followUp" })
    const id = rt.排过[0]!
    expect(await ctx.backend.editQueue({ sessionId: s, id, action: "remove" })).toEqual({ withdrawn: [{ text: "排着的" }] })
    expect(rt.记).toEqual([`remove:${id}`])
  })

  it("redirect：交给运行时（按 id，不带原文）；都排上了就什么都不交回", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    const s = await ctx.开一段()
    await ctx.backend.writeToSession({ sessionId: s, data: "改成偶数", as: "user", behavior: "followUp" })
    const id = rt.排过[0]!
    expect(await ctx.backend.editQueue({ sessionId: s, id, action: "redirect" })).toEqual({})
    expect(rt.记).toEqual([`redirect:${id}:（单上的）`])
  })

  it("redirect 时重排不上：交回、出声", async () => {
    const ctx = make()
    const rt = ctx.runtime as 有待发单的
    rt.没排回 = (那句) => [那句.queueId]
    const s = await ctx.开一段()
    await ctx.backend.writeToSession({ sessionId: s, data: "改成偶数", as: "user", behavior: "followUp" })
    const id = rt.排过[0]!
    expect(await ctx.backend.editQueue({ sessionId: s, id, action: "redirect" })).toEqual({ withdrawn: [{ text: "改成偶数" }] })
    expect(ctx.说了(s).join("")).toContain("改成偶数")
  })
})
