/**
 * 成本接线（2026-08-09）。
 *
 * ## 这条线此前是断的，而且断得很安静
 *
 * 数据库有六列（含一条 CHECK 约束区分「不可见」与「零」）、`RunFinish` 有
 * `cost` 字段、协议有 `CostSchema`、界面的成本栏写好了三态——
 * **中间那一段从来没接**：`run-recorder.ts` 里一个 `cost` 字都没有。
 * 于是成本栏在任何情况下都显示「尚未记录」，**而那句话是错的**：
 * 我们记了这一轮，只是没记到钱。
 *
 * ## 三个运行时知道的东西不一样多
 *
 * | | token | 金额 |
 * |---|---|---|
 * | claude | 有 | **有**（`result.total_cost_usd`，它自己算的真数） |
 * | codex | 有 | 没有 |
 * | native | 有（已在上下文栏显示） | 没有 |
 *
 * **拿不到金额的不替它算一个。** 按价目表乘 token 得到的是估算，
 * 而账本上的估算会被当成事实——不变式 5 禁止的正是这个。
 * 所以它们说「不可见 + 为什么」，而不是继续假装「尚未记录」。
 */
import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../src/store/schema.js"
import { RunStore } from "../src/store/runs.js"
import { RunRecorder } from "../src/project/run-recorder.js"
import { translateClaudeEvent, type ClaudeTranslateState } from "../src/runtime/cli/claude-translate.js"
import { translateCodexEvent, type CodexTranslateState } from "../src/runtime/cli/codex-translate.js"
import type { AgentEvent } from "../src/runtime/types.js"
import type { Cost } from "../src/protocol/index.js"

const SESSION = "s1"
const PROJECT = "p1"

/* ── 翻译层：各自说出自己知道多少 ─────────────────────────────────── */

const costOf = (events: AgentEvent[]): Cost | undefined =>
  events.find((e) => e.kind === "cost")?.cost

describe("claude：钱和 token 都有", () => {
  const st = (): ClaudeTranslateState => ({ unknownKinds: new Map() }) as ClaudeTranslateState

  it("**金额取 `total_cost_usd`** —— 它是 CLI 自己算的真数，不是我们乘出来的", () => {
    const out = translateClaudeEvent(SESSION, {
      type: "result",
      is_error: false,
      total_cost_usd: 0.0123,
      usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5 },
    }, st())
    expect(costOf(out)).toEqual({
      visible: true,
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      totalUSD: 0.0123,
    })
  })

  it("**没报缓存读就不给这个字段** —— 缺省不等于 0", () => {
    const out = translateClaudeEvent(SESSION, {
      type: "result",
      is_error: false,
      total_cost_usd: 0.5,
      usage: { input_tokens: 1, output_tokens: 2 },
    }, st())
    expect(costOf(out)).not.toHaveProperty("cacheReadTokens")
  })

  it("**没有金额时整体不可见，而不是 0** —— 0 会被读成「免费」", () => {
    const out = translateClaudeEvent(SESSION, {
      type: "result",
      is_error: false,
      usage: { input_tokens: 1, output_tokens: 2 },
    }, st())
    expect(costOf(out)).toMatchObject({ visible: false })
  })

  it("金额是垃圾值时也当作没有", () => {
    for (const bad of ["1.0", NaN, -1, null]) {
      const out = translateClaudeEvent(SESSION, {
        type: "result",
        is_error: false,
        total_cost_usd: bad,
      }, st())
      expect(costOf(out), `total_cost_usd=${String(bad)}`).toMatchObject({ visible: false })
    }
  })

  it("**成本发在 idle 之前** —— 账本要在收口那一刻把它记到这一轮上", () => {
    const out = translateClaudeEvent(SESSION, {
      type: "result", is_error: false, total_cost_usd: 1,
    }, st())
    const kinds = out.map((e) => e.kind)
    expect(kinds.indexOf("cost")).toBeLessThan(kinds.indexOf("idle"))
  })
})

describe("codex：只报 token，不报金额", () => {
  it("**说「不可见 + 为什么」，不拿 token 乘价目表凑一个金额**", () => {
    const st: CodexTranslateState = { unknownKinds: new Map(), threadId: undefined }
    const out = translateCodexEvent(SESSION, { type: "turn.completed", usage: {} }, st)
    const c = costOf(out)
    expect(c).toMatchObject({ visible: false })
    expect(c && !c.visible ? c.reason : "").toMatch(/token/)
  })
})

/* ── 账本层：成本落到「这一轮」那条 run 上 ───────────────────────── */

describe("账本", () => {
  let db: Database.Database
  let runs: RunStore
  let rec: RunRecorder
  let clock: number

  beforeEach(() => {
    db = new Database(":memory:")
    migrate(db)
    db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES (?,?,?,?)`)
      .run(PROJECT, "demo", "/w", "2026-08-09T00:00:00.000Z")
    runs = new RunStore(db)
    clock = 0
    rec = new RunRecorder({
      runs,
      projectOf: (s) => (s === SESSION ? PROJECT : undefined),
      now: () => new Date(1_800_000_000_000 + clock++ * 1000).toISOString(),
    })
  })

  const theTurn = () => runs.listByProject(PROJECT, {}).find((r) => r.requestType === "agent_turn")!

  it("可见的成本落到这一轮上", () => {
    rec.beginTurn(SESSION)
    rec.ingest({
      kind: "cost",
      sessionId: SESSION,
      cost: { visible: true, inputTokens: 3, outputTokens: 4, totalUSD: 0.02 },
    })
    rec.ingest({ kind: "idle", sessionId: SESSION })
    expect(theTurn().cost).toEqual({ visible: true, inputTokens: 3, outputTokens: 4, totalUSD: 0.02 })
  })

  it("**不可见的成本也要落库** —— 「不可见 + 原因」与「尚未记录」是两回事", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "cost", sessionId: SESSION, cost: { visible: false, reason: "只报 token" } })
    rec.ingest({ kind: "idle", sessionId: SESSION })
    expect(theTurn().cost).toEqual({ visible: false, reason: "只报 token" })
  })

  it("**没收到成本的一轮，run 上就没有这个字段** —— 那是「尚未记录」，不是 0", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    expect(theTurn().cost).toBeUndefined()
    expect("cost" in theTurn()).toBe(false)
  })

  it("**没有开着的回合时丢弃** —— 硬记到上一轮就是把 A 的账算到 B 头上", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    rec.ingest({ kind: "cost", sessionId: SESSION, cost: { visible: false, reason: "迟到的" } })
    expect(theTurn().cost).toBeUndefined()
  })

  it("**成本不跨轮残留** —— 第一轮报了、第二轮没报，第二轮就该是「尚未记录」", () => {
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "cost", sessionId: SESSION, cost: { visible: false, reason: "第一轮" } })
    rec.ingest({ kind: "idle", sessionId: SESSION })
    rec.beginTurn(SESSION)
    rec.ingest({ kind: "idle", sessionId: SESSION })
    const turns = runs.listByProject(PROJECT, {}).filter((r) => r.requestType === "agent_turn")
    expect(turns).toHaveLength(2)
    expect(turns.filter((t) => t.cost !== undefined)).toHaveLength(1)
  })
})
