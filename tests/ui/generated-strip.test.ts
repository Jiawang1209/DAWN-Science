import { describe, expect, it } from "vitest"
import { 本轮产物 } from "../../src/ui/generated-strip.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const turn = (id: string, who: "user" | "agent"): TranscriptItem => ({ type: "turn", id, who, text: "", final: true })
const tool = (id: string): TranscriptItem => ({ type: "tool", id, name: "write", input: {}, status: "ok" })
const art = (path: string, c: string) => ({ path, kind: "table" as const, bornRunId: "r-" + c, bornToolCallId: c, bornAt: "2026-08-26T10:00:00.000Z", exists: true })

describe("本轮产物", () => {
  const items = [turn("u1", "user"), tool("c1"), tool("c2"), turn("a1", "agent"), turn("u2", "user"), tool("c3"), turn("a2", "agent")]

  it("只挑上一句用户发言之后、这一轮 agent 之前的工具调用", () => {
    const r = 本轮产物(items, "a2", { artifacts: [art("a.csv", "c1"), art("b.csv", "c3")], unknown: [] }, "native")
    expect(r).toEqual({ kind: "some", artifacts: [expect.objectContaining({ path: "b.csv" })], unknownCount: 0 })
  })

  it("整轮都不知道 → unknown；部分不知道 → some 且 unknownCount", () => {
    expect(本轮产物(items, "a1", { artifacts: [], unknown: [{ runId: "r", toolCallId: "c1" }, { runId: "r2", toolCallId: "c2" }] }, "native")).toEqual({ kind: "unknown", reason: "not_observed" })
    expect(本轮产物(items, "a1", { artifacts: [art("a.csv", "c1")], unknown: [{ runId: "r2", toolCallId: "c2" }] }, "native")).toEqual({ kind: "some", artifacts: [expect.objectContaining({ path: "a.csv" })], unknownCount: 1 })
  })

  it("确认没新建（有工具调用、都知道、都是空）→ none，不画", () => {
    expect(本轮产物(items, "a1", { artifacts: [], unknown: [] }, "native")).toEqual({ kind: "none" })
  })

  it("外部 CLI 会话：一律未知，原因 invisible_agent", () => {
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "pty")).toEqual({ kind: "unknown", reason: "invisible_agent" })
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "cli")).toEqual({ kind: "unknown", reason: "invisible_agent" })
  })

  it("这一轮没有任何工具调用 → none", () => {
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "native")).toEqual({ kind: "none" })
  })
})
