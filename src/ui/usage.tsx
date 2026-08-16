/**
 * 「设置 → 用量」（S21，2026-08-16）。
 *
 * 作者：*「统计我们 dawn-science 里面消耗的所有的 token，并且基于不同的模型
 * 进行统计，我其实还想做成 codex 这种可以直接在用量里面，设置一个每天的进度条…
 * 此外，再基于不同模型消耗的 token 绘制一个饼图。」*
 *
 * ## 四块，看的是同一份事实
 *
 * 统计条、今日进度条、日历、饼图**都来自一次 `getUsage`**。
 * 分四次查的话，它们会在同一屏上互相矛盾（两次查询之间可能又跑了一轮）。
 *
 * ## 三句必须说出口的话（规格 7.5）
 *
 * 1. **缓存读不在总数里**——各家对它的含义不一样，合并就是重复计。
 * 2. **有一些回合不知道是谁花的**（外部 CLI、本版之前的历史），单列，不摊。
 * 3. **每日预算是你自己定的**，不是平台给的额度。Codex 那条进度条的分母
 *    是它的套餐，我们这边用的是你自己的 key，按量付费——**没有额度这回事**。
 *    不说清楚的话，这条进度条会被读成「我还剩多少可以用」。
 *
 * ## 图为什么是手写的 SVG
 *
 * 三张图（进度条、日历、饼）加起来不到两百行，而一个图表库要带进来的是
 * 一整套自己的布局、主题与无障碍模型——**而这一屏的图都要跟着我们的令牌走**
 * （明暗、四档透明度）。这与 icons.tsx 那条「不取它的 path」是同一个判断。
 */
import { useEffect, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf, $lang } from "./i18n/index.js"
import { useStore } from "@nanostores/react"

export interface 用量数据 {
  total: number
  input: number
  output: number
  cacheRead: number
  daily: { date: string; tokens: number }[]
  byModel: { model: string; tokens: number; runs: number }[]
  peak?: { date: string; tokens: number }
  activeDays: number
  streak: { current: number; longest: number }
  unattributed: { runs: number; tokens: number }
  dailyBudget?: number
}

/**
 * 把一个大数写成人读得下去的样子。
 *
 * 中文走**万 / 亿**，英文走 **K / M / B**——这不是同一套进位，
 * 「3144.7万」翻成「31.4M」才对，直译成「31447 thousand」没人读得下去。
 */
export function 读数(n: number, lang: "zh" | "en"): string {
  if (n < 1000) return String(n)
  const 档 =
    lang === "zh"
      ? [
          { 界: 1e8, 位: "亿" },
          { 界: 1e4, 位: "万" },
        ]
      : [
          { 界: 1e9, 位: "B" },
          { 界: 1e6, 位: "M" },
          { 界: 1e3, 位: "K" },
        ]
  for (const d of 档) {
    if (n >= d.界) {
      const v = n / d.界
      // 小数点后一位就够——**再多一位不会让人做出不同的决定**
      return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${d.位}`
    }
  }
  return String(n)
}

/** `YYYY-MM-DD` → 「8月14日」/「Aug 14」 */
function 读日期(d: string, lang: "zh" | "en"): string {
  const [, m, day] = d.split("-")
  const mm = Number(m)
  if (lang === "zh") return `${mm}月${Number(day)}日`
  const 月名 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${月名[mm - 1]} ${Number(day)}`
}

/** 本地「今天」。**与后端那一侧同一个算法**——用 UTC 切会在下午之后差一天 */
function 今天本地(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function 前推(d: string, 天: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) - 天 * 86_400_000).toISOString().slice(0, 10)
}

export function UsagePanel({
  data,
  onSetBudget,
  onReload,
}: {
  data: 用量数据 | undefined
  onSetBudget: (tokens: number) => void
  onReload: () => void
}) {
  const lang = useStore($lang)
  const [改预算中, 设改预算中] = useState(false)
  const [草稿, 设草稿] = useState("")

  useEffect(() => {
    onReload()
    // 只在挂载时拉一次：这一屏不是实时看板，进来看到的就是进来那一刻的事实
  }, [onReload])

  if (!data) return <section className="settings-section usage"><p className="hint">{t("正在读用量…")}</p></section>

  const 今天 = 今天本地()
  const 今日 = data.daily.find((d) => d.date === 今天)?.tokens ?? 0
  const 数 = (n: number) => 读数(n, lang)

  return (
    <section className="settings-section usage">
      {/* ── 统计条 ───────────────────────────────────────────── */}
      <div className="usage-stats">
        {[
          { 值: 数(data.total), 名: t("累计 Token") },
          { 值: 数(今日), 名: t("今天") },
          { 值: data.peak ? 数(data.peak.tokens) : "—", 名: t("单日峰值") },
          { 值: tf("{0} 天", data.streak.current), 名: t("当前连续天数") },
          { 值: tf("{0} 天", data.streak.longest), 名: t("最长连续天数") },
        ].map((s) => (
          <div className="usage-stat" key={s.名}>
            <div className="usage-stat-value">{s.值}</div>
            <div className="usage-stat-label">{s.名}</div>
          </div>
        ))}
      </div>

      {/* ── 今日进度条 ─────────────────────────────────────────── */}
      <div className="usage-budget">
        <div className="usage-budget-head">
          <span className="usage-budget-title">{t("今日用量")}</span>
          {data.dailyBudget ? (
            <span className="usage-budget-num">
              {数(今日)} / {数(data.dailyBudget)}
            </span>
          ) : null}
          <Button
            variant="text"
            size="inline"
            className="usage-budget-edit"
            onClick={() => {
              设草稿(data.dailyBudget ? String(data.dailyBudget) : "")
              设改预算中((v) => !v)
            }}
          >
            {data.dailyBudget ? t("改预算") : t("设一个每日预算")}
          </Button>
        </div>
        {data.dailyBudget ? (
          <>
            <div
              className="usage-bar"
              role="progressbar"
              aria-valuenow={今日}
              aria-valuemin={0}
              aria-valuemax={data.dailyBudget}
              aria-label={t("今日用量")}
            >
              <div
                className={`usage-bar-fill${今日 >= data.dailyBudget ? " over" : ""}`}
                style={{ width: `${Math.min(100, (今日 / data.dailyBudget) * 100)}%` }}
              />
            </div>
            {/**
              * **这句话不能省。** Codex 那条进度条的分母是它的套餐额度；
              * 我们这边没有额度——用的是你自己的 key，按量付费。
              * 不写清楚，这条进度条会被读成「我还剩多少可以用」。
              */}
            <p className="caveat">{t("这个上限是你自己定的，不是平台额度——超了不会被拦住。")}</p>
          </>
        ) : (
          <p className="hint">{t("还没有每日预算。定一个之后，这里会画一条今天用了多少的进度条。")}</p>
        )}
        {改预算中 ? (
          <form
            className="usage-budget-form"
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(草稿.replace(/[,，\s]/g, ""))
              if (!Number.isFinite(n) || n < 0) return
              onSetBudget(Math.floor(n))
              设改预算中(false)
            }}
          >
            <label className="field">
              <span className="field-label">{t("每天多少 token")}</span>
              <input
                className="control"
                autoFocus
                value={草稿}
                onChange={(e) => 设草稿(e.target.value)}
                placeholder="1000000"
                inputMode="numeric"
              />
            </label>
            <Button type="submit" variant="primary" size="sm">
              {t("保存")}
            </Button>
            {/* **0 是取消，说出来**——不然人得猜怎么把它去掉 */}
            <span className="hint">{t("填 0 取消预算")}</span>
          </form>
        ) : null}
      </div>

      {/* ── 日历 ─────────────────────────────────────────────── */}
      <UsageHeatmap daily={data.daily} lang={lang} />

      {/* ── 饼图 ─────────────────────────────────────────────── */}
      <UsagePie byModel={data.byModel} lang={lang} />

      {/**
        * **两句拿不准的话，摆在最后，但必须摆。**
        *
        * 一个不说这两句的用量屏，会让人以为「这就是全部」——
        * 而它其实是「我们统计得到的那部分」。
        */}
      <div className="usage-notes">
        {data.cacheRead > 0 ? (
          <p className="caveat">
            {tf(
              "另有 {0} 个缓存读 token 没有算进总数：各家 provider 对它的含义不一样，合进去会重复计。",
              数(data.cacheRead),
            )}
          </p>
        ) : null}
        {data.unattributed.runs > 0 ? (
          <p className="caveat">
            {tf(
              "另有 {0} 个回合（约 {1} token）不知道是哪个模型花的——外部 CLI 的模型由它自己管，本版之前的历史回合也没记。它们不计入上面任何一处。",
              data.unattributed.runs,
              数(data.unattributed.tokens),
            )}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * 日历热力图。**一列一周、一行一天**（周日在最上面），最近 26 周。
 *
 * 颜色只有四档 + 空：**再多档人也分不出来**，而分不出来的图等于骗人。
 * 每一格都带 `<title>`，鼠标停上去说得出「哪天、多少」——
 * 一张只有颜色没有数字的图，只能告诉人「有活动」，那不值得占这么大地方。
 */
export function UsageHeatmap({
  daily,
  lang,
}: {
  daily: { date: string; tokens: number }[]
  lang: "zh" | "en"
}) {
  const 周数 = 26
  const 今天 = 今天本地()
  const 表 = new Map(daily.map((d) => [d.date, d.tokens]))
  const 最大 = Math.max(1, ...daily.map((d) => d.tokens))

  // 从今天所在那一周的周六往回数
  const 今天周几 = new Date(`${今天}T00:00:00Z`).getUTCDay()
  const 末尾 = 前推(今天, -(6 - 今天周几))
  const 列: { date: string; tokens: number }[][] = []
  for (let w = 周数 - 1; w >= 0; w--) {
    const 一列: { date: string; tokens: number }[] = []
    for (let d = 6; d >= 0; d--) {
      const 日 = 前推(末尾, w * 7 + d)
      一列.unshift({ date: 日, tokens: 表.get(日) ?? 0 })
    }
    列.push(一列)
  }

  const 格 = 11
  const 隙 = 3
  const 宽 = 周数 * (格 + 隙)
  const 高 = 7 * (格 + 隙)

  return (
    <div className="usage-block">
      <h3 className="usage-block-title">{t("Token 活动")}</h3>
      <svg
        className="usage-heat"
        viewBox={`0 0 ${宽} ${高}`}
        role="img"
        aria-label={t("Token 活动日历")}
      >
        {列.map((周, i) =>
          周.map((格子, j) => {
            // **未来的日子不画**：这一周还没过完，剩下几格是空的，不是「没用」
            if (格子.date > 今天) return null
            const 档 = 格子.tokens === 0 ? 0 : Math.min(4, Math.ceil((格子.tokens / 最大) * 4))
            return (
              <rect
                key={格子.date}
                x={i * (格 + 隙)}
                y={j * (格 + 隙)}
                width={格}
                height={格}
                rx={2.5}
                className={`usage-cell l${档}`}
              >
                <title>
                  {格子.tokens === 0
                    ? tf("{0} 没有用量", 读日期(格子.date, lang))
                    : tf("{0} 使用了 {1} 个 Token", 读日期(格子.date, lang), 读数(格子.tokens, lang))}
                </title>
              </rect>
            )
          }),
        )}
      </svg>
      <div className="usage-legend">
        <span className="hint">{t("少")}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`usage-swatch l${l}`} aria-hidden="true" />
        ))}
        <span className="hint">{t("多")}</span>
      </div>
    </div>
  )
}

/**
 * 按模型的饼图。
 *
 * **图例里带数字**：一块扇形看不出「差 3% 还是差 30%」，
 * 而人要做的判断（哪个模型在烧钱）恰恰要那个数。
 */
export function UsagePie({
  byModel,
  lang,
}: {
  byModel: { model: string; tokens: number; runs: number }[]
  lang: "zh" | "en"
}) {
  const 总 = byModel.reduce((a, b) => a + b.tokens, 0)
  if (总 === 0) {
    return (
      <div className="usage-block">
        <h3 className="usage-block-title">{t("按模型")}</h3>
        {/* **空态说清是「还没有」而不是「没有这个功能」** */}
        <p className="hint">{t("还没有记到任何一次内置对话的用量。跑一轮对话之后再来看。")}</p>
      </div>
    )
  }

  const R = 60
  let 角 = -Math.PI / 2
  const 扇 = byModel.map((m, i) => {
    const 弧 = (m.tokens / 总) * Math.PI * 2
    const a0 = 角
    const a1 = 角 + 弧
    角 = a1
    const 大 = 弧 > Math.PI ? 1 : 0
    // 只有一块时画整圆——`A` 弧在起终点重合时什么都画不出来
    const d =
      byModel.length === 1
        ? `M ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 Z`
        : `M 0 0 L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 ${大} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`
    return { d, m, i }
  })

  return (
    <div className="usage-block">
      <h3 className="usage-block-title">{t("按模型")}</h3>
      <div className="usage-pie-row">
        <svg className="usage-pie" viewBox="-70 -70 140 140" role="img" aria-label={t("按模型的用量占比")}>
          {扇.map((s) => (
            <path key={s.m.model} d={s.d} className={`usage-slice c${s.i % 6}`}>
              <title>
                {tf("{0}：{1} 个 Token", s.m.model, 读数(s.m.tokens, lang))}
              </title>
            </path>
          ))}
        </svg>
        <ul className="usage-legend-list">
          {byModel.map((m, i) => (
            <li key={m.model}>
              <span className={`usage-dot c${i % 6}`} aria-hidden="true" />
              <span className="usage-legend-name">{m.model}</span>
              <span className="usage-legend-num">
                {读数(m.tokens, lang)}
                <span className="hint">
                  {" "}
                  · {Math.round((m.tokens / 总) * 100)}% · {tf("{0} 回合", m.runs)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
