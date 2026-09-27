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

/** 2026-09-27 审查：子转录不许跟着整个进程活下去；撤掉在答的要停；id 按盘上那一段认 */
describe("子转录的内存与身份（审查）", () => {
  function 派(h: SessionTranscripts, toolCallId: string, index = 0, 收尾 = true) {
    h.ingest(主, { kind: "subagent_start", sessionId: 主, toolCallId, index, agent: "scout", task: `任务 ${toolCallId}` })
    if (收尾) h.ingest(主, { kind: "subagent_event", sessionId: 主, toolCallId, index, event: { kind: "settled", ok: true, result: { text: "好" } } })
    return 子转录id(主, toolCallId, index)
  }
  function 新(上限?: number) {
    const h = new SessionTranscripts({ terminalMaxChars: 1000, ...(上限 === undefined ? {} : { 子转录留存上限: 上限 }) })
    h.track(主, "native")
    h.subscribe(主)
    return h
  }

  it("退订一段跑完了、没在答的子转录：忘掉它（能从盘上重建）；还在跑的、在答的留着", () => {
    const h = 新()
    const 完 = 派(h, "c1")
    const 跑 = 派(h, "c2", 0, false)
    const 答 = 派(h, "c3")
    h.subscribe(完)
    h.subscribe(跑)
    h.subscribe(答)
    h.子agent续问开始(答, "再说")
    h.unsubscribe(完)
    h.unsubscribe(跑)
    h.unsubscribe(答)
    expect(h.peek(完)).toBeUndefined()
    expect(h.peek(跑)?.subagent?.status).toBe("running")
    expect(h.peek(答)?.subagent?.asking).toBe(true)
  })

  it("退订主会话：它名下跑完了、没人看着的子转录一起忘；有人看着的、还在跑的留着；主会话本身留着", () => {
    const h = 新()
    const 没开过 = 派(h, "c1")
    const 看着 = 派(h, "c2")
    const 跑 = 派(h, "c3", 0, false)
    h.subscribe(看着)
    h.unsubscribe(主)
    expect(h.peek(没开过)).toBeUndefined()
    expect(h.peek(看着)).toBeDefined()
    expect(h.peek(跑)).toBeDefined()
    expect(h.peek(主)).toBeDefined()
  })

  it("每段会话跑完了的子转录有上限：超了丢最久没用的；有人看着的不丢", () => {
    const h = 新(2)
    const a = 派(h, "c1")
    h.subscribe(a) // 看着的：再老也不丢
    const b = 派(h, "c2")
    const c = 派(h, "c3")
    const d = 派(h, "c4")
    expect(h.peek(a)).toBeDefined()
    expect(h.peek(b)).toBeUndefined()
    expect(h.peek(c)).toBeUndefined()
    expect(h.peek(d)).toBeDefined()
    // 还在跑的不算进「跑完了」，也不会被丢
    const 跑 = 派(h, "c5", 0, false)
    派(h, "c6")
    expect(h.peek(跑)).toBeDefined()
  })

  it("回退撤掉的 chip 组里正在答续问的：回调点名（调用方据此停掉那一问）；没在答的不点", () => {
    const h = 新()
    const 答 = 派(h, "c1")
    派(h, "c2")
    h.子agent续问开始(答, "再说")
    h.userTurn(主, "下一句")
    派(h, "c3")
    const u = h.subscribe(主).items.find((i) => i.type === "turn" && i.who === "user")!
    // c1、c2 在那句之前，不撤；再派一个在答的 c4 在那句之后
    const 后答 = 派(h, "c4")
    h.子agent续问开始(后答, "也再说")
    const 点名: string[] = []
    expect(h.truncateAt(主, u.id, (tc, i) => 点名.push(`${tc}:${i}`))).toBe(true)
    expect(点名).toEqual(["c4:0"])
    expect(h.peek(后答)).toBeUndefined()
    expect(h.peek(答)).toBeDefined()
  })

  it("撤掉 toolCallId `a` 那一组不连带 `a:0` 那一组（按字段比，不按前缀）", () => {
    const h = 新()
    const 别人 = 派(h, "a:0", 1)
    h.userTurn(主, "这句")
    const u = h.subscribe(主).items.find((i) => i.type === "turn" && i.who === "user")!
    const 这组 = 派(h, "a", 0)
    h.truncateAt(主, u.id)
    expect(h.peek(这组)).toBeUndefined()
    expect(h.peek(别人), "`S#sub:a:` 这个前缀吞掉了 `S#sub:a:0:1`").toBeDefined()
  })

  it("`call.1` 与 `call_1` 是同一个运行目录：找子转录认得出，子事件进同一段", () => {
    const h = 新()
    const 原 = 派(h, "call.1", 0, false)
    expect(h.找子转录(子转录id(主, "call_1", 0))).toBe(原)
    expect(h.找子转录(子转录id(主, "call_2", 0))).toBeUndefined()
    h.ingest(主, { kind: "subagent_event", sessionId: 主, toolCallId: "call_1", index: 0, event: { kind: "output", data: "进来了" } })
    expect(h.peek(原)!.items.some((i) => i.type === "turn" && i.who === "agent" && i.text === "进来了")).toBe(true)
  })

  it("读盘建起来的（track 带 已结束）：快照 state 是 exited——界面不画「正在干活」；活着建的是 alive", () => {
    const h = 新()
    const 盘 = 子转录id(主, "c9", 0)
    h.track(盘, "native", { 子转录: true, 已结束: true })
    expect(h.peek(盘)?.state).toBe("exited")
    expect(h.peek(派(h, "c1", 0, false))?.state).toBe("alive")
  })
})
