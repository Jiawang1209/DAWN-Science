import { describe, expect, it } from "vitest"
import { 本轮产物 } from "../../src/ui/generated-strip.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const turn = (id: string, who: "user" | "agent"): TranscriptItem => ({ type: "turn", id, who, text: "", final: true })
const tool = (id: string): TranscriptItem => ({ type: "tool", id, name: "write", input: {}, status: "ok" })
const art = (path: string, c: string) => ({ path, kind: "table" as const, bornRunId: "r-" + c, bornToolCallId: c, bornAt: "2026-08-26T10:00:00.000Z", exists: true })

describe("本轮产物", () => {
  const items = [turn("u1", "user"), tool("c1"), tool("c2"), turn("a1", "agent"), turn("u2", "user"), tool("c3"), turn("a2", "agent")]

  it("按提问分段：只挑这一段（上一句 user 到下一句 user 之间）里的工具调用", () => {
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

  it("只读工具发了空事实（read 的 filesCreated = []）→ 不在 unknown 里 → none，普通对话不画「产出未知」（审查 A）", () => {
    const 只读 = [turn("u", "user"), { type: "tool", id: "r1", name: "read", input: {}, status: "ok" } as TranscriptItem, turn("a", "agent")]
    expect(本轮产物(只读, "a", { artifacts: [], unknown: [] }, "native")).toEqual({ kind: "none" })
  })

  it("清单取失败 → unknown/load_failed 带原因，**不是 none**；pty/cli 仍优先说 invisible_agent（审查 B）", () => {
    const 坏 = { artifacts: [], unknown: [], error: "ECONNRESET" }
    expect(本轮产物(items, "a1", 坏, "native")).toEqual({ kind: "unknown", reason: "load_failed", error: "ECONNRESET" })
    // 这一轮没有工具调用也一样：清单没取到，就不知道
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", 坏, "native")).toEqual({ kind: "unknown", reason: "load_failed", error: "ECONNRESET" })
    expect(本轮产物(items, "a1", 坏, "cli")).toEqual({ kind: "unknown", reason: "invisible_agent" })
  })

  it("外部 CLI 会话：一律未知，原因 invisible_agent", () => {
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "pty")).toEqual({ kind: "unknown", reason: "invisible_agent" })
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "cli")).toEqual({ kind: "unknown", reason: "invisible_agent" })
  })

  it("这一轮没有任何工具调用 → none", () => {
    expect(本轮产物([turn("u", "user"), turn("a", "agent")], "a", { artifacts: [], unknown: [] }, "native")).toEqual({ kind: "none" })
  })

  it("同一段里连续两条 agent 消息——产物条只挂最后一条，前一条不重复认领", () => {
    const 序列 = [turn("u1", "user"), turn("a1", "agent"), tool("c1"), turn("a2", "agent")]
    const list = { artifacts: [art("out.csv", "c1")], unknown: [] }
    expect(本轮产物(序列, "a2", list, "native")).toEqual({ kind: "some", artifacts: [expect.objectContaining({ path: "out.csv" })], unknownCount: 0 })
    expect(本轮产物(序列, "a1", list, "native")).toEqual({ kind: "none" })
  })

  it("没有产物、但有不知道的次数（哪怕对不满这一轮的工具调用数）→ 一律 unknown，不画 GENERATED · 0", () => {
    // 两次工具调用，只有一次被记成「不知道」（另一次的 toolCallId 是探针兜底占位，对不上）——不该被当成「有 1 个不知道」拼进 some
    const r = 本轮产物(items, "a1", { artifacts: [], unknown: [{ runId: "r", toolCallId: "c1" }] }, "native")
    expect(r).toEqual({ kind: "unknown", reason: "not_observed" })
  })

  it("作者 2026-08-26 首用的真实会话形状：想→写→跑命令→回话→再改→再回话，chips 只落在最后一条底下", () => {
    const 序列 = [
      turn("u1", "user"),
      turn("a1", "agent"), // 中间：写之前先说了一句
      tool("c1"), // write → A
      tool("c2"), // bash → B,C,D,E
      turn("a2", "agent"), // 中间：又说了一句
      tool("c3"), // edit，不产出新文件
      turn("a3", "agent"), // 这一段最后一条
      tool("c4"), // read，不产出新文件
    ]
    const list = {
      artifacts: [art("a.csv", "c1"), art("b.csv", "c2"), art("c.csv", "c2"), art("d.csv", "c2"), art("e.csv", "c2")],
      unknown: [],
    }
    expect(本轮产物(序列, "a1", list, "native")).toEqual({ kind: "none" })
    expect(本轮产物(序列, "a2", list, "native")).toEqual({ kind: "none" })
    const r = 本轮产物(序列, "a3", list, "native")
    expect(r.kind).toBe("some")
    if (r.kind === "some") {
      expect(r.artifacts.map((a) => a.path).sort()).toEqual(["a.csv", "b.csv", "c.csv", "d.csv", "e.csv"])
      expect(r.unknownCount).toBe(0)
    }
  })

  it("工具调用在任何文字之前（模型先动手再说话）→ 唯一一条 agent 消息照样认领", () => {
    const 序列 = [turn("u1", "user"), tool("c1"), turn("a1", "agent")]
    const list = { artifacts: [art("out.csv", "c1")], unknown: [] }
    expect(本轮产物(序列, "a1", list, "native")).toEqual({ kind: "some", artifacts: [expect.objectContaining({ path: "out.csv" })], unknownCount: 0 })
  })

  it("段边界按下一句 user 划开，不是按下一条 turn——上一段的产物不会渗进下一段", () => {
    const 序列 = [turn("u1", "user"), turn("a1", "agent"), tool("c1"), turn("u2", "user"), turn("a2", "agent")]
    const list = { artifacts: [art("out.csv", "c1")], unknown: [] }
    expect(本轮产物(序列, "a1", list, "native")).toEqual({ kind: "some", artifacts: [expect.objectContaining({ path: "out.csv" })], unknownCount: 0 })
    expect(本轮产物(序列, "a2", list, "native")).toEqual({ kind: "none" })
  })
})
