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

  /**
   * **token 这条线，2026-08-16 之前也是断的**，而且断在同一个地方：
   * 运行时一直在发 `turn_usage`（上下文栏用的就是它），账本一个都没记。
   * 作者要做「用量」那一屏时才发现——**建屏之前先得有数**。
   */
  describe("token", () => {
    it("**一轮里的每次模型调用都要累加** —— 不是取最后一条", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 100, output: 20 } })
      // 工具调用之后又问了一次模型：**这一次也要算**
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 150, output: 30, cacheRead: 7 } })
      rec.ingest({ kind: "cost", sessionId: SESSION, cost: { visible: false, reason: "只报 token" } })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      expect(theTurn().cost).toEqual({
        visible: false,
        reason: "只报 token",
        inputTokens: 250,
        outputTokens: 50,
        cacheReadTokens: 7,
      })
    })

    /** **钱看不见，不代表 token 也看不见**——这正是上一版把它丢掉的理由 */
    it("一条成本事件都没来，光有 token 也要落库", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 5, output: 6 } })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      const c = theTurn().cost
      expect(c?.visible).toBe(false)
      expect(c).toMatchObject({ inputTokens: 5, outputTokens: 6 })
    })

    /** 报了真金额的（claude）不许被 token 覆盖掉 */
    it("金额可见时，原样保留", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 999, output: 999 } })
      rec.ingest({
        kind: "cost",
        sessionId: SESSION,
        cost: { visible: true, inputTokens: 3, outputTokens: 4, totalUSD: 0.02 },
      })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      expect(theTurn().cost).toEqual({ visible: true, inputTokens: 3, outputTokens: 4, totalUSD: 0.02 })
    })

    it("**不跨轮残留**：第一轮报了、第二轮没报，第二轮就没有 token", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 5, output: 6 } })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "idle", sessionId: SESSION })
      const turns = runs.listByProject(PROJECT, {}).filter((r) => r.requestType === "agent_turn")
      expect(turns.filter((t) => t.cost !== undefined)).toHaveLength(1)
    })

    /** **谁答的就记谁**：中途换模型时，以最后一次回执为准 */
    it("记下实际答话的那个模型", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 1, output: 1 }, model: "deepseek/v4" })
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 1, output: 1 }, model: "kimi/k3" })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      const row = db.prepare(`SELECT model FROM runs WHERE request_type = 'agent_turn'`).get() as {
        model: string | null
      }
      expect(row.model).toBe("kimi/k3")
    })

    /** **老数据、或回执里没有 → NULL**，读作「不知道」，不是某个模型 */
    it("没给模型时留 NULL，不补一个默认的", () => {
      rec.beginTurn(SESSION)
      rec.ingest({ kind: "turn_usage", sessionId: SESSION, usage: { input: 1, output: 1 } })
      rec.ingest({ kind: "idle", sessionId: SESSION })
      const row = db.prepare(`SELECT model FROM runs WHERE request_type = 'agent_turn'`).get() as {
        model: string | null
      }
      expect(row.model).toBeNull()
    })
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

/**
 * 外部 agent 干的活，文件事实**从 git 反推**（B1 路线 C，2026-08-16）。
 *
 * ## 这条路此前不存在
 *
 * 内置对话的文件事实来自我们自己的工具包装器（`tool_files` 事件）。
 * 而 **ACP / CLI agent 用的是它自己的读写工具**——那些调用根本不经过我们，
 * 于是它在项目里干的活在账本上只有「跑了一轮」，**改了什么一概没有**。
 *
 * 不变式 5 说的是「从 git 事实算，不听 agent 声明」。
 * 这一组把它用在外部 agent 身上。
 */
describe("外部 agent 的文件事实", () => {
  let db2: Database.Database
  let runs2: RunStore
  let 拍了: string[]
  let rec2: RunRecorder

  beforeEach(() => {
    db2 = new Database(":memory:")
    migrate(db2)
    db2.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES (?,?,?,?)`)
      .run(PROJECT, "demo", "/w", "2026-08-17T00:00:00.000Z")
    runs2 = new RunStore(db2)
    拍了 = []
    let clock2 = 0
    rec2 = new RunRecorder({
      runs: runs2,
      projectOf: (s) => (s === SESSION ? PROJECT : undefined),
      now: () => new Date(1_800_000_000_000 + clock2++ * 1000).toISOString(),
      外部文件事实: {
        拍基线: (s) => 拍了.push(s),
        比一次: async () => ({ filesWritten: ["a.csv", "报告.md"], mayIncludeUserEdits: true }),
      },
    })
  })

  const 那一轮 = () => runs2.listByProject(PROJECT, {}).find((r) => r.requestType === "agent_turn")!

  /** **基线必须在回合开始时拍**——收口时再拍就什么都比不出来了 */
  it("回合一开始就拍基线", () => {
    rec2.beginTurn(SESSION)
    expect(拍了).toEqual([SESSION])
  })

  it("**收口之后，改了哪些文件落在那一轮上**", async () => {
    rec2.beginTurn(SESSION)
    rec2.ingest({ kind: "idle", sessionId: SESSION })
    // 补写是异步的（git 要跑几条命令），不阻塞收口
    await new Promise((r) => setTimeout(r, 20))
    expect(那一轮().filesWritten).toEqual(["a.csv", "报告.md"])
    // **读了什么在这一层也要缺席**：NULL 映射成 [] 就是把「不知道」说成「没读」
    expect(那一轮().filesRead, "不知道读了什么，不该冒出一个空数组").toBeUndefined()
  })

  /**
   * **「读了什么」必须留空。**
   *
   * git 只知道「改了什么」——写成空数组等于宣称「确认一个文件都没读」，
   * 而那是编造（不变式 5）。缺席读作「不知道」。
   */
  it("读了什么留 NULL，不写成空数组", async () => {
    rec2.beginTurn(SESSION)
    rec2.ingest({ kind: "idle", sessionId: SESSION })
    await new Promise((r) => setTimeout(r, 20))
    const row = db2
      .prepare(`SELECT files_read, files_written FROM runs WHERE request_type = 'agent_turn'`)
      .get() as { files_read: string | null; files_written: string | null }
    expect(row.files_written, "改了什么该记上").toContain("a.csv")
    expect(row.files_read, "读了什么我们不知道，不能写成 []").toBeNull()
  })

  /** 算不出来时（不是 git 仓库、git 出错）**什么都不补**，不编造 */
  it("算不出来时不补，留「不知道」", async () => {
    const 只报错 = new RunRecorder({
      runs: runs2,
      projectOf: (s) => (s === SESSION ? PROJECT : undefined),
      now: () => new Date(1_900_000_000_000).toISOString(),
      外部文件事实: {
        拍基线: () => {},
        比一次: async () => {
          throw new Error("不是 git 仓库")
        },
      },
    })
    只报错.beginTurn(SESSION)
    只报错.ingest({ kind: "idle", sessionId: SESSION })
    await new Promise((r) => setTimeout(r, 20))
    const 全部 = runs2.listByProject(PROJECT, {}).filter((r) => r.requestType === "agent_turn")
    expect(全部[0]?.filesWritten).toBeUndefined()
  })
})
