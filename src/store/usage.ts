/**
 * Token 用量的汇总（S21，2026-08-16）。
 *
 * 作者：*「我想知道我们这个 dawn-science 里面能否增加 token 统计的功能……
 * 统计我们 dawn-science 里面消耗的所有的 token，并且基于不同的模型进行统计，
 * 我其实还想做成 codex 这种可以直接在用量里面，设置一个每天的进度条……
 * 此外，再基于不同模型消耗的 token 绘制一个饼图。」*
 *
 * ## 三条口径，都得写死在这儿，不能留给界面去猜
 *
 * ### 一、什么算「用掉的 token」：**输入 + 输出，不含缓存读**
 *
 * 缓存读那一档**各家的含义不一样**：有的 provider 把它算在 `input` 里
 * （它是 `input` 的一个子集），有的单列在 `input` 之外。加进总数会重复计一遍，
 * 不加又会在另一些 provider 上少算——**而我们无法从一个数字看出它是哪一种**。
 *
 * 所以：总数只算输入与输出，缓存读**单独报一个数**，由界面另行说明。
 * 这不是保守，是**不知道就别合并**：一个合错了的总数看起来和对的一模一样。
 *
 * ### 二、只算**记了模型**的那些回合
 *
 * 作者定的：*「我们可以不要 cli 部分的 token 了」*。
 * 外部 CLI（claude / codex）报的 token 会落在 `cost` 上，但它们**没有 model**
 * ——那两个 CLI 的模型由它们自己管，我们的回执里没有。
 * 本版之前的历史回合同样没有。两类都归进 `unattributed`，
 * **单独摆出来，不摊进任何一个模型，也不显示成 0**（规格 7.5）。
 *
 * ### 三、日期按**本地时区**切
 *
 * `started_at` 是 UTC 的 ISO 串。按 UTC 切日的话，晚上八点之后干的活会被
 * 算到「明天」——而人看的是自己的日历。SQLite 的 `date(…, 'localtime')`
 * 用的是**进程所在时区**，与界面同一台机器，所以两边一致。
 */
import type Database from "better-sqlite3"

/** 一天用掉多少。`date` 是本地日期 `YYYY-MM-DD` */
export interface 每日用量 {
  date: string
  tokens: number
}

/** 一个模型用掉多少。`model` 形如 `deepseek/deepseek-v4-flash` */
export interface 按模型用量 {
  model: string
  tokens: number
  /** 有多少个回合。**没有它就分不出「一次大的」与「很多次小的」** */
  runs: number
}

export interface 用量汇总 {
  /** 输入 + 输出。**不含缓存读**——理由见文件头 */
  total: number
  input: number
  output: number
  /** 缓存读。**单独报**，不并进 `total` */
  cacheRead: number
  /** 按本地日期，**只含有数的那些天**（热力图自己补空档） */
  daily: 每日用量[]
  /** 按模型，从多到少 */
  byModel: 按模型用量[]
  /** 用掉最多的那一天。一天都没有时为 undefined */
  peak?: 每日用量
  /** 有记录的天数 */
  activeDays: number
  /** 连续天数：`current` 截至今天（今天没用就是 0），`longest` 是历史最长 */
  streak: { current: number; longest: number }
  /**
   * **有 token、但不知道是谁花的**（外部 CLI、以及本版之前的历史回合）。
   * 摆出来而不是丢掉：*「一共就这么多」*与*「我们统计到这么多」*是两句话。
   */
  unattributed: { runs: number; tokens: number }
}

interface 行 {
  d: string
  model: string | null
  input: number
  output: number
  cache: number
  runs: number
}

/**
 * 查一次汇总。
 *
 * @param 今天 本地日期 `YYYY-MM-DD`，**由调用方给**——测试要能钉住「今天」，
 *   而 `new Date()` 会让「连续天数」这条判据随真实日期漂。
 */
export function 汇总用量(db: Database.Database, 今天: string): 用量汇总 {
  const 行们 = db
    .prepare(`
      SELECT date(started_at, 'localtime') AS d,
             model                          AS model,
             SUM(COALESCE(cost_input_tokens, 0))      AS input,
             SUM(COALESCE(cost_output_tokens, 0))     AS output,
             SUM(COALESCE(cost_cache_read_tokens, 0)) AS cache,
             COUNT(*)                                 AS runs
        FROM runs
       WHERE cost_input_tokens IS NOT NULL OR cost_output_tokens IS NOT NULL
       GROUP BY d, model`)
    .all() as 行[]

  let input = 0
  let output = 0
  let cacheRead = 0
  const 按天 = new Map<string, number>()
  const 按模型 = new Map<string, { tokens: number; runs: number }>()
  const 无主 = { runs: 0, tokens: 0 }

  for (const r of 行们) {
    const t = r.input + r.output
    if (r.model === null) {
      // **不摊进任何模型，也不进日历**：不知道是谁花的，就别画成谁的
      无主.runs += r.runs
      无主.tokens += t
      continue
    }
    input += r.input
    output += r.output
    cacheRead += r.cache
    按天.set(r.d, (按天.get(r.d) ?? 0) + t)
    const m = 按模型.get(r.model) ?? { tokens: 0, runs: 0 }
    按模型.set(r.model, { tokens: m.tokens + t, runs: m.runs + r.runs })
  }

  const daily = [...按天].map(([date, tokens]) => ({ date, tokens })).sort((a, b) => (a.date < b.date ? -1 : 1))
  const byModel = [...按模型]
    .map(([model, v]) => ({ model, tokens: v.tokens, runs: v.runs }))
    .sort((a, b) => b.tokens - a.tokens)
  const peak = daily.reduce<每日用量 | undefined>((最, d) => (最 && 最.tokens >= d.tokens ? 最 : d), undefined)

  return {
    total: input + output,
    input,
    output,
    cacheRead,
    daily,
    byModel,
    ...(peak ? { peak } : {}),
    activeDays: daily.length,
    streak: 算连续(daily.map((d) => d.date), 今天),
    unattributed: 无主,
  }
}

/**
 * 连续天数。
 *
 * `current` **必须截至今天**：昨天连了五天、今天没用，那句话应当是「0 天」
 * 而不是「5 天」——后者会让人以为自己还连着。
 * （截图里 Codex 那一格写的是「当前连续天数」，说的就是这件事。）
 */
export function 算连续(日期们: readonly string[], 今天: string): { current: number; longest: number } {
  if (日期们.length === 0) return { current: 0, longest: 0 }
  const 有 = new Set(日期们)
  let longest = 0
  let 跑 = 0
  const 排 = [...有].sort()
  let 上一天: string | undefined
  for (const d of 排) {
    跑 = 上一天 !== undefined && 前一天(d) === 上一天 ? 跑 + 1 : 1
    if (跑 > longest) longest = 跑
    上一天 = d
  }
  let current = 0
  let 游标 = 今天
  while (有.has(游标)) {
    current++
    游标 = 前一天(游标)
  }
  return { current, longest }
}

/** `YYYY-MM-DD` 的前一天。**按 UTC 算日期加减**——这里的串已经是纯日期，没有时区可言 */
function 前一天(d: string): string {
  const t = Date.parse(`${d}T00:00:00Z`)
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/**
 * 一个 `Date` 的**本地**日期串 `YYYY-MM-DD`。
 *
 * **不能用 `toISOString().slice(0,10)`**：那是 UTC 的日期，
 * 与 SQL 里 `date(…, 'localtime')` 切出来的不是同一天，
 * 于是「今天」会在下午之后对不上，连续天数跟着错一天。
 */
export function 本地日期(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
