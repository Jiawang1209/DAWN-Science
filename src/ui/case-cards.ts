/**
 * 案例卡片的数据那一半（2026-09-15，规格 `2026-09-15-案例卡片-design.md`）。
 *
 * **数据从这一轮 MLAI 工具的返回里取，不靠模型按格式写**（K1，第二版）。
 * 第一版让 agent 附一段 ```mlai-cases 清单；作者真机试的第二次，模型根本没去读技能、直接调了 8 次 MLAI 工具，
 * 写出一大段带 case_id 的文字——清单没有，卡片自然也没有。「模型记得按格式写」不可靠，工具返回是结构化的、一定在。
 *
 * **出哪几张**：agent 正文里**提到**的 case_id，按首次出现的先后；数据（标题、语言、封面、一句话）
 * 从这一轮所有 MLAI 工具返回里按 case_id 合并。正文一个都没提 → 不出卡（它可能只是在泛泛地聊）。
 */

export interface 案例 {
  case_id: string
  title?: string | undefined
  language?: string | undefined
  /** 一句话：caption，或 task / algorithms / figure_types 拼出来的 */
  summary?: string | undefined
  /** 相对那篇案例目录的封面图路径（`cover`，或图级检索的 `preview`） */
  cover?: string | undefined
}

/** 一张卡：哪台 MCP（决定图廊根地址）+ 那篇 + 在这条回复里的序号 */
export interface 本轮案例 {
  服务器: string
  案例: 案例
  n: number
}

/** 会回案例的那几个工具（名字带服务器前缀：`mlai-science__search_cases`） */
const 案例工具 = /^(.+?)__(search_cases|semantic_search|search_figures|search_chunks|recommend_figures|recommend_pipeline|get_case)$/

const 字 = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)
const 串 = (v: unknown): string | undefined =>
  Array.isArray(v) ? 字(v.filter((x) => typeof x === "string").join(" · ")) : undefined

/** 工具返回的文本 → JSON。我们给 MCP 结果加了 `[服务器名] ` 前缀；解析不了（被截断）就当没有 */
function 解析(text: string): unknown {
  const 去前缀 = text.replace(/^\s*\[[^\]\n]+\]\s*/, "")
  try {
    return JSON.parse(去前缀)
  } catch {
    return undefined
  }
}

function 走一遍(v: unknown, 收: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(v)) return v.forEach((x) => 走一遍(x, 收))
  if (!v || typeof v !== "object") return
  const o = v as Record<string, unknown>
  if (字(o.case_id)) 收(o)
  for (const x of Object.values(o)) if (x && typeof x === "object") 走一遍(x, 收)
}

/** 这一轮所有 MLAI 工具返回里出现过的案例，按 case_id 合并（先到的字段不被后到的空值覆盖） */
export function 从工具结果收案例(
  tools: readonly { name: string; result?: string | undefined }[],
): Map<string, { 服务器: string; 案例: 案例 }> {
  const 表 = new Map<string, { 服务器: string; 案例: 案例 }>()
  for (const t of tools) {
    const m = 案例工具.exec(t.name)
    if (!m || !t.result) continue
    const 服务器 = m[1]!
    走一遍(解析(t.result), (o) => {
      const id = 字(o.case_id)!
      const 新: 案例 = {
        case_id: id,
        title: 字(o.title) ?? 字(o.case_title),
        language: 字(o.language),
        summary: 字(o.caption) ?? 串([...(Array.isArray(o.task) ? o.task : []), ...(Array.isArray(o.algorithms) ? o.algorithms : []), ...(Array.isArray(o.figure_types) ? o.figure_types : [])]),
        cover: 字(o.cover) ?? 字(o.preview),
      }
      const 旧 = 表.get(id)
      if (!旧) return void 表.set(id, { 服务器, 案例: 新 })
      for (const k of ["title", "language", "summary", "cover"] as const) 旧.案例[k] ??= 新[k]
    })
  }
  return 表
}

/**
 * 正文里提到了哪几篇，按首次出现排。认两种写法：
 * - 完整的 case_id；
 * - **模型常把长 id 截短**（真机里见过 `20251019-xacaaee`）：一个像 id 的片段（8 位日期开头、≥ 12 字符）
 *   若恰好是**唯一一个**已知 id 的前缀，也算提到了那篇。对不上唯一一篇的不猜。
 */
export function 本轮提到的案例(正文: string, 已知: Map<string, { 服务器: string; 案例: 案例 }>): 本轮案例[] {
  const 位置 = new Map<string, number>()
  for (const id of 已知.keys()) {
    const i = 正文.indexOf(id)
    if (i >= 0) 位置.set(id, i)
  }
  for (const m of 正文.matchAll(/\d{8}-[A-Za-z0-9-]{4,}/g)) {
    const 片 = m[0].replace(/-+$/, "")
    if (片.length < 12) continue
    const 候选 = [...已知.keys()].filter((id) => id.startsWith(片))
    if (候选.length === 1 && !位置.has(候选[0]!)) 位置.set(候选[0]!, m.index)
  }
  return [...位置.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id], k) => ({ ...已知.get(id)!, n: k + 1 }))
}

/** MCP 地址 → 图廊根：`http://127.0.0.1:8765/mcp` → `http://127.0.0.1:8765` */
export const 图廊根 = (mcpUrl: string): string => mcpUrl.replace(/\/+$/, "").replace(/\/mcp$/, "")

export const 封面地址 = (根: string, c: 案例): string | undefined =>
  c.cover ? `${根}/gallery/asset/${encodeURIComponent(c.case_id)}/${c.cover.replace(/^\/+/, "")}` : undefined

export const 详情地址 = (根: string, c: 案例): string => `${根}/gallery/case/${encodeURIComponent(c.case_id)}`

/**
 * 「照这篇做」替人说出口的那句话。**带 case_id**：agent 直接 `get_case`，不必从「第 2 个」去对是哪篇。
 * 它走的是与手打完全同一条发送路，转录里就是人发的这句——谁选的、选了哪篇，一眼看得见。
 */
export const 选这篇的话 = (c: 案例): string =>
  c.title ? `照这篇做：《${c.title}》（case_id: ${c.case_id}）` : `照这篇做：case_id: ${c.case_id}`
