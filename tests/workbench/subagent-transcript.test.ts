/**
 * 事件中枢的子转录（2026-09-27，spec §4.3）：每个子 agent 一段，与会话同一套条目与 revision；
 * chip 照旧在主转录里，过程只进子转录。
 */
import { describe, expect, it } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { SessionUpdateSchema, type SessionUpdate } from "../../src/protocol/events.js"
import { 子转录id } from "../../src/protocol/subagent-id.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const 主 = "s"
const 子 = 子转录id(主, "c1", 0)

function 起(toolCallId = "c1") {
  const h = new SessionTranscripts({ terminalMaxChars: 1000 })
  h.track(主, "native")
  h.subscribe(主)
  const 推: SessionUpdate[] = []
  const 全听: SessionUpdate[] = []
  h.onUpdate((u) => 推.push(u))
  h.onAnyUpdate((u) => 全听.push(u))
  const 发 = (e: Extract<AgentEvent, { kind: "subagent_event" }>["event"]) =>
    h.ingest(主, { kind: "subagent_event", sessionId: 主, toolCallId, index: 0, event: e })
  h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId, index: 0, agent: "scout", task: "看看 README" })
  return { h, 推, 全听, 发, 子: 子转录id(主, toolCallId, 0) }
}

function chip(h: SessionTranscripts) {
  const c = h.subscribe(主).items.find((i) => i.type === "subagents")
  return c?.type === "subagents" ? c.agents[0] : undefined
}

describe("子转录", () => {
  it("start 开一段：第一句是「你」交给它的任务；头信息 running、还不能问", () => {
    const { h } = 起()
    const s = h.subscribe(子)
    expect(s.items[0]).toMatchObject({ type: "turn", who: "user", text: "看看 README" })
    expect(s.subagent).toEqual({ agent: "scout", task: "看看 README", status: "running", canAsk: false, askWhy: "running" })
  })

  it("过程只进子转录；主转录里只有 chip，chip 上那一句跟着 tool_start 换", () => {
    const { h, 发 } = 起()
    发({ kind: "output", data: "我先读一下。" })
    发({ kind: "tool_start", toolCallId: "t1", toolName: "read", input: { path: "README.md" } })
    发({ kind: "tool_end", toolCallId: "t1", toolName: "read", isError: false, text: "# r", truncated: false, bytes: 3 })
    expect(h.subscribe(子).items.map((i) => i.type)).toEqual(["turn", "turn", "tool"])
    const 主条 = h.subscribe(主).items
    expect(主条.map((i) => i.type)).toEqual(["subagents"])
    expect(chip(h)?.activity).toBe("read README.md")
  })

  it("文本增量并成一条发言，不是一段一条", () => {
    const { h, 发 } = 起()
    for (const d of ["一", "二", "三", "四"]) 发({ kind: "output", data: d })
    const agent = h.subscribe(子).items.filter((i) => i.type === "turn" && i.who === "agent")
    expect(agent).toHaveLength(1)
    expect(agent[0]).toMatchObject({ text: "一二三四" })
  })

  it("settled：头信息写上状态与交回的结果、可以问了；end 把 chip 那一句收掉", () => {
    const { h, 发 } = 起()
    发({ kind: "tool_start", toolCallId: "t1", toolName: "read", input: { path: "README.md" } })
    发({ kind: "settled", ok: true, result: { text: "它是个测试仓库" } })
    h.ingest(主, { kind: "subagent_end", sessionId: 主, toolCallId: "c1", index: 0, ok: true })
    expect(h.subscribe(子).subagent).toEqual({ agent: "scout", task: "看看 README", status: "ok", result: { text: "它是个测试仓库" }, canAsk: true })
    expect(chip(h)).toEqual({ index: 0, agent: "scout", task: "看看 README", status: "ok" })
  })

  it("settled 失败：status error、带原因；还开着的那段发言被收口", () => {
    const { h, 发 } = 起()
    发({ kind: "output", data: "说到一半" })
    发({ kind: "settled", ok: false, error: "被杀了" })
    const s = h.subscribe(子)
    expect(s.subagent).toMatchObject({ status: "error", error: "被杀了", canAsk: true })
    expect(s.items.find((i) => i.type === "turn" && i.who === "agent")).toMatchObject({ final: true })
  })

  it("团队成员那一轮（`team:`）：跑完也不能在这里问", () => {
    const { h, 发, 子: 团子 } = 起("team:t1")
    发({ kind: "settled", ok: true, result: { text: "x" } })
    expect(h.subscribe(团子).subagent).toMatchObject({ canAsk: false, askWhy: "team" })
  })

  it("**子转录的更新不给「全听」**——飞书 / 微信通知与定时任务只认真会话；主会话的照给", () => {
    const h = new SessionTranscripts({ terminalMaxChars: 1000 })
    h.track(主, "native")
    const 全听: SessionUpdate[] = []
    h.onAnyUpdate((u) => 全听.push(u))
    const 发 = (e: Extract<AgentEvent, { kind: "subagent_event" }>["event"]) =>
      h.ingest(主, { kind: "subagent_event", sessionId: 主, toolCallId: "c1", index: 0, event: e })
    h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId: "c1", index: 0, agent: "scout", task: "看看 README" })
    发({ kind: "output", data: "好" })
    发({ kind: "tool_start", toolCallId: "t1", toolName: "read", input: { path: "a" } })
    发({ kind: "turn_end" })
    发({ kind: "settled", ok: true, result: { text: "好" } })
    h.子agent续问开始(子, "再说")
    发({ kind: "output", data: "补" })
    发({ kind: "settled", ok: true, followUp: true })
    expect(全听.length, "主会话的 chip 更新应当照给").toBeGreaterThan(0)
    expect(全听.every((u) => u.sessionId === 主), "子转录的更新漏进了全听").toBe(true)
    // 尤其不能有「agent 说完了」那一种（飞书 / 微信据此发通知）
    expect(全听.some((u) => u.type === "item" && u.item.type === "turn" && u.item.who === "agent")).toBe(false)
  })

  it("接着问：你那句进子转录、标 asking；settled(followUp) 之后 status 与 result 不变、又能问了；失败出声", () => {
    const { h, 发 } = 起()
    发({ kind: "settled", ok: true, result: { text: "原结论" } })
    expect(h.子agent续问开始(子, "再说一句")).toBe(true)
    expect(h.subscribe(子).subagent).toMatchObject({ asking: true, canAsk: false, askWhy: "asking" })
    expect(h.子agent续问开始(子, "又一句"), "在答的时候不能再问").toBe(false)
    发({ kind: "output", data: "补充" })
    发({ kind: "settled", ok: false, error: "超时", followUp: true })
    const s = h.subscribe(子)
    expect(s.subagent).toEqual({ agent: "scout", task: "看看 README", status: "ok", result: { text: "原结论" }, canAsk: true })
    expect(s.items.some((i) => i.type === "notice" && i.text.includes("超时"))).toBe(true)
    expect(s.items.some((i) => i.type === "turn" && i.who === "user" && i.text === "再说一句")).toBe(true)
  })

  it("还在跑的不能接着问；没打开过的也不能", () => {
    const { h } = 起()
    expect(h.子agent续问开始(子, "x")).toBe(false)
    expect(h.子agent续问开始(子转录id(主, "没有", 0), "x")).toBe(false)
  })

  it("接着问的过程不碰主转录里跑完的 chip：状态、那一句都不动", () => {
    const { h, 发 } = 起()
    发({ kind: "settled", ok: true, result: { text: "原结论" } })
    h.ingest(主, { kind: "subagent_end", sessionId: 主, toolCallId: "c1", index: 0, ok: true })
    const 前 = h.subscribe(主).revision
    h.子agent续问开始(子, "再看看")
    发({ kind: "tool_start", toolCallId: "t9", toolName: "bash", input: { command: "ls" } })
    发({ kind: "settled", ok: false, error: "x", followUp: true })
    expect(chip(h)).toEqual({ index: 0, agent: "scout", task: "看看 README", status: "ok" })
    expect(h.subscribe(主).revision, "主转录不该因为续问动一下").toBe(前)
  })

  it("settled 与 end 之间的缝里接着问：chip 那一句也不跟着续问换", () => {
    const { h, 发 } = 起()
    发({ kind: "settled", ok: true, result: { text: "原结论" } })
    h.子agent续问开始(子, "再看看")
    发({ kind: "tool_start", toolCallId: "t9", toolName: "bash", input: { command: "ls" } })
    expect(chip(h)?.activity).toBeUndefined()
  })

  it("推出去的每一条都合协议；忘掉主会话时子转录一起忘", () => {
    const { h, 推, 发 } = 起()
    h.subscribe(子)
    发({ kind: "tool_start", toolCallId: "t1", toolName: "bash", input: { command: "ls" } })
    发({ kind: "settled", ok: true, result: { text: "x" } })
    for (const u of 推) expect(SessionUpdateSchema.safeParse(u).success, JSON.stringify(u)).toBe(true)
    h.forget(主)
    expect(h.peek(子)).toBeUndefined()
  })

  it("回退撤掉了那组 chip：它的子转录一起忘；别的调用的留着；之后迟到的事件不崩", () => {
    const h = new SessionTranscripts({ terminalMaxChars: 1000 })
    h.track(主, "native")
    h.userTurn(主, "第一句")
    h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId: "c1", index: 0, agent: "scout", task: "a" })
    h.userTurn(主, "第二句")
    const 第二句 = h.peek(主)!.items.at(-1)!.id
    h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId: "c2", index: 0, agent: "scout", task: "b" })
    h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId: "c2", index: 1, agent: "scout", task: "c" })
    expect(h.truncateAt(主, 第二句)).toBe(true)
    expect(h.peek(子转录id(主, "c1", 0))).toBeDefined()
    expect(h.peek(子转录id(主, "c2", 0))).toBeUndefined()
    expect(h.peek(子转录id(主, "c2", 1))).toBeUndefined()
    expect(() =>
      h.ingest(主, { kind: "subagent_event", sessionId: 主, toolCallId: "c2", index: 0, event: { kind: "tool_start", toolCallId: "t", toolName: "read", input: {} } }),
    ).not.toThrow()
  })
})
