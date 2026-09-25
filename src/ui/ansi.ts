/**
 * ANSI SGR 颜色 → 带样式的片段（2026-09-25，作者：「中断了之后，会出现报错，这个报错能否折叠起来」）。
 *
 * IPython / IRkernel 的 traceback 自带终端颜色码（`ESC[0;31m`、`ESC[38;5;124m`）。
 * `outputs.ts` 说好了「带 ANSI 转义，渲染时再处理」——此前渲染层从没处理，
 * ESC 本身不可见，于是整屏只剩 `[0;31m` 这种残渣。
 *
 * **这里不是终端模拟器**（Rho 明令禁止那个）：只认 SGR 的前景 / 背景 / 粗体 / 复位，
 * 其余转义（光标移动、清屏、OSC 标题……）**一律吞掉，绝不当文字显示**。
 *
 * **颜色不落成色值，落成类名**：`red` → `.ansi-fg-red` → `var(--dawn-danger)`。
 * 这样明暗两套、换主题色都自动跟着走，且 styles.css 不出现裸色值（设计契约）。
 * 256 色 / 真彩色按色相归到同一组名字里——终端作者挑的是「偏红」「偏绿」，
 * 不是某个精确的 RGB；照抄精确值在我们的底色上多半不可读。
 *
 * 依赖决策：**不引库**（ansi-to-html / anser 之类）。那些库产出 HTML 字符串或内联色值，
 * 前者要 `dangerouslySetInnerHTML`（内核输出直通 DOM，见 RichOutput 的理由），
 * 后者绕过令牌。我们要的子集百来行就写完，且可以完整测到。
 */

/** 能落成类名的颜色。黑 / 白不在里面：它们在明暗两种底色上都等于「默认前景」 */
export type Ansi色 = "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "gray"

export interface Ansi片段 {
  text: string
  fg?: Ansi色
  bg?: Ansi色
  bold?: true
}

/** 30–37 / 40–47 的顺序。`undefined` = 黑、白：交给默认前景 */
const 基本八色: readonly (Ansi色 | undefined)[] = [
  undefined, // black
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  undefined, // white
]
/** 90–97：亮色。亮黑是终端里的「灰」——IPython 用它画次要信息 */
const 亮八色: readonly (Ansi色 | undefined)[] = ["gray", ...基本八色.slice(1)]

/** 一个 RGB 按色相归类。饱和度低的是灰 / 黑 / 白 */
function 归类(r: number, g: number, b: number): Ansi色 | undefined {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0 || (max - min) / max < 0.25) {
    if (max >= 200) return undefined // 白 → 默认前景
    if (max < 40) return undefined // 黑 → 默认前景
    return "gray"
  }
  const d = max - min
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 20 || h >= 340) return "red"
  if (h < 70) return "yellow"
  if (h < 160) return "green"
  if (h < 200) return "cyan"
  if (h < 260) return "blue"
  return "magenta"
}

const 立方档 = [0, 95, 135, 175, 215, 255]

/** xterm 256 色表里的第 n 个 */
function 色256(n: number): Ansi色 | undefined {
  if (n < 0 || n > 255 || !Number.isInteger(n)) return undefined
  if (n < 8) return 基本八色[n]
  if (n < 16) return 亮八色[n - 8]
  if (n < 232) {
    const i = n - 16
    return 归类(立方档[Math.floor(i / 36)]!, 立方档[Math.floor(i / 6) % 6]!, 立方档[i % 6]!)
  }
  const v = 8 + (n - 232) * 10
  return 归类(v, v, v)
}

/**
 * 一切 ESC 起头的转义：
 *   CSI  `ESC [ 参数 中间 终止`   —— 终止符 `m` 才是 SGR，其余吞掉
 *   OSC  `ESC ] … (BEL | ESC \)` —— 终端标题 / 超链接，吞掉
 *   其余 `ESC X` 两字节序列       —— 字符集切换之类，吞掉
 * 也认 8 位 CSI（`\x9b`）。
 *
 * 两种残缺（2026-09-25 审查跟进，规格 7.5「不静默丢输出」）：
 * - **OSC 必须见到终止符**（BEL 或 `ESC \`），且正文不跨行。没终止的 `ESC ]` 落到最后一支，
 *   **只丢这两个字节**，后面的字照常显示。另一个选项是「吞到行尾」——它会连同行里的真输出一起吞，
 *   而残留的 `0;title` 至少看得见、能判断；少丢字的那一边赢。
 *   此前终止符可选，一个孤立的 `ESC ]` 能把后面整段输出吞到下一个 ESC 或全文结尾。
 * - **文本末尾半截的 CSI**（`ESC[0;3`，clamp 或一次 iopub flush 恰好切在转义中间）整段吞掉——
 *   它后面已经没有字了，吞掉不丢任何可见输出；不吞则 `0;3` 会作为文字出现。
 *   只认末尾：文中间的残缺 CSI 后面还有真文字，没法可靠地断出参数到哪结束。
 */
// eslint-disable-next-line no-control-regex
const 转义 =
  /(?:\x1b\[|\x9b)([0-?]*)[ -/]*([@-~])|(?:\x1b\[|\x9b)[0-?]*[ -/]*$|\x1b\][^\x07\x1b\n]*(?:\x07|\x1b\\)|\x1b[ -/]+[0-~]?|\x1b[@-_]?/g

/** 一段里的所有转义码原样拼起来（文字丢掉）——被回车覆盖的那段，颜色状态仍要生效 */
function 只留转义(段: string): string {
  let 出 = ""
  for (const m of 段.matchAll(转义)) 出 += m[0]
  return 出
}

/**
 * 回车覆盖（tqdm 之类的进度条）：每一行里只留最后一次从行首重写的内容。
 *
 * 终端语义：裸 `\r` 把光标送回行首，后面的字从第 0 列覆盖。进度条每次重画都写得比上一次长或等长
 * （tqdm 会补空格），所以「最后一个 `\r` 之后的那段」就是屏幕上看到的那一行。**这不是终端模拟**——
 * 不做逐列合并；短字覆盖长字时尾巴不保留，对进度条这是对的。
 *
 * - `\r\n` 是换行，不是覆盖：原样保留。
 * - 一段里没有可见字（行尾孤零零的 `\r`、只有 `ESC[2K`）不算覆盖：前一次的内容还在。
 * - 被覆盖掉的段**文字丢、转义码留**：颜色在第一帧打开、最后一帧没再写，终端里它仍是那个颜色。
 *
 * 复制（`stripAnsi`）与显示（`parseAnsi`）都先过这一步，两边永远一致。
 */
export function collapseCarriageReturns(text: string): string {
  if (!text.includes("\r")) return text
  const 行们 = text.split("\n")
  return 行们
    .map((行, 第) => {
      // 全文最后一行没有 `\n` 跟着：行尾的 `\r` 是裸回车，不是 `\r\n` 的前一半
      const crlf = 第 < 行们.length - 1 && 行.endsWith("\r")
      const 体 = crlf ? 行.slice(0, -1) : 行
      if (!体.includes("\r")) return 行
      const 段 = 体.split("\r")
      // 从后往前找最后一段有可见字的——它就是屏幕上那一帧
      let 留 = 段.length - 1
      while (留 > 0 && 段[留]!.replace(转义, "") === "") 留--
      let 出 = ""
      for (let i = 0; i < 段.length; i++) 出 += i === 留 ? 段[i]! : 只留转义(段[i]!)
      return crlf ? 出 + "\r" : 出
    })
    .join("\n")
}

interface 状态 {
  fg?: Ansi色 | undefined
  bg?: Ansi色 | undefined
  bold?: boolean
}

/** 一段 SGR 参数作用到状态上 */
function 应用(参数: string, s: 状态): void {
  // `ESC[m` 等于 `ESC[0m`。冒号是 ITU 写法（`38:5:124`），按分号同样对待
  const 码 = 参数 === "" ? [0] : 参数.split(/[;:]/).map((x) => (x === "" ? 0 : Number(x)))
  for (let i = 0; i < 码.length; i++) {
    const c = 码[i]!
    if (c === 0) {
      s.fg = undefined
      s.bg = undefined
      s.bold = false
    } else if (c === 1) s.bold = true
    else if (c === 22) s.bold = false
    else if (c >= 30 && c <= 37) s.fg = 基本八色[c - 30]
    else if (c >= 90 && c <= 97) s.fg = 亮八色[c - 90]
    else if (c === 39) s.fg = undefined
    else if (c >= 40 && c <= 47) s.bg = 基本八色[c - 40]
    else if (c >= 100 && c <= 107) s.bg = 亮八色[c - 100]
    else if (c === 49) s.bg = undefined
    else if (c === 38 || c === 48) {
      // 扩展色：`5;n` 或 `2;r;g;b`。**参数要吃掉**——不然 `5`、`124` 会被当成别的码
      const 模式 = 码[i + 1]
      let 色: Ansi色 | undefined
      if (模式 === 5) {
        色 = 色256(码[i + 2] ?? -1)
        i += 2
      } else if (模式 === 2) {
        色 = 归类(码[i + 2] ?? 0, 码[i + 3] ?? 0, 码[i + 4] ?? 0)
        i += 4
      } else {
        // 认不出的扩展格式：后面的参数没法可靠地断句，整段放弃
        return
      }
      if (c === 38) s.fg = 色
      else s.bg = 色
    }
    // 其余（斜体、下划线、闪烁……）不认：丢掉，不显示
  }
}

/** 解析成片段。相邻同样式的会合并；空片段不产出 */
export function parseAnsi(text: string): Ansi片段[] {
  const 出: Ansi片段[] = []
  const s: 状态 = {}
  const 推 = (t: string) => {
    if (!t) return
    const 前 = 出[出.length - 1]
    if (前 && 前.fg === s.fg && 前.bg === s.bg && (前.bold ?? false) === (s.bold ?? false)) {
      前.text += t
      return
    }
    const 片: Ansi片段 = { text: t }
    if (s.fg) 片.fg = s.fg
    if (s.bg) 片.bg = s.bg
    if (s.bold) 片.bold = true
    出.push(片)
  }
  text = collapseCarriageReturns(text)
  let 上次 = 0
  for (const m of text.matchAll(转义)) {
    推(text.slice(上次, m.index))
    上次 = m.index! + m[0].length
    if (m[2] === "m") 应用(m[1] ?? "", s)
  }
  推(text.slice(上次))
  return 出
}

/** 只要文字：复制、摘要行、给别处当纯文本用 */
export function stripAnsi(text: string): string {
  return collapseCarriageReturns(text).replace(转义, "")
}
