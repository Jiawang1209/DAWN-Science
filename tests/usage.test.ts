/**
 * Token 用量汇总（S21，2026-08-16）。
 *
 * 这一组盯的是**三条口径**，它们各自都能悄悄错，而错了之后
 * 屏幕上那个数字看起来和对的一模一样：
 *
 *   ① 缓存读**不进总数**——各家对它的含义不一样，合进去就是重复计
 *   ② 没记模型的**不摊进任何模型**，也不进日历，单列
 *   ③ 日期按**本地时区**切
 */
import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../src/store/schema.js"
import { 汇总用量, 算连续 } from "../src/store/usage.js"

let db: Database.Database

const 记一轮 = (opts: {
  at: string
  model?: string | null
  input?: number | null
  output?: number | null
  cache?: number | null
  id?: string
  /** 默认 `agent_turn`。**要能记别的**，否则「只数回合」那条判据验不动 */
  type?: string
}) => {
  const id = opts.id ?? `r${Math.random().toString(36).slice(2)}`
  db.prepare(`
    INSERT INTO runs (id, project_id, session_id, origin, request_type, status,
                      started_at, finished_at, has_error,
                      cost_visible, cost_input_tokens, cost_output_tokens,
                      cost_cache_read_tokens, cost_invisible_reason, model)
    VALUES (@id, 'p1', 's1', 'agent', @type, 'completed',
            @at, @at, 0, 0, @input, @output, @cache, '只报 token', @model)`).run({
    id,
    at: opts.at,
    type: opts.type ?? "agent_turn",
    input: opts.input ?? null,
    output: opts.output ?? null,
    cache: opts.cache ?? null,
    model: opts.model === undefined ? "deepseek/v4" : opts.model,
  })
}

beforeEach(() => {
  db = new Database(":memory:")
  migrate(db)
  db.prepare(`INSERT INTO projects (id, name, workspace, created_at) VALUES ('p1','demo','/w','2026-08-01T00:00:00.000Z')`).run()
})

describe("总数的口径", () => {
  it("总数 = 输入 + 输出", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 100, output: 20 })
    const u = 汇总用量(db, "2026-08-16")
    expect(u.total).toBe(120)
    expect(u.input).toBe(100)
    expect(u.output).toBe(20)
  })

  /**
   * **这一条是整组的要害。**
   *
   * 缓存读在有的 provider 那里是 `input` 的子集，在另一些那里是 `input` 之外的。
   * 加进总数会在前一种上重复计一遍——而那个数看起来完全正常。
   */
  it("**缓存读不进总数**，但要单独报出来", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 10, output: 5, cache: 1000 })
    const u = 汇总用量(db, "2026-08-16")
    expect(u.total, "缓存读被算进总数了").toBe(15)
    expect(u.cacheRead).toBe(1000)
  })

  it("一条 token 都没有的回合不参与", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: null, output: null })
    expect(汇总用量(db, "2026-08-16").total).toBe(0)
    expect(汇总用量(db, "2026-08-16").daily).toEqual([])
  })
})

describe("没记模型的那些", () => {
  /** 作者定的：不要 CLI 那部分。而 CLI 的回合恰恰就是「有 token、没模型」 */
  it("**不摊进任何模型，也不进日历**，单列出来", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 100, output: 20, model: "deepseek/v4" })
    记一轮({ at: "2026-08-16T04:00:00.000Z", input: 500, output: 300, model: null })
    const u = 汇总用量(db, "2026-08-16")
    expect(u.total, "无主的被算进总数了").toBe(120)
    expect(u.byModel).toEqual([{ model: "deepseek/v4", tokens: 120, runs: 1 }])
    expect(u.daily).toEqual([{ date: "2026-08-16", tokens: 120 }])
    expect(u.unattributed).toEqual({ runs: 1, tokens: 800 })
  })

  /**
   * **「一个 token 都没记到」是第三类，与前两类都不同。**
   *
   * `unattributed` 是「有 token，认不出模型」；这一类连 token 都没有。
   * 它不是假想的：`@zed-industries/claude-code-acp` 0.16.2 的
   * `session/prompt` 回执只有 `{"stopReason":"end_turn"}`
   * （2026-08-17 拿真适配器量的）。照「缺席不补 0」办的结果是
   * **那些回合在这一屏上完全不出现**——而一屏「一切正常」的统计，
   * 比一个标着「不知道」的格子更容易骗人。
   */
  it("一个 token 都没记到的回合要数出来，且不与「无主」混为一谈", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 100, output: 20, model: "deepseek/v4" })
    // 有 token、没模型 —— 这是 unattributed
    记一轮({ at: "2026-08-16T04:00:00.000Z", input: 500, output: 300, model: null })
    /**
     * 连 token 都没有 —— 这是 silentTurns（claude 的 ACP 适配器就长这样）。
     *
     * **两条都带模型**，且与「无主」那条的条数**不相等**：
     * 相等的话，把判据写成 `model IS NULL` 也能蒙对
     * （2026-08-17 变异测试当场抓到的假绿）。
     */
    记一轮({ at: "2026-08-16T05:00:00.000Z", input: null, output: null, model: "claude-acp/sonnet" })
    记一轮({ at: "2026-08-16T06:00:00.000Z", input: null, output: null, model: "claude-acp/sonnet" })
    /**
     * **只记到一半也算记到了。**
     * 判据写成只看 `input` 的话，这一条会被误当成「一个 token 都没记到」——
     * 而它明明记到了 7 个。
     */
    记一轮({ at: "2026-08-16T06:30:00.000Z", input: null, output: 7, model: "deepseek/v4" })
    /** **工具调用不算回合。** 不摆一条的话，「只数 agent_turn」那道闸删了也没人红 */
    记一轮({
      at: "2026-08-16T07:00:00.000Z",
      input: null,
      output: null,
      model: null,
      type: "tool_call:read",
    })
    const u = 汇总用量(db, "2026-08-16")
    expect(u.silentTurns, "没记到的回合没数出来").toBe(2)
    // **两类不许互相污染**
    expect(u.unattributed).toEqual({ runs: 1, tokens: 800 })
    expect(u.total).toBe(127)
  })

  it("**它不是 0**：一条无主的都没有时，也如实报 0 条", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 1, output: 1 })
    expect(汇总用量(db, "2026-08-16").unattributed).toEqual({ runs: 0, tokens: 0 })
  })
})

describe("按模型", () => {
  it("从多到少排，回合数也带上", () => {
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 10, output: 0, model: "kimi/k3" })
    记一轮({ at: "2026-08-16T04:00:00.000Z", input: 100, output: 0, model: "deepseek/v4" })
    记一轮({ at: "2026-08-16T05:00:00.000Z", input: 100, output: 0, model: "deepseek/v4" })
    expect(汇总用量(db, "2026-08-16").byModel).toEqual([
      { model: "deepseek/v4", tokens: 200, runs: 2 },
      { model: "kimi/k3", tokens: 10, runs: 1 },
    ])
  })
})

describe("按天", () => {
  /**
   * **本地时区**。按 UTC 切日的话，晚上八点之后干的活会被算到「明天」，
   * 而人看的是自己的日历。这条用例把时区钉死，否则它在 CI 上会随机变绿变红。
   */
  it("日期按本地时区切", () => {
    const 原 = process.env["TZ"]
    process.env["TZ"] = "Asia/Shanghai"
    try {
      // UTC 的 16:00 = 上海的次日 00:00
      记一轮({ at: "2026-08-16T16:30:00.000Z", input: 7, output: 0 })
      expect(汇总用量(db, "2026-08-17").daily).toEqual([{ date: "2026-08-17", tokens: 7 }])
    } finally {
      if (原 === undefined) delete process.env["TZ"]
      else process.env["TZ"] = 原
    }
  })

  it("峰值与活跃天数", () => {
    记一轮({ at: "2026-08-14T03:00:00.000Z", input: 10, output: 0 })
    记一轮({ at: "2026-08-16T03:00:00.000Z", input: 90, output: 0 })
    const u = 汇总用量(db, "2026-08-16")
    expect(u.activeDays).toBe(2)
    expect(u.peak).toEqual({ date: "2026-08-16", tokens: 90 })
  })
})

describe("连续天数", () => {
  /**
   * **`current` 截至今天。** 昨天连了五天、今天没用，该说「0 天」——
   * 说「5 天」会让人以为自己还连着。
   */
  it("今天没用，当前连续就是 0", () => {
    expect(算连续(["2026-08-13", "2026-08-14", "2026-08-15"], "2026-08-16")).toEqual({
      current: 0,
      longest: 3,
    })
  })

  it("连到今天为止", () => {
    expect(算连续(["2026-08-14", "2026-08-15", "2026-08-16"], "2026-08-16")).toEqual({
      current: 3,
      longest: 3,
    })
  })

  it("断过的取最长那一段", () => {
    expect(算连续(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-10", "2026-08-16"], "2026-08-16")).toEqual({
      current: 1,
      longest: 3,
    })
  })

  it("一天都没有", () => {
    expect(算连续([], "2026-08-16")).toEqual({ current: 0, longest: 0 })
  })

  /** 跨月要连得上——`08-01` 的前一天是 `07-31`，不是 `08-00` */
  it("跨月连得上", () => {
    expect(算连续(["2026-07-31", "2026-08-01"], "2026-08-01")).toEqual({ current: 2, longest: 2 })
  })
})
