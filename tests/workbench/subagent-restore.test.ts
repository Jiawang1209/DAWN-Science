/**
 * 重开之后补回子 agent 的 chip 组，与回退那一轮时它跟着走（2026-09-27，spec §2.4）。
 *
 * - 续接：`subscribeSession` 把 pi 的历史翻成条目之后，按盘上的 `meta.json` 在每条 `subagent` 工具行后面插一组 chip；
 * - 回退：`truncateAt` 撤掉那句之后的一切——chip 组（不管是本次运行里长出来的，还是续接时补回来的）也跟着走，
 *   不留一组挂在上一轮后面、而那一轮已经不在了。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { 子运行目录, 写元 } from "../../src/subagent/run-dir.js"
import type { RestoredItem } from "../../src/runtime/types.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const 历史: RestoredItem[] = [
  { kind: "text", who: "user", text: "派一个" },
  { kind: "tool", id: "c1", name: "subagent", input: { agent: "scout", task: "看看" }, result: "[scout] 看完了" },
  { kind: "text", who: "agent", text: "它看完了" },
  { kind: "text", who: "user", text: "再来" },
  { kind: "tool", id: "c2", name: "subagent", input: { agent: "scout", task: "再看" }, result: "[scout] 又看完了" },
]

function 起一套(sessionDir: string) {
  const events = new SessionTranscripts({ terminalMaxChars: 1000 })
  let 活着 = false
  const sessions = {
    get: (id: string) => (id === "s1" ? { id: "s1", agentId: "native", workspace: sessionDir, sessionDir, state: "exited" } : undefined),
    isLive: () => 活着,
    resume: async () => {
      活着 = true
    },
    attach: () => {},
    history: async () => 历史,
    configOptions: () => undefined,
  }
  const backend = createWorkbenchBackend({
    projects: {} as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: sessions as never,
    registry: { providers: [] } as never,
    events,
    credentials: { get: () => undefined, set: () => {}, delete: () => {}, configured: () => [], isEncrypted: () => true },
  })
  return { backend, events }
}

describe("续接时补回 chip 组", () => {
  it("两次调用各自一组，挂在各自的工具行后面；盘上没记录的那次不补", async () => {
    const s = mkdtempSync(join(tmpdir(), "dawn-subrestore-"))
    dirs.push(s)
    写元(子运行目录(s, "c1", 0), { agent: "scout", task: "看看", status: "ok", startedAt: 1, endedAt: 2 })
    const { backend, events } = 起一套(s)
    await backend.subscribeSession({ sessionId: "s1" })
    const items = events.peekItems("s1")
    expect(items.map((x) => x.type)).toEqual(["turn", "tool", "subagents", "turn", "turn", "tool"])
    expect(items[2]).toMatchObject({ id: "sub:c1", agents: [{ index: 0, agent: "scout", status: "ok" }] })
  })

  it("回退那一轮：补回来的 chip 组跟着那一轮一起撤掉", async () => {
    const s = mkdtempSync(join(tmpdir(), "dawn-subrestore-"))
    dirs.push(s)
    写元(子运行目录(s, "c1", 0), { agent: "scout", task: "看看", status: "ok", startedAt: 1, endedAt: 2 })
    写元(子运行目录(s, "c2", 0), { agent: "scout", task: "再看", status: "ok", startedAt: 3, endedAt: 4 })
    const { backend, events } = 起一套(s)
    await backend.subscribeSession({ sessionId: "s1" })
    const 再来 = events.peekItems("s1").find((x) => x.type === "turn" && x.text === "再来")!
    expect(events.truncateAt("s1", 再来.id)).toBe(true)
    expect(events.peekItems("s1").map((x) => x.id)).toEqual(["r0", "c1", "sub:c1", "r2"])
  })
})

describe("回退那一轮：本次运行里长出来的 chip 组也跟着走", () => {
  it("那句之后的 subagents 项撤掉；之前那一轮的留着", () => {
    const t = new SessionTranscripts({ terminalMaxChars: 1000 })
    t.track("s", "native")
    t.userTurn("s", "第一句")
    t.ingest("s", { kind: "subagent_start", sessionId: "s", toolCallId: "a", index: 0, agent: "scout", task: "x" })
    t.ingest("s", { kind: "subagent_end", sessionId: "s", toolCallId: "a", index: 0, ok: true })
    t.userTurn("s", "第二句")
    const 第二句 = t.peekItems("s").at(-1)!.id
    t.ingest("s", { kind: "subagent_start", sessionId: "s", toolCallId: "b", index: 0, agent: "scout", task: "y" })
    expect(t.truncateAt("s", 第二句)).toBe(true)
    expect(t.peekItems("s").filter((x) => x.type === "subagents").map((x) => x.id)).toEqual(["sub:a"])
  })
})
