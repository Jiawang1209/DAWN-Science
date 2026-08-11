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
  if (秒 < 10) return `${去尾(秒)} 秒`
  if (秒 < 60) return `${Math.floor(秒)} 秒`
  const 分 = Math.floor(秒 / 60)
  if (分 < 60) return `${分} 分 ${String(Math.floor(秒 % 60)).padStart(2, "0")} 秒`
  return `${Math.floor(分 / 60)} 小时 ${String(分 % 60).padStart(2, "0")} 分`
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

