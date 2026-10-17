/** MLAI 案例工具结果的共享提取器：实时输出、历史恢复、旧版前端兼容共用。 */
import type { 案例 } from "../protocol/cases.js"

/** 会回案例的那几个工具（名字带服务器前缀：`mlai-science__search_cases`） */
const 案例工具 = /^(.+?)__(search_cases|semantic_search|search_figures|search_chunks|recommend_figures|recommend_pipeline|get_case)$/

const 字 = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)
const 串 = (v: unknown): string | undefined =>
  Array.isArray(v) ? 字(v.filter((x) => typeof x === "string").join(" · ")) : undefined

/** 工具返回的文本 → JSON。我们给 MCP 结果加了 `[服务器名] ` 前缀；解析不了（被截断）就当没有 */
function 解析(text: string): unknown {
  try { return JSON.parse(text) } catch { /* MCP 文字可能带服务器前缀 */ }
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
  tools: readonly { name: string; result?: string | undefined; caseResults?: readonly 案例[] | undefined }[],
): Map<string, { 服务器: string; 案例: 案例 }> {
  const 表 = new Map<string, { 服务器: string; 案例: 案例 }>()
  for (const t of tools) {
    const m = 案例工具.exec(t.name)
    if (!m || (!t.result && !t.caseResults)) continue
    const 服务器 = m[1]!
    走一遍(t.caseResults ?? 解析(t.result ?? ""), (o) => {
      const id = 字(o.case_id)!
      const 新: 案例 = {
        case_id: id,
        title: 字(o.title) ?? 字(o.case_title),
        language: 字(o.language),
        summary: 字(o.summary) ?? 字(o.caption) ?? 串([...(Array.isArray(o.task) ? o.task : []), ...(Array.isArray(o.algorithms) ? o.algorithms : []), ...(Array.isArray(o.figure_types) ? o.figure_types : [])]),
        cover: 字(o.cover) ?? 字(o.preview),
      }
      const 旧 = 表.get(id)
      if (!旧) return void 表.set(id, { 服务器, 案例: 新 })
      for (const k of ["title", "language", "summary", "cover"] as const) 旧.案例[k] ??= 新[k]
    })
  }
  return 表
}

/** 在文本预算截断前提取；只保留卡片字段，不复制代码、笔记或原始结果。 */
export function 提取案例字段(name: string, result: string): 案例[] | undefined {
  const cases = [...从工具结果收案例([{ name, result }]).values()].map((x) => x.案例)
  return cases.length > 0 ? cases : undefined
}
