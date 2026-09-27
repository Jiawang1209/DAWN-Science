/**
 * 子 agent 的运行目录（2026-09-27，spec §4.2 / §2.4）：`<会话目录>/subagents/<调用>/<序号>/`，
 * 里面是 pi 的 agentDir、`transcript/`（会话文件）与我们的 `meta.json`。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import { 子运行目录, 写元, 读元, 读子转录, 会话文件, 补子agent组, 记录读不出来, 子转录过大, 子转录读盘上限字节 } from "../../src/subagent/run-dir.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const 临时 = () => {
  const d = mkdtempSync(join(tmpdir(), "dawn-rundir-"))
  dirs.push(d)
  return d
}

describe("运行目录", () => {
  it("按调用分、按序号分；toolCallId 里的怪字符换掉（不许逃出 subagents/）", () => {
    expect(子运行目录("/s", "call_1", 0)).toBe(join("/s", "subagents", "call_1", "0"))
    expect(子运行目录("/s", "../x:y|z", 2)).toBe(join("/s", "subagents", "___x_y_z", "2"))
  })
})

describe("meta.json", () => {
  it("写了读得回；读不到 / 读不懂是 undefined（不猜）", () => {
    const d = 临时()
    expect(读元(d)).toBeUndefined()
    expect(写元(d, { agent: "scout", task: "t", status: "ok", result: { text: "结论" }, startedAt: 1, endedAt: 2 })).toBeUndefined()
    expect(读元(d)).toEqual({ agent: "scout", task: "t", status: "ok", result: { text: "结论" }, startedAt: 1, endedAt: 2 })
    writeFileSync(join(d, "meta.json"), "{坏的")
    expect(读元(d)).toBeUndefined()
  })
  it("写是先临时文件再改名：目录里不留 .tmp；status 不认识的当读不懂", () => {
    const d = 临时()
    写元(d, { agent: "scout", task: "t", status: "running", startedAt: 1 })
    expect(readdirSync(d)).toEqual(["meta.json"])
    writeFileSync(join(d, "meta.json"), JSON.stringify({ agent: "scout", task: "t", status: "飞了", startedAt: 1 }))
    expect(读元(d)).toBeUndefined()
  })
  it("写不进去时**回一句原因**，不抛——记录失败不该拖垮子 agent，但要出声", () => {
    const d = 临时()
    writeFileSync(join(d, "占着"), "")
    expect(写元(join(d, "占着"), { agent: "a", task: "t", status: "running", startedAt: 1 })).toMatch(/.+/)
  })
})

describe("会话文件读回", () => {
  it("没有 transcript/ 或里面没有 .jsonl：undefined", () => {
    const d = 临时()
    expect(会话文件(d)).toBeUndefined()
    expect(读子转录(d)).toBeUndefined()
  })
  it("pi 写的会话文件翻成 RestoredItem：用户那句、它说的、工具调用与结果", () => {
    const d = 临时()
    const sm = SessionManager.create(d, join(d, "transcript"))
    sm.appendMessage({ role: "user", content: "子任务：读 README", timestamp: 1 } as never)
    sm.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "我先读一下。" }, { type: "toolCall", id: "t1", name: "read", arguments: { path: "README.md" } }],
      api: "openai-completions", provider: "deepseek", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse", timestamp: 2,
    } as never)
    sm.appendMessage({ role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "# readme" }], isError: false, timestamp: 3 } as never)
    expect(会话文件(d)).toMatch(/\.jsonl$/)
    // `at`（2026-09-27 会话全文搜索）：消息上的 timestamp；工具条目取发起调用那条 assistant 的
    expect(读子转录(d)).toEqual([
      { kind: "text", who: "user", text: "子任务：读 README", at: 1 },
      { kind: "text", who: "agent", text: "我先读一下。", at: 2 },
      { kind: "tool", id: "t1", name: "read", input: { path: "README.md" }, result: "# readme", at: 2 },
    ])
  })
})

describe("会话文件读回的上限（2026-09-27 审查）", () => {
  function 一份(d: string, 工具结果: string) {
    const sm = SessionManager.create(d, join(d, "transcript"))
    sm.appendMessage({ role: "user", content: "读大文件", timestamp: 1 } as never)
    sm.appendMessage({
      role: "assistant",
      content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "cat big" } }],
      api: "openai-completions", provider: "deepseek", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse", timestamp: 2,
    } as never)
    sm.appendMessage({ role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: 工具结果 }], isError: false, timestamp: 3 } as never)
  }
  it("缺省上限是 20 MB", () => {
    expect(子转录读盘上限字节).toBe(20 * 1024 * 1024)
  })
  it("文件超过上限：不读，抛 `子转录过大`，话里说清多大、上限多少、全文在哪", () => {
    const d = 临时()
    一份(d, "x".repeat(4000))
    const f = 会话文件(d)!
    let 抓到: unknown
    try {
      读子转录(d, 1024)
    } catch (e) {
      抓到 = e
    }
    expect(抓到).toBeInstanceOf(子转录过大)
    const e = 抓到 as 子转录过大
    expect(e.字节).toBeGreaterThan(1024)
    expect(e.文件).toBe(f)
    expect(e.message).toMatch(/过程记录有 \d+\.\d MB，超过读盘上限 0\.0 MB，没有载入；全文在 /)
  })
  it("工具结果按活着那条路的 16 KiB 截，说清省了多少字节", () => {
    const d = 临时()
    const 大 = "y".repeat(40 * 1024)
    一份(d, 大)
    const 工具 = 读子转录(d)!.find((x) => x.kind === "tool")
    const r = 工具?.kind === "tool" ? 工具.result! : ""
    expect(Buffer.byteLength(r, "utf8")).toBeLessThan(17 * 1024)
    expect(r).toContain(`还有 ${40 * 1024 - 16 * 1024} 字节没显示，全文在它的会话文件里`)
  })
})

describe("重开后补 chip 组", () => {
  it("每条 subagent 工具行后面按盘上的 meta 插一组；DAWN 关掉时还在跑的记成失败并说清楚", () => {
    const s = 临时()
    写元(子运行目录(s, "c1", 0), { agent: "scout", task: "t0", status: "ok", startedAt: 1, endedAt: 2 })
    写元(子运行目录(s, "c1", 1), { agent: "planner", task: "t1", status: "running", startedAt: 1 })
    mkdirSync(子运行目录(s, "c1", 7) + "-不是序号", { recursive: true })
    const items: TranscriptItem[] = [
      { type: "turn", id: "r0", who: "user", text: "派两个", final: true },
      { type: "tool", id: "c1", name: "subagent", input: {}, status: "ok" },
      { type: "tool", id: "c2", name: "bash", input: {}, status: "ok" },
    ]
    const 出 = 补子agent组(items, s)
    expect(出.map((x) => x.id)).toEqual(["r0", "c1", "sub:c1", "c2"])
    const 组 = 出[2]
    expect(组?.type === "subagents" ? 组.agents : undefined).toEqual([
      { index: 0, agent: "scout", task: "t0", status: "ok" },
      { index: 1, agent: "planner", task: "t1", status: "error", error: "DAWN 关掉时它还在跑，没有跑完" },
    ])
  })
  it("meta.json 坏了（写到一半被杀）：照样占一颗 chip、说读不出来，不悄悄丢", () => {
    const s = 临时()
    const d = 子运行目录(s, "c1", 0)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, "meta.json"), "{半截")
    const 出 = 补子agent组([{ type: "tool", id: "c1", name: "subagent", input: {}, status: "ok" } as TranscriptItem], s)
    const 组 = 出.find((x) => x.type === "subagents")
    expect(组 && 组.type === "subagents" && 组.agents[0]).toMatchObject({ index: 0, status: "error", error: 记录读不出来 })
  })
  it("盘上没有记录（这个功能之前跑的）：不补，照旧只有工具行", () => {
    const items: TranscriptItem[] = [{ type: "tool", id: "c9", name: "subagent", input: {}, status: "ok" }]
    expect(补子agent组(items, 临时())).toEqual(items)
  })
})
