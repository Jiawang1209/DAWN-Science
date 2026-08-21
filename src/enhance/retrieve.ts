/**
 * 参考材料怎么找（E1）。**全是纯函数**：切窗、关键词、文件打分、片段——
 * 调模型与读文件都由调用方注入（`问一句` / `列文件` / `读文件`），单测不碰网络与磁盘。
 *
 * 学自 dsh-prompt-enhancer 的三件事：按时间切窗逐窗判定、命中即止；关键词给文件名打分；
 * 命中行 ±2 行做片段。**三处故意不同**（设计文档「与它不同的三条」）：
 *   ① 打不中就不带——不取「前 N 个」充数；
 *   ② 关键词中英混排都抽得出；
 *   ③ 文档注入一手片段，不用模型的二手摘要。
 */
import { 相关性判定, 开发意图判定, 文档挑选 } from "./prompts.js"

/* ── 对话历史 ─────────────────────────────────────────────────── */

export interface 一句 {
  who: "user" | "agent"
  text: string
}

/** 标准档的三个窗口：1 = 最近一轮。先近后远，命中即止 */
export const 标准窗口: readonly [number, number][] = [
  [1, 2],
  [3, 5],
  [6, 10],
]
/** 一句最多留多少字（超长的回答只留头） */
const 每句上限 = 2400

/**
 * 把对话切成「轮」：一轮 = 一句用户 + 之后到下一句用户之前的全部。
 * 返回第 `from`..`to` 轮（1 = 最近）的文本；越界的窗口回空串，**不夹成别的数据**。
 */
export function 取窗(历史: readonly 一句[], from: number, to: number): string {
  const 轮们: 一句[][] = []
  let 当前: 一句[] | undefined
  for (const 句 of 历史) {
    if (句.who === "user") {
      当前 = [句]
      轮们.push(当前)
    } else if (当前) 当前.push(句)
  }
  // 1 = 最近
  const 倒 = [...轮们].reverse()
  if (from > 倒.length) return ""
  const 选 = 倒.slice(from - 1, Math.min(to, 倒.length))
  // 按时间正序输出
  return 选
    .reverse()
    .flat()
    .map((句) => `[${句.who === "user" ? "用户" : "助手"}] ${句.text.slice(0, 每句上限)}`)
    .join("\n")
}

export type 问一句 = (req: { system?: string; user: string; maxTokens: number; signal?: AbortSignal }) => Promise<string>

/** 解析判定类小调用的 JSON。**解析不出就当否**（宁可漏判） */
export function 读JSON<T>(s: string): T | undefined {
  const m = /\{[\s\S]*\}/.exec(s)
  if (!m) return undefined
  try {
    return JSON.parse(m[0]) as T
  } catch {
    return undefined
  }
}

/** 逐窗判定，命中即止。回命中的窗文本，没命中回 undefined；判定失败按「不相关」 */
export async function 找相关的对话(
  历史: readonly 一句[],
  当前: string,
  问: 问一句,
  opts: { 窗口?: readonly [number, number][]; 上限字数?: number; signal?: AbortSignal; 进度?: (i: number, n: number) => void } = {},
): Promise<{ 窗: [number, number]; 文本: string } | undefined> {
  const 窗口 = opts.窗口 ?? 标准窗口
  for (let i = 0; i < 窗口.length; i++) {
    if (opts.signal?.aborted) return undefined
    const [from, to] = 窗口[i]!
    const 文本 = 取窗(历史, from, to)
    if (!文本) continue
    opts.进度?.(i + 1, 窗口.length)
    const 答 = await 问({ user: 相关性判定(文本.slice(0, opts.上限字数 ?? 2400), 当前), maxTokens: 200, ...(opts.signal ? { signal: opts.signal } : {}) }).catch(() => "")
    if (读JSON<{ related?: boolean }>(答)?.related === true) return { 窗: [from, to], 文本: 文本.slice(0, opts.上限字数 ?? 2400) }
  }
  return undefined
}

export async function 有开发意图(当前: string, 背景: string, 问: 问一句, signal?: AbortSignal): Promise<boolean> {
  const 答 = await 问({ user: 开发意图判定(当前, 背景), maxTokens: 200, ...(signal ? { signal } : {}) }).catch(() => "")
  return 读JSON<{ isDevIntent?: boolean }>(答)?.isDevIntent === true
}

/* ── 关键词 ──────────────────────────────────────────────────── */

const 中文虚词 = "的了在是我你他她它们这那有和与或把被让给对从到为以及就都也很不没要会能可以请帮看一下一个什么怎么如何吗呢吧啊呀"
const 英文停词 = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "be", "this", "that", "it", "my", "me", "please", "help", "can", "you", "we", "i", "do", "make", "get", "some", "any", "all", "as", "at", "by", "from", "into", "about"])

/**
 * 中英混排都抽：中文按虚词切成词段（≥ 2 字），英文按 CamelCase / snake_case / 路径切（≥ 3 字母），
 * 路径与文件名整个留着。最多 8 个，按出现顺序。
 */
export function 抽关键词(text: string): string[] {
  const 出: string[] = []
  const 加 = (w: string) => {
    const k = w.trim()
    if (k.length < 2 || 出.includes(k) || 出.length >= 8) return
    出.push(k)
  }
  // 路径 / 文件名
  for (const m of text.match(/[\w./-]+\.[a-zA-Z0-9]{1,6}\b/g) ?? []) 加(m)
  // 英文词：拆 CamelCase 与 snake_case
  for (const m of text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) {
    for (const 段 of m.split(/_+|(?<=[a-z0-9])(?=[A-Z])/)) {
      const w = 段.toLowerCase()
      if (w.length >= 3 && !英文停词.has(w)) 加(w)
    }
  }
  // 中文：按虚词切
  const 虚 = new RegExp(`[${中文虚词}，。、；：？！\\s]+`)
  for (const 段 of text.split(虚)) {
    const 中 = 段.match(/[一-龥]{2,8}/g) ?? []
    for (const w of 中) 加(w)
  }
  return 出
}

/* ── 工作区 ──────────────────────────────────────────────────── */

export const 忽略目录 = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".next", ".cache", "coverage", "target", ".idea", ".vscode"])
const 敏感文件 = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore|crt|cer)|.*(credentials?|secrets?|token|id_rsa|id_ed25519|id_ecdsa|\.npmrc|\.pypirc|\.netrc|\.htpasswd).*)$/i

export function 该跳过(path: string): boolean {
  const 段 = path.split("/")
  if (段.some((s) => 忽略目录.has(s))) return true
  return 敏感文件.test(path) || /\.log$/i.test(path)
}

/**
 * 给文件打分：关键词出现在文件名 +3、出现在路径 +2，每深一层 −0.1。
 * **一个关键词都没打中的不回**——宁可不带（与它的「取前 N」不同）。
 */
export function 按关键词排文件(文件: readonly string[], 关键词: readonly string[], 最多: number): string[] {
  if (关键词.length === 0) return []
  const 分 = (p: string) => {
    const 低 = p.toLowerCase()
    const 名 = 低.split("/").pop() ?? 低
    let s = 0
    for (const k of 关键词) {
      const kk = k.toLowerCase()
      if (名.includes(kk)) s += 3
      else if (低.includes(kk)) s += 2
    }
    return s === 0 ? 0 : s - 0.1 * (p.split("/").length - 1)
  }
  return 文件
    .filter((p) => !该跳过(p))
    .map((p) => [p, 分(p)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 最多)
    .map(([p]) => p)
}

/** 命中行 ±2 行拼片段；一个关键词都没命中 → 回 undefined（不拿前 40 行充数） */
export function 取片段(内容: string, 关键词: readonly string[], 上限 = 800): string | undefined {
  const 行 = 内容.split("\n")
  const 低 = 关键词.map((k) => k.toLowerCase())
  const 命中 = new Set<number>()
  行.forEach((l, i) => {
    const ll = l.toLowerCase()
    if (低.some((k) => ll.includes(k))) for (let j = Math.max(0, i - 2); j <= Math.min(行.length - 1, i + 2); j++) 命中.add(j)
  })
  if (命中.size === 0) return undefined
  const 出: string[] = []
  let 上 = -2
  for (const i of [...命中].sort((a, b) => a - b)) {
    if (i !== 上 + 1 && 出.length) 出.push("…")
    出.push(行[i]!)
    上 = i
  }
  const s = 出.join("\n")
  return s.length > 上限 ? `${s.slice(0, 上限)}…` : s
}

export interface 文档候选 {
  path: string
  片段: string
}

/** 挑文档：让模型从候选里选相关的、顺便看有没有项目地图。解析失败 = 一个都不选 */
export async function 挑文档(候选: readonly 文档候选[], 当前: string, 问: 问一句, signal?: AbortSignal): Promise<{ 选中: 文档候选[]; codePaths: string[] }> {
  if (候选.length === 0) return { 选中: [], codePaths: [] }
  const 清单 = 候选.map((c) => `📄 ${c.path}\n${c.片段}`).join("\n\n")
  const 答 = await 问({ user: 文档挑选(清单, 当前), maxTokens: 300, ...(signal ? { signal } : {}) }).catch(() => "")
  const r = 读JSON<{ relatedDocs?: string[]; hasProjectMap?: boolean; codePaths?: string[] }>(答)
  if (!r?.relatedDocs) return { 选中: [], codePaths: [] }
  const 选中 = 候选.filter((c) => r.relatedDocs!.includes(c.path)).slice(0, 5)
  return { 选中, codePaths: r.hasProjectMap ? (r.codePaths ?? []).slice(0, 5) : [] }
}

export const 代码文件 = /\.(js|ts|jsx|tsx|py|go|rs|java|cpp|c|h|cs|rb|php|sql|sh|vue|html|css|json|ya?ml|toml|R|r|jl)$/
