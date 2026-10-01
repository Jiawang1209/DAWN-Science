/**
 * 子转录的推送分流（2026-09-27，子 agent 看得见）。
 *
 * 子转录不是一段会话：让它走 `App` 里真会话那几段，答完就会被退订——中枢随即把跑完的子转录扔掉（8cea39e），
 * 坞里正看着的那一格就空了。所以两件事要钉：①`收子转录推送` 认得出、只收正在看的那一段；
 * ②`App.tsx` 里它排在「答完退订」那一段之前。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SessionUpdate } from "../../src/protocol/index.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"
import { 收子转录推送, 子槽, $子agent信息, $子转录id } from "../../src/ui/state/subagent-view.js"

afterEach(() => {
  子槽.reset()
  $子agent信息.set(undefined)
  $子转录id.set(undefined)
})

const 包 = (sessionId: string, rest: Record<string, unknown>) =>
  ({ workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, sessionId, revision: 1, ...rest }) as unknown as SessionUpdate

const 一条 = { type: "turn", id: "a", who: "agent", text: "读完了", final: true }

describe("收子转录推送", () => {
  it("真会话的推送不归它：答 false，子槽不动", () => {
    expect(收子转录推送(包("s1", { type: "item", item: 一条 }))).toBe(false)
    子槽.flush()
    expect(子槽.$items.get()).toEqual([])
  })
  it("正在看的那一段：条目进子槽、头信息跟着换", () => {
    $子转录id.set("s1#sub:c1:0")
    expect(收子转录推送(包("s1#sub:c1:0", { type: "item", item: 一条 }))).toBe(true)
    子槽.flush()
    expect(子槽.$items.get().map((x) => x.id)).toEqual(["a"])
    const 信息 = { agent: "a", task: "t", status: "ok", canAsk: true } as const
    expect(收子转录推送(包("s1#sub:c1:0", { type: "subagent", subagent: 信息 }))).toBe(true)
    expect($子agent信息.get()).toEqual(信息)
  })
  it("子转录 append 原位追加；目标缺失时请求该子转录的快照", () => {
    $子转录id.set("s1#sub:c1:0")
    expect(收子转录推送(包("s1#sub:c1:0", { type: "item", item: { ...一条, id: "a1", text: "甲", final: false } }))).toBe(true)
    const resync = vi.fn()
    expect(收子转录推送(包("s1#sub:c1:0", { type: "append", id: "a1", field: "text", delta: "乙" }), resync)).toBe(true)
    子槽.flush()
    expect(子槽.$items.get()[0]).toMatchObject({ text: "甲乙" })
    expect(收子转录推送(包("s1#sub:c1:0", { type: "append", id: "missing", field: "text", delta: "x" }), resync)).toBe(true)
    expect(resync).toHaveBeenCalledWith("s1#sub:c1:0")
  })
  it("别的子转录（没在看）：认下、丢掉——**不许漏到真会话那几段**", () => {
    $子转录id.set("s1#sub:c1:0")
    expect(收子转录推送(包("s1#sub:c1:1", { type: "item", item: 一条 }))).toBe(true)
    子槽.flush()
    expect(子槽.$items.get()).toEqual([])
  })
})

describe("App.tsx 里的顺序", () => {
  it("**先分流子转录，再走「答完退订」**——反过来，坞里正看着的那一段答完就被退订、被中枢扔掉", () => {
    const src = readFileSync(join(__dirname, "../../src/ui/App.tsx"), "utf8")
    const 分流 = src.indexOf("if (收子转录推送(u, (sessionId) => void resyncSession(client, sessionId))) return")
    const 退订 = src.indexOf('client.get("unsubscribeSession", { sessionId: u.sessionId })')
    const 标在跑 = src.indexOf("标记在跑(u.sessionId, true)")
    const 坞追加 = src.indexOf('if (u.type === "append" && !侧槽.appendItem(u.id, u.field, u.delta))')
    const 主追加 = src.indexOf('if (u.type === "append" && !appendItem(u.id, u.field, u.delta))')
    expect(分流, "分流那一句不在了——这条扫描要跟着改").toBeGreaterThan(0)
    expect(退订).toBeGreaterThan(0)
    expect(标在跑).toBeGreaterThan(0)
    expect(分流).toBeLessThan(标在跑)
    expect(分流).toBeLessThan(退订)
    expect(坞追加).toBeGreaterThan(分流)
    expect(主追加).toBeGreaterThan(分流)
  })
})
