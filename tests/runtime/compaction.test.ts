/**
 * 上下文用量与压缩（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §1 a–e、§4 ③）。
 *
 * **白盒**：往私有表里塞一段假 pi 会话（与 `queue-mirror.test.ts` 同一个做法）。假会话只演这几件：
 * `state.messages` / `messages`、`getContextUsage()`、`settingsManager.getCompactionSettings()`、`compact()`、`isCompacting`。
 * 真 pi 压不压得成、摘要长什么样，归 `tests/integration/native-compaction.test.ts`。
 */
import { describe, expect, it } from "vitest"
import { NativeRuntime, 压缩收尾字段, 压缩原因人话 } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"

type pi用量 = { tokens: number | null; contextWindow: number; percent: number | null } | undefined

function 摆一段(o: { messages?: unknown[]; pi用量?: pi用量; 自动?: boolean; inFlight?: number } = {}) {
  const rt = new NativeRuntime({})
  const 内部 = rt as unknown as {
    sessions: Map<string, Record<string, unknown>>
    sinks: Map<string, ((e: AgentEvent) => void)[]>
    translate: (sessionId: string, e: unknown) => void
  }
  const 模型 = { id: "m", provider: "p", contextWindow: 128_000 }
  const pi = {
    model: 模型,
    state: { messages: o.messages ?? [], systemPrompt: "你是助手", tools: [] as unknown[], model: 模型 },
    get messages(): unknown[] {
      return this.state.messages
    },
    isCompacting: false,
    getContextUsage: (): pi用量 => o.pi用量,
    settingsManager: {
      getCompactionSettings: () => ({ enabled: o.自动 ?? true, reserveTokens: 16384, keepRecentTokens: 20000 }),
    },
    compact: async (_instructions?: string): Promise<unknown> => ({}),
  }
  内部.sessions.set("s1", {
    session: pi,
    inFlight: o.inFlight ?? 0,
    pending: undefined,
    lastUsage: undefined,
    usageIndexReported: undefined,
    usageTsReported: undefined,
    压缩待出声: false,
    实际模型: "p/m",
  })
  const 事件: AgentEvent[] = []
  内部.sinks.set("s1", [(e) => 事件.push(e)])
  return { rt, 内部, pi, 事件 }
}

/** 一条真回复：`totalTokens` 就是 pi 判线用的那个数 */
const 回复 = (ts: number, total: number, stopReason = "stop") => ({
  role: "assistant",
  timestamp: ts,
  stopReason,
  content: [],
  usage: { input: total - 8, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: total },
})
const 用量 = (事件: AgentEvent[]) => 事件.filter((e) => e.kind === "turn_usage")

describe("translate：压缩必须出声（spec §1 a）", () => {
  it("compaction_start → 我们的 compaction_start，原因照搬", () => {
    const x = 摆一段()
    x.内部.translate("s1", { type: "compaction_start", reason: "manual" })
    expect(x.事件).toContainEqual({ kind: "compaction_start", sessionId: "s1", reason: "manual" })
  })

  it("压完：摘要、前后用量、写摘要那次的花费、超上限那种标 retried", () => {
    const x = 摆一段()
    x.内部.translate("s1", {
      type: "compaction_end",
      reason: "overflow",
      result: { summary: "## Goal\n继续", firstKeptEntryId: "e9", tokensBefore: 131_072.4, estimatedTokensAfter: 9_400, usage: { input: 98_000, output: 1_100, cacheRead: 0 } },
      aborted: false,
      willRetry: true,
    })
    expect(x.事件.at(-1)).toEqual({
      kind: "compaction_end",
      sessionId: "s1",
      reason: "overflow",
      status: "done",
      tokensBefore: 131_072,
      tokensAfter: 9_400,
      summary: "## Goal\n继续",
      retried: true,
      usage: { input: 98_000, output: 1_100, cacheRead: 0 },
    })
  })

  it("停下了（停止 / 调整方向）：cancelled，不说失败", () => {
    expect(压缩收尾字段({ reason: "threshold", aborted: true })).toEqual({ reason: "threshold", status: "cancelled" })
  })

  it("没压成：原因翻成人话；认不出的原样透传", () => {
    expect(压缩收尾字段({ reason: "manual", errorMessage: "Compaction failed: Nothing to compact (session too small)" })).toEqual({
      reason: "manual",
      status: "failed",
      error: "对话还太短，没有可压缩的",
    })
    expect(压缩原因人话("Compaction failed: Already compacted")).toBe("刚压缩过，还没有新内容")
    expect(压缩原因人话("Context overflow recovery failed after one compact-and-retry attempt. Try reducing context or switching to a larger-context model.")).toContain("换一个上限更大的模型")
    expect(压缩原因人话("Auto-compaction failed: 429 Too Many Requests")).toBe("429 Too Many Requests")
    expect(压缩原因人话(undefined)).toBe("pi 没有给出原因")
  })

  it("认不出的 reason 当作过线（pi 只有这三种；多出来的不许让事件变形）", () => {
    expect(压缩收尾字段({ reason: "weird", aborted: true }).reason).toBe("threshold")
  })
})

describe("用量：压缩之后同一条回复不报第二次（spec §1 c）", () => {
  it("messages 换短、下标漂移：按时间戳认出是同一条", () => {
    const a1 = 回复(1000, 5000)
    const a2 = 回复(2000, 9000)
    const x = 摆一段({ messages: [{ role: "user", content: "一" }, a1, { role: "user", content: "二" }, a2] })
    x.内部.translate("s1", { type: "turn_end" })
    expect(用量(x.事件)).toHaveLength(1)
    // pi 压缩：messages 换成「摘要 + 最近那几条」，a2 的下标从 3 变成 2
    x.pi.state.messages = [{ role: "compactionSummary", summary: "…", tokensBefore: 9000, timestamp: 2500 }, { role: "user", content: "二" }, a2]
    x.内部.translate("s1", { type: "compaction_end", reason: "threshold", result: { summary: "…", firstKeptEntryId: "e", tokensBefore: 9000 }, aborted: false, willRetry: false })
    x.内部.translate("s1", { type: "turn_end" })
    expect(用量(x.事件), "账本对 turn_usage 是累加的，报第二次就重复计").toHaveLength(1)
  })

  it("压缩之后真来了新回复：照报", () => {
    const x = 摆一段({ messages: [{ role: "user", content: "一" }, 回复(1000, 5000)] })
    x.内部.translate("s1", { type: "turn_end" })
    x.pi.state.messages = [{ role: "compactionSummary", summary: "…", tokensBefore: 5000, timestamp: 1500 }, { role: "user", content: "二" }, 回复(3000, 700)]
    x.内部.translate("s1", { type: "turn_end" })
    expect(用量(x.事件)).toHaveLength(2)
  })
})

describe("contextUsage()：数从 pi 来（spec §1 b / e）", () => {
  it("还没有过回复：不给已用（pi 那时只数对话，系统提示词与工具说明不在里面）；线照给", () => {
    const u = 摆一段({ messages: [{ role: "user", content: "你好" }], pi用量: { tokens: 3, contextWindow: 128_000, percent: 0 } }).rt.contextUsage("s1" as never)!
    expect(u.usedTokens).toBeUndefined()
    expect(u.contextWindow).toBe(128_000)
    expect(u.compactAt).toBe(128_000 - 16_384)
  })

  it("最后一条就是那次回复：给真数，不标估", () => {
    const u = 摆一段({ messages: [{ role: "user", content: "你好" }, 回复(1, 20)], pi用量: { tokens: 20, contextWindow: 128_000, percent: 0.01 } }).rt.contextUsage("s1" as never)!
    expect(u.usedTokens).toBe(20)
    expect(u.estimated).toBeUndefined()
  })

  it("回复之后又加了东西：给 pi 的数并标估", () => {
    const u = 摆一段({
      messages: [{ role: "user", content: "你好" }, 回复(1, 20), { role: "toolResult", toolCallId: "t", toolName: "bash", content: [{ type: "text", text: "x".repeat(148) }] }],
      pi用量: { tokens: 57, contextWindow: 128_000, percent: 0.04 },
    }).rt.contextUsage("s1" as never)!
    expect(u).toMatchObject({ usedTokens: 57, estimated: true })
  })

  it("刚压缩过：afterCompaction，不给已用", () => {
    const u = 摆一段({ messages: [回复(1, 20)], pi用量: { tokens: null, contextWindow: 128_000, percent: null } }).rt.contextUsage("s1" as never)!
    expect(u.afterCompaction).toBe(true)
    expect(u.usedTokens).toBeUndefined()
  })

  it("中止 / 出错的回复不算真回复", () => {
    const u = 摆一段({ messages: [{ role: "user", content: "你好" }, 回复(1, 20, "error")], pi用量: { tokens: 20, contextWindow: 128_000, percent: 0 } }).rt.contextUsage("s1" as never)!
    expect(u.usedTokens).toBeUndefined()
  })

  it("pi 给不出（没上限）：退回最近一次真回复的数", () => {
    const u = 摆一段({ messages: [{ role: "user", content: "你好" }, 回复(1, 20)], pi用量: undefined }).rt.contextUsage("s1" as never)!
    expect(u.usedTokens).toBe(20)
  })

  it("自动压缩关着：不给线", () => {
    expect(摆一段({ 自动: false }).rt.contextUsage("s1" as never)!.compactAt).toBeUndefined()
  })
})

describe("压完的边角：空摘要、零用量不带字段", () => {
  it("摘要是空白：不带 summary 字段（缺就是缺，不给一个空串）", () => {
    const f = 压缩收尾字段({ reason: "manual", result: { summary: "  \n", tokensBefore: 10 }, aborted: false, willRetry: false })
    expect(f.status).toBe("done")
    expect("summary" in f).toBe(false)
  })

  it("写摘要那次报的用量全是零：不带 usage 字段", () => {
    const f = 压缩收尾字段({
      reason: "threshold",
      result: { summary: "…", tokensBefore: 10, usage: { input: 0, output: 0, cacheRead: 0 } },
      aborted: false,
      willRetry: false,
    })
    expect(f.status).toBe("done")
    expect("usage" in f).toBe(false)
  })
})

describe("compact()：手动压缩（spec §2.2 / D8）", () => {
  const 等一拍 = () => new Promise((r) => setTimeout(r, 0))

  it("这一轮还在跑：拒，说为什么；不去碰 pi", async () => {
    const x = 摆一段({ inFlight: 1 })
    let 调了 = false
    x.pi.compact = async () => {
      调了 = true
      return {}
    }
    expect(() => x.rt.compact("s1" as never)).toThrow(/这一轮还没说完/)
    expect(调了).toBe(false)
  })

  it("pi 正在自己压：同样拒", () => {
    const x = 摆一段()
    x.pi.isCompacting = true
    expect(() => x.rt.compact("s1" as never)).toThrow(/这一轮还没说完/)
  })

  it("压的期间算「在忙」（inFlight 加一），压完放下；要求原样交给 pi", async () => {
    const x = 摆一段()
    let 放行!: () => void
    let 收到: string | undefined
    x.pi.compact = (instructions?: string) => {
      收到 = instructions
      return new Promise((r) => (放行 = () => r({})))
    }
    x.rt.compact("s1" as never, "  保留暗号  ")
    expect(收到).toBe("保留暗号")
    expect(x.内部.sessions.get("s1")!["inFlight"]).toBe(1)
    expect(x.内部.sessions.get("s1")!["压缩待出声"]).toBe(true)
    放行()
    await 等一拍()
    await 等一拍()
    expect(x.内部.sessions.get("s1")!["inFlight"]).toBe(0)
    expect(x.内部.sessions.get("s1")!["压缩待出声"]).toBe(false)
  })

  it("pi 在发 compaction_start 之前就失败了（没有 end 可等）：补一句，不静默", async () => {
    const x = 摆一段()
    x.pi.compact = async () => {
      throw new Error("No model selected")
    }
    x.rt.compact("s1" as never)
    await 等一拍()
    await 等一拍()
    expect(x.事件.filter((e) => e.kind === "notice").map((e) => (e as { text: string }).text)).toEqual(["上下文没压缩成：No model selected"])
    expect(x.内部.sessions.get("s1")!["inFlight"]).toBe(0)
  })

  it("pi 同步就抛了（还没拿到 promise）：照样补一句、inFlight 放下，不往调用方抛", async () => {
    const x = 摆一段()
    x.pi.compact = () => {
      throw new Error("boom")
    }
    expect(() => x.rt.compact("s1" as never)).not.toThrow()
    await 等一拍()
    await 等一拍()
    expect(x.事件.filter((e) => e.kind === "notice").map((e) => (e as { text: string }).text)).toEqual(["上下文没压缩成：boom"])
    expect(x.内部.sessions.get("s1")!["inFlight"]).toBe(0)
  })

  it("失败但 pi 已经发过 end：不再补第二句", async () => {
    const x = 摆一段()
    x.pi.compact = async () => {
      x.内部.translate("s1", { type: "compaction_start", reason: "manual" })
      x.内部.translate("s1", { type: "compaction_end", reason: "manual", aborted: false, willRetry: false, errorMessage: "Compaction failed: Nothing to compact (session too small)" })
      throw new Error("Nothing to compact (session too small)")
    }
    x.rt.compact("s1" as never)
    await 等一拍()
    await 等一拍()
    expect(x.事件.filter((e) => e.kind === "notice")).toEqual([])
    expect(x.事件.at(-1)).toMatchObject({ kind: "compaction_end", status: "failed", error: "对话还太短，没有可压缩的" })
  })
})
