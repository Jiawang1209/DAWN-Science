import { t, tf } from "./i18n/index.js"
/**
 * 界面上的数字怎么写（2026-08-11）。
 *
 * 两件事：**token 数用 k**，**时长按量级换写法**。
 */

/**
 * token 数。
 *
 * 作者：*「token 的消耗，变换一下单位 k tokens，这样方便统计和查看。」*
 *
 * ## 这条推翻了我之前写下的一句话
 *
 * 原来的注释是：*「**不缩写成 1.2k**——token 数是要拿来对账的」*。
 * 那句话只对了一半：**要对账的是成本，不是每一句话花了多少**。
 * 而一屏对话里挤着 `128,431`、`1,024`、`96` 这样三个宽度不一的数，
 * 恰恰是最难扫的——人想知道的是量级，不是个位数。
 *
 * 所以规则是**按量级换写法，而不是一律缩写**：
 *   - 1000 以下：**原样**。`96` 就是 96，写成 `0.1k` 是把已知的精度扔掉
 *   - 1000 起：`12.3k`（整千不拖小数点，`12k` 不写成 `12.0k`）
 *   - 一百万起：`1.25M`
 *
 * **不四舍五入到看不出差别的程度**：`12.3k` 与 `12.4k` 仍然分得开，
 * 而这正是「方便统计和查看」要的那种分得开。
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const 负 = n < 0 ? "-" : ""
  const v = Math.abs(n)
  if (v < 1000) return `${负}${v}`
  if (v < 1_000_000) return `${负}${去尾(v / 1000)}k`
  return `${负}${(v / 1_000_000).toFixed(2)}M`
}

/** `12.0` → `12`，`12.34` → `12.3`。**整千不拖一个没有信息量的小数点** */
function 去尾(x: number): string {
  const s = x.toFixed(1)
  return s.endsWith(".0") ? s.slice(0, -2) : s
}

/**
 * 一段时长（毫秒）读出来是多久。
 *
 * ## 它存在的理由是「不设默认超时」
 *
 * 作者定下 bash 不设默认超时——远端一条 `bwa index` 跑二十分钟是正常的。
 * 代价是：**「还在跑」与「卡死了」在界面上长得一模一样**，
 * 而唯一能把两者分开的信息就是这个数。所以它必须好读到一眼能判断。
 *
 * 按量级换写法，理由与 `formatTokens` 同一条：**人要的是量级**。
 *   - 一分钟以内：`8 秒`、`0.4 秒`（十秒以内留一位小数，两次运行的差别看得见）
 *   - 一小时以内：`3 分 05 秒`（**秒补零**，否则 `3 分 5 秒` 与 `3 分 50 秒` 一扫而过很像）
 *   - 一小时以上：`1 小时 12 分`
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const 秒 = ms / 1000
  if (秒 < 10) return tf("{0} 秒", 去尾(秒))
  if (秒 < 60) return tf("{0} 秒", Math.floor(秒))
  const 分 = Math.floor(秒 / 60)
  if (分 < 60) return tf("{0} 分 {1} 秒", 分, String(Math.floor(秒 % 60)).padStart(2, "0"))
  return tf("{0} 小时 {1} 分", Math.floor(分 / 60), String(分 % 60).padStart(2, "0"))
}

/**
 * 路径写短一点：家目录写成 `~`。
 *
 * **只在开头那一段替换**，不做别的省略——中间打点的路径
 * （`/home/…/data`）会让人认不出自己在哪，而认出自己在哪正是它的全部用处。
 */
export function 短路径(p: string, home?: string): string {
  const h = home ?? p.match(/^\/(?:home|Users)\/[^/]+/)?.[0]
  if (h && (p === h || p.startsWith(`${h}/`))) return `~${p.slice(h.length)}`
  return p
}

/**
 * 路径的最后一段，用作项目名（T3-a）。
 *
 * **末尾的斜杠不算一段**：`~/work/rna-seq/` 与 `~/work/rna-seq` 是同一个地方，
 * 而 `split("/").pop()` 对前者给的是空串——那会画出一条没有名字的项目行。
 *
 * 整条路径本身（`/`）退回写成 `/`：**没有名字也好过空白**。
 */
export function 基名(p: string): string {
  const 段 = p.split("/").filter(Boolean)
  return 段.length > 0 ? 段[段.length - 1]! : "/"
}


/**
 * **距离上一次多久了**（2026-08-19）。
 *
 * 作者：*「我们现在的会话都是 alive 啥的，其实我们可以学习一下 Hermes，
 * 距离上一次对话是多久了。」*（并给了 Hermes 那一列的截图：`14h` `23h` `2d` `7d` `9d`）
 *
 * ## 为什么是相对时间，不是时刻
 *
 * 侧栏那一列回答的问题是**「这段对话我搁下多久了」**，不是「它发生在几点」。
 * 后者要人自己拿今天几号去减——而那正是我们让机器干的事。
 *
 * ## 粒度：**只给一个数量级，不给两段**
 *
 * 不写「1 天 3 小时」。那一列只有四十来像素，而且**两段精度在这里没有决策价值**：
 * 你要的是「今天动过 / 前几天 / 上个月」这个量级。
 * Hermes 那一列也是一个数一个单位。
 *
 * ## 边界怎么定
 *
 * - **不到一分钟写「刚刚」**，不写 `0m`——`0m` 读起来像「零分钟」，是个怪值。
 * - 小时进位用 **60 分钟**、天进位用 **24 小时**，都是**向下取整**：
 *   跑了 90 分钟写 `1h` 而不是 `2h`。**向上取整会让「刚过一小时」显示成两小时**，
 *   那是往大了说，而这一列往大了说就等于劝人放弃这段对话。
 * - 超过 99 天写 `99d+`。**不静默截断**：那个 `+` 就是「还不止」。
 *   不换成「3 个月」是因为月长不齐，而这一列不值得引入一套历法。
 *
 * @param 现在 由调用方给，**不在函数里读时钟**——读时钟的纯函数没法测。
 */
export function 多久之前(iso: string, 现在: number): string {
  const 那一刻 = new Date(iso).getTime()
  // **认不出来的时间要说出来**，不是显示成「刚刚」——那是编造
  if (Number.isNaN(那一刻)) return t("时间不明")
  const 毫秒 = 现在 - 那一刻
  /**
   * **未来的时刻也写「刚刚」**。它只可能来自时钟回拨或跨时区的记录，
   * 而写成「-3h」除了让人怀疑程序坏了之外没有任何用。
   */
  if (毫秒 < 60_000) return t("刚刚")
  const 分 = Math.floor(毫秒 / 60_000)
  if (分 < 60) return `${分}m`
  const 时 = Math.floor(分 / 60)
  if (时 < 24) return `${时}h`
  const 天 = Math.floor(时 / 24)
  return 天 > 99 ? "99d+" : `${天}d`
}

/**
 * 一条模型选项**该把哪个词摆在前面**（2026-08-19）。
 *
 * 作者：*「我要我选择的时候，直接是 Opus4.6 而不是 Default (recommended)。
 * 你可以在 Opus4.6 后面显示 Default (recommended)，显示 Most capable for
 * complex work，但是不要在选择的地方，选择 Default (recommended)。」*
 *
 * ## 两台真适配器的约定不一样——这条规则是量出来的，不是猜的
 *
 * ```
 * codex-acp 1.1.9
 *   name: "GPT-5.6-Sol (low)"           ← 本来就是具体模型
 *   description: "Latest frontier agentic coding model. Fast responses…"
 *
 * claude-code-acp 0.16.2
 *   name: "Default (recommended)"        ← 是个角色名，不是模型
 *   description: "Opus 4.6 · Most capable for complex work"
 *                 ↑ 具体模型藏在这儿
 * ```
 *
 * 所以：**说明里带 `·` 时，把 `·` 前面那一段提到前面**，
 * 原来的 `name` 与后半句退到第二行。codex 那台没有 `·`，**原样不动**。
 *
 * ## 为什么敢解析别人的自由文本
 *
 * 我一开始拒绝过这件事（「人家改一次排版我们就开始胡说」），作者驳回了，
 * 而他是对的：**「Default (recommended)」在选择的地方等于什么都没说**。
 *
 * 让步的前提是**这条解析只会退化、不会胡说**：
 *   - 没有 `·` → 原样（codex 全部走这条）；
 *   - 提出来的那一段是空的、或长得不像一个名字（>40 字）→ 原样；
 *   - 提出来的与 `name` 一样 → 原样（没有多说任何东西，就别多摆一行）。
 *
 * 也就是说，**万一哪天他们改了排版，最坏的结果是回到今天的样子**，
 * 而不是屏幕上出现一句被切坏的话。
 */
export function 拆模型名(
  name: string,
  description?: string,
): { 主: string; 次?: string } {
  const 说 = description?.trim()
  if (!说) return { 主: name }
  const i = 说.indexOf("·")
  if (i < 0) return { 主: name, 次: 说 }
  const 前 = 说.slice(0, i).trim()
  const 后 = 说.slice(i + 1).trim()
  // **不像一个名字就别提**：空的、或者长得像一句话
  if (!前 || 前.length > 40 || 前 === name) return { 主: name, 次: 说 }
  const 次 = [name, 后].filter(Boolean).join(" · ")
  return { 主: 前, ...(次 ? { 次 } : {}) }
}

/**
 * **正规的年月日时间**（2026-08-20）：`2026-08-20 09:41`，本地时区。
 *
 * 文件树那一列起初写的是相对时间（`刚刚 / 3m / 2h`），作者当天改了主意：
 * *「时间戳不需要 刚刚 / 3m / 2h 这种形式，直接就是正规的年月日时间就可以了。」*
 * 相对时间回答的是「多久前」，而他要的是「哪一天几点生成的」——
 * 一批结果隔几天再看，`5d` 还得心算。
 *
 * 不带秒：一列全是 `:07`、`:23` 只是噪声。**不用 `toLocaleString`**——
 * 它的格式跟着系统语言走，同一列会在不同机器上长得不一样，而且不好测。
 */
export function 年月日时分(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return t("时间不明")
  const 两位 = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${两位(d.getMonth() + 1)}-${两位(d.getDate())} ${两位(d.getHours())}:${两位(d.getMinutes())}`
}
