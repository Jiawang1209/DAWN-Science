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
 * ## 这里**没有**每日预算那条进度条
 *
 * 做过一版，作者当天撤掉：*「不需要每日预算，因为不用 token，怎么干活呢，对不对」*。
 * 他是对的——**超了我们也不会拦**（拦住才是坏事），
 * 那条进度条于是只剩下让人焦虑这一个作用。
 * Codex 那条的分母是它的套餐额度，而我们用的是你自己的 key，
 * **没有额度这回事**：照抄一条分母是假的进度条，比不做更坏。
 *
 * ## 图为什么是手写的 SVG
 *
 * 两张图（日历、饼）加起来不到两百行，而一个图表库要带进来的是
 * 一整套自己的布局、主题与无障碍模型——**而这一屏的图都要跟着我们的令牌走**
 * （明暗、四档透明度）。这与 icons.tsx 那条「不取它的 path」是同一个判断。
 */
import { useEffect, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf, msgid, $lang } from "./i18n/index.js"
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
  activity: { chats: number; turns: number; toolCalls: number; distinctTools: number; failedTurns: number }
  topTools: { name: string; runs: number }[]
  byProject: { name: string; tokens: number; runs: number }[]
}

/**
 * 把一个 token 数写成人读得下去的样子。
 *
 * **两种语言都走 k / M / B**（2026-08-16 作者定的：
 * *「token 的单位其实应该是 k」*）。
 *
 * 上一版中文走的是「万 / 亿」。那是中文数字的正确读法，**但不是 token 的读法**：
 * 上下文窗口叫「128k」、价目表按「每百万 token」计——
 * **这一行的量纲跟着这个生态走，不跟着自然语言走**。
 * 写成「3144.7 万」，人还得在脑子里换算回 31M 才能跟模型的上下文上限比。
 *
 * 小数点后一位就够：**再多一位不会让人做出不同的决定**。
 */
export function 读数(n: number, _lang?: "zh" | "en"): string {
  if (n < 1000) return String(n)
  for (const d of [
    { 界: 1e9, 位: "B" },
    { 界: 1e6, 位: "M" },
    { 界: 1e3, 位: "k" },
  ]) {
    if (n >= d.界) {
      const v = n / d.界
      return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${d.位}`
    }
  }
  return String(n)
}

/**
 * 饼图与图例上显示的模型名：**去掉厂家那一段**
 * （2026-08-16 作者：*「饼图展示的时候，不需要提供运营商，直接显示模型就可以了」*）。
 *
 * 账本里存的是 `provider/model`——**那一段不是冗余**：两家可以供同一个模型名，
 * 而账要分得开。所以只在**显示**时去掉，且**去掉之后重名的那些留全名**：
 * 图例上出现两个一模一样的名字，比多几个字难受得多。
 */
export function 显示模型名(全名: string, 全部: readonly string[]): string {
  const 短 = (x: string) => x.slice(x.lastIndexOf("/") + 1)
  const 我 = 短(全名)
  const 重名 = 全部.filter((x) => 短(x) === 我).length > 1
  return 重名 ? 全名 : 我
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
  onReload,
}: {
  data: 用量数据 | undefined
  onReload: () => void
}) {
  const lang = useStore($lang)

  useEffect(() => {
    onReload()
    // 只在挂载时拉一次：这一屏不是实时看板，进来看到的就是进来那一刻的事实
  }, [onReload])

  if (!data) return <section className="settings-section usage"><p className="hint">{t("正在读用量…")}</p></section>

  const 今日 = data.daily.find((d) => d.date === 今天本地())?.tokens ?? 0
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

      {/* ── 日历 ─────────────────────────────────────────────── */}
      <UsageHeatmap daily={data.daily} lang={lang} />

      {/**
        * ── 一半饼图、一半排行（2026-08-16 作者要的）──────────────────
        *
        * 作者：*「饼图的位置，其实应该占据页面的一半……
        * 现在另外一面应该放置什么内容呢？」*
        *
        * 另一半放**按项目**。三个候选里选它，理由是它回答的问题最实在：
        * 「**哪个项目在烧 token**」——这是在项目里干活的人真会去做的判断，
        * 而「按模型」回答的是「哪个模型贵」，那件事你换模型时才关心。
        * （另两个候选：输入/输出构成、最近 14 天柱状图。前者的信息
        * 其实已经在下面那两栏里，后者与上面的日历重复。）
        *
        * **口径与饼图一致**（只算记了模型的回合），所以两边总数对得上——
        * 人一定会去加。
        */}
      <div className="usage-half">
        <UsagePie byModel={data.byModel} lang={lang} />
        <div className="usage-block">
          <h3 className="usage-block-title">{t("按项目")}</h3>
          {data.byProject.length === 0 ? (
            <p className="hint">{t("还没有记到任何一次内置对话的用量。跑一轮对话之后再来看。")}</p>
          ) : (
            <ul className="usage-rank">
              {data.byProject.map((p) => (
                <li
                  key={p.name}
                  /**
                   * 底衬用**背景渐变**画，不用另一个绝对定位的元素。
                   *
                   * 后者要靠 `z-index` 把文字压回上层，而**跨组件的层级
                   * 一律从 `tokens.css` 那把梯子取**（设计契约里那条扫描当场抓了我）。
                   * 一条底衬不值得在那把梯子上占一格——换成渐变，
                   * 层级问题根本不存在。**长度就是占比**，不用再读一遍百分数。
                   */
                  style={{
                    background: `linear-gradient(to right, var(--dawn-accent-soft) ${Math.max(2, (p.tokens / (data.byProject[0]?.tokens || 1)) * 100)}%, transparent 0)`,
                  }}
                >
                  <span className="usage-rank-name">{p.name}</span>
                  <span className="usage-rank-num">{数(p.tokens)}</span>
                  <span className="usage-rank-sub">{tf("{0} 回合", p.runs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/**
        * ── 活动洞察 / 最常用的工具（2026-08-16，形状学自作者给的截图）───
        *
        * **每一格都是账本里数出来的。** 这一屏一旦掺进一个「大概」，
        * 旁边那些真数字也跟着不可信了——所以这里没有「快速模式 92%」
        * 那种我们答不上来的东西，有几件就摆几件。
        */}
      <div className="usage-two">
        <div className="usage-block">
          <h3 className="usage-block-title">{t("活动洞察")}</h3>
          <ul className="usage-facts">
            {[
              { 名: t("对话总数"), 值: String(data.activity.chats) },
              { 名: t("回合总数"), 值: String(data.activity.turns) },
              { 名: t("工具调用次数"), 值: String(data.activity.toolCalls) },
              { 名: t("用过的工具种数"), 值: String(data.activity.distinctTools) },
              {
                名: t("平均每回合"),
                // **没有回合就写「—」**，不写 0：那是「还没跑过」，不是「每轮零个」
                值: data.activity.turns > 0 ? tf("{0} token", 数(Math.round(data.total / data.activity.turns))) : "—",
              },
              { 名: t("出错收场的回合"), 值: String(data.activity.failedTurns) },
            ].map((f) => (
              <li key={f.名}>
                <span className="usage-fact-name">{f.名}</span>
                <span className="usage-fact-value">{f.值}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="usage-block">
          <h3 className="usage-block-title">{t("最常用的工具")}</h3>
          {data.topTools.length === 0 ? (
            <p className="hint">{t("还没有调用过任何工具。")}</p>
          ) : (
            <ul className="usage-facts">
              {data.topTools.map((x) => (
                <li key={x.name}>
                  <span className="usage-fact-name">{x.name}</span>
                  <span className="usage-fact-value">{tf("{0} 次", x.runs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
 * 日历热力图。**一列一周、一行一天**（周日在最上面），铺满一整年。
 *
 * 2026-08-16 作者改的三件（照 Codex 那张）：
 * *「在 app 页面上平铺一下，并且显示一下月份呢？鼠标划过 tile 的时候，
 * 还可以看到每日的消耗。」*
 *
 * ## 为什么不是原生 `<title>`
 *
 * 第一版每格挂一个 `<title>`——那是浏览器的原生提示：**延迟约半秒、
 * 没有样式、暗色下还是白底**。本项目的设计契约为此禁掉了按钮上的 `title=`
 * （那条扫描现在还在），而这里等于从后门把它放了回来。
 * 所以换成自己画的浮层，`aria-label` 留给读屏——**两条路各走各的，
 * 而不是让一个东西同时敷衍两边**。
 *
 * ## 一年有 53 周，格子会很小
 *
 * 这是 Codex / GitHub 那张图的固有代价，换来的是**一眼看得到季节**。
 * 格子跟着容器宽度缩放（`viewBox` + `width: 100%`），
 * 所以窄面板上它整体变小，而不是被裁掉半年。
 */
export function UsageHeatmap({
  daily,
  lang,
}: {
  daily: { date: string; tokens: number }[]
  lang: "zh" | "en"
}) {
  const [停在, 设停在] = useState<{ x: number; y: number; 文: string } | undefined>(undefined)
  /**
   * 每日 / 每周 / 累计（2026-08-16 作者要的，形状学自他给的截图）。
   *
   * 三个视角回答的是三个问题，**不是同一张图的三种皮肤**：
   *   - **每日**：哪天在干活（一格一天）
   *   - **每周**：这一周总共花了多少（一格一周——日粒度在一年跨度上太碎）
   *   - **累计**：到这一周为止一共花了多少（**它是单调不减的**，
   *     看的是「涨得快不快」，而不是「哪天忙」）
   */
  const [视角, 设视角] = useState<"每日" | "每周" | "累计">("每日")
  const 周数 = 53
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
  const 步 = 格 + 隙
  /** 每周 / 累计是一行；每日是七行 */
  const 行数 = 视角 === "每日" ? 7 : 1
  const 网格高 = 行数 * 步
  const 标高 = 16
  const 宽 = 周数 * 步

  /**
   * 三个视角各自算出「要画哪些格子」。
   *
   * **一处算完，渲染只管画**——上一版把「未来不画」「分档」「文案」
   * 混在 JSX 的双重 map 里，加一个视角就得抄一遍。
   */
  const 格子们: { key: string; x: number; y: number; 档: number; 文: string }[] = []
  if (视角 === "每日") {
    const 最大 = Math.max(1, ...daily.map((d) => d.tokens))
    for (const [i, 周] of 列.entries()) {
      for (const [j, 格子] of 周.entries()) {
        // **未来的日子不画**：这一周还没过完，剩下几格是空的，不是「没用」
        if (格子.date > 今天) continue
        格子们.push({
          key: 格子.date,
          x: i * 步,
          y: j * 步,
          档: 格子.tokens === 0 ? 0 : Math.min(4, Math.ceil((格子.tokens / 最大) * 4)),
          文:
            格子.tokens === 0
              ? tf("{0} 没有用量", 读日期(格子.date, lang))
              : tf("{0} 使用了 {1} 个 Token", 读日期(格子.date, lang), 读数(格子.tokens)),
        })
      }
    }
  } else {
    const 周总 = 列.map((周) => ({
      起: 周[0]!.date,
      末: 周[6]!.date,
      量: 周.filter((g) => g.date <= 今天).reduce((a, b) => a + b.tokens, 0),
    }))
    let 累 = 0
    const 值们 = 周总.map((w) => {
      累 += w.量
      return 视角 === "累计" ? 累 : w.量
    })
    const 最大 = Math.max(1, ...值们)
    for (const [i, w] of 周总.entries()) {
      if (w.起 > 今天) continue
      const v = 值们[i]!
      格子们.push({
        key: w.起,
        x: i * 步,
        y: 0,
        // **累计那一档从 1 起跳**：它是单调不减的，画成空白会让人以为那几周没数据
        档: v === 0 ? 0 : Math.max(视角 === "累计" ? 1 : 0, Math.min(4, Math.ceil((v / 最大) * 4))),
        文:
          视角 === "累计"
            ? tf("到 {0} 为止一共 {1} 个 Token", 读日期(w.末, lang), 读数(v))
            : tf("{0} 那一周使用了 {1} 个 Token", 读日期(w.起, lang), 读数(v)),
      })
    }
  }

  /**
   * 月份标在**每个月第一次出现的那一列**上。
   *
   * 判据是「这一列里有没有 1 号」——按「列里第一天的月份变了」来判会漏：
   * 一个月的 1 号落在周中时，那一列的第一天还属于上个月。
   */
  const 月标: { x: number; 文: string }[] = []
  for (const [i, 周] of 列.entries()) {
    const 有一号 = 周.find((g) => g.date.endsWith("-01") && g.date <= 今天)
    if (!有一号) continue
    const m = Number(有一号.date.split("-")[1])
    月标.push({ x: i * 步, 文: lang === "zh" ? `${m}月` : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]! })
  }

  return (
    <div className="usage-block">
      <div className="usage-block-head">
        <h3 className="usage-block-title">{t("Token 活动")}</h3>
        <div className="usage-seg" role="group" aria-label={t("Token 活动")}>
          {/* **`msgid()` 不能省**：`t(变量)` 那一支扫描看不见，
              en.ts 里那三条会被判成孤儿（当场就被抓了） */}
          {([msgid("每日"), msgid("每周"), msgid("累计")] as const).map((v) => (
            <Button
              key={v}
              variant="text"
              size="inline"
              className={`usage-seg-btn${视角 === v ? " current" : ""}`}
              aria-pressed={视角 === v}
              onClick={() => 设视角(v)}
            >
              {t(v)}
            </Button>
          ))}
        </div>
      </div>
      <div className="usage-heat-wrap">
        <svg
          className="usage-heat"
          viewBox={`0 0 ${宽} ${网格高 + 标高}`}
          role="img"
          aria-label={t("Token 活动日历")}
          onMouseLeave={() => 设停在(undefined)}
        >
          {格子们.map((g) => (
            <rect
              key={g.key}
              x={g.x}
              y={g.y}
              width={格}
              height={格}
              rx={2.5}
              className={`usage-cell l${g.档}`}
              role="img"
              aria-label={g.文}
              onMouseEnter={(e) => {
                const r = (e.target as SVGRectElement).getBoundingClientRect()
                设停在({ x: r.left + r.width / 2, y: r.top, 文: g.文 })
              }}
            />
          ))}
          {月标.map((m) => (
            <text key={m.文 + m.x} x={m.x} y={网格高 + 11} className="usage-month">
              {m.文}
            </text>
          ))}
        </svg>
        {/**
          * 浮层。**`position: fixed` + `pointer-events: none`**：
          * 跟着鼠标走却永远不挡住下一格——挡住的话，横着扫过一行会一格一格地闪。
          */}
        {停在 ? (
          <div className="usage-tip" style={{ left: `${停在.x}px`, top: `${停在.y}px` }} role="presentation">
            {停在.文}
          </div>
        ) : null}
      </div>
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
  const [停在, 设停在] = useState<{ x: number; y: number; 文: string } | undefined>(undefined)
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

  // **大一点**（2026-08-16 作者要的）：上一版 60，画出来只有 140px 见方
  const R = 96
  let 角 = -Math.PI / 2
  const 全部名 = byModel.map((m) => m.model)
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
      <div className="usage-pie-col" style={{ position: "relative" }}>
        <svg
          className="usage-pie"
          viewBox="-104 -104 208 208"
          role="img"
          aria-label={t("按模型的用量占比")}
          onMouseLeave={() => 设停在(undefined)}
        >
          {扇.map((x) => {
            const 文 = `${显示模型名(x.m.model, 全部名)} · ${读数(x.m.tokens, lang)} · ${Math.round((x.m.tokens / 总) * 100)}%`
            return (
              <path
                key={x.m.model}
                d={x.d}
                className={`usage-slice c${x.i % 6}`}
                role="img"
                aria-label={文}
                onMouseMove={(e) => 设停在({ x: e.clientX, y: e.clientY, 文 })}
              />
            )
          })}
        </svg>
        {/* 与日历那张同一颗浮层——**同一件事只该有一个样子** */}
        {停在 ? (
          <div className="usage-tip" style={{ left: `${停在.x}px`, top: `${停在.y}px` }} role="presentation">
            {停在.文}
          </div>
        ) : null}
        {/**
          * 图例在**饼图下面**，且**排成对齐的四列**（2026-08-16 作者要的：
          * *「图例的位置应该在饼图的下面，模型名字应该对齐，
          * 消耗的 token 应该对齐」*）。
          *
          * 用网格而不是 flex：**只有网格能让几行之间的列对齐**——
          * flex 是一行一行各自排的，名字一长，右边那一列就参差不齐。
          * 数字列一律 `tabular-nums`，否则同宽的数字也会因为字形宽度不同而错位。
          */}
        <ul className="usage-legend-list">
          {byModel.map((m, i) => (
            <li key={m.model}>
              <span className={`usage-dot c${i % 6}`} aria-hidden="true" />
              <span className="usage-legend-name">{显示模型名(m.model, 全部名)}</span>
              <span className="usage-legend-num">{读数(m.tokens, lang)}</span>
              <span className="usage-legend-pct">{Math.round((m.tokens / 总) * 100)}%</span>
              <span className="usage-legend-runs">{tf("{0} 回合", m.runs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
