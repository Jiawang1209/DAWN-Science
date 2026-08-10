/**
 * 变量面板的内省（②-A · K5 · S14）。
 *
 * ## 它回答的问题
 *
 * *「人能看见 agent 在这个会话里造出了什么。」*
 * 一个持久会话跑久了，命名空间里有什么只有内核自己知道——
 * 而人和 agent 共用同一个会话，**看不见就等于要靠猜**。
 *
 * ## 三条纪律
 *
 * 1. **不弄脏 Console。** 走 `silent: true` + `user_expressions`
 *    （见 `channel.probe`），结果从 reply 回来，不经 iopub 广播。
 *    直接执行一段内省代码的话，用户会看见一堆自己没写过的代码在刷屏，
 *    **而面板每刷新一次就刷一次**。
 * 2. **预览必须显式标记是否被截断**（Rho `ObjectSummary.preview_truncated`）。
 *    一个被砍过的预览看起来和完整的一模一样——**那正是最坏的地方**。
 * 3. **不支持的语言明说不支持**，不返回空列表。
 *    空列表会被读成「这个会话里没有变量」，而实情是「我们没去问」。
 *
 * ## 为什么中间套一层 base64
 *
 * `user_expressions` 回来的是 **`repr()`**：直接返回 JSON 字符串的话，
 * 拿到的是带外层引号且内部全是转义的东西，在 JS 侧反解析很脆。
 * base64 的 repr 只有外层引号、没有转义——**用一层编码换掉一整类解析 bug**。
 */

/** 一个变量的摘要。字段照 Rho 的 `ObjectSummary` */
export interface VariableSummary {
  name: string
  /** 类型名。**内核自己说的**，不是我们猜的 */
  type: string
  /** 维度／长度。拿不到就没有这个字段——**缺就是缺** */
  dimensions?: string
  preview: string
  /** **预览被砍过**。看起来和完整的一模一样，所以必须显式标注 */
  previewTruncated: boolean
}

/** 预览的字符上界。**够看出是什么，不够刷屏** */
export const PREVIEW_MAX = 200

/**
 * Python 的内省表达式。**必须是单个表达式**——`user_expressions` 只吃表达式。
 *
 * 过滤掉的三类，各有理由：
 *   - `_` 开头：IPython 自己的历史变量（`_`, `__`, `_i1` …），不是用户造的
 *   - 可调用：函数与类不是「数据」，混进来会把真正的变量淹掉
 *   - 模块：`import numpy as np` 之后 `np` 不该出现在变量面板里
 */
const PYTHON_PROBE = `__import__('base64').b64encode(__import__('json').dumps([
  {
    'name': _k,
    'type': type(_v).__name__,
    'dimensions': (str(getattr(_v, 'shape', None)) if hasattr(_v, 'shape')
                   else (str(len(_v)) if hasattr(_v, '__len__') else None)),
    'preview': repr(_v)[:${PREVIEW_MAX}],
    'previewTruncated': len(repr(_v)) > ${PREVIEW_MAX},
  }
  for _k, _v in list(globals().items())
  if not _k.startswith('_')
  and not callable(_v)
  and type(_v).__name__ != 'module'
], default=str).encode('utf-8')).decode('ascii')`.replace(/\n\s*/g, " ")

/**
 * 这个语言怎么问。
 *
 * **R 暂时没有**：`user_expressions` 要一个表达式，而在 base R 里
 * 手搓 JSON（转义、编码）比它值得的风险大；`jsonlite` 又不是标配，
 * **假定它装了就是在猜用户的环境**。
 * 所以如实回 `undefined`，界面据此说「这个内核暂不支持」——
 * **不返回空列表**：那会被读成「没有变量」。
 */
export function probeExpressionFor(language: string | undefined): string | undefined {
  if (language === "python") return PYTHON_PROBE
  return undefined
}

/**
 * 解析内省结果。
 *
 * 输入是 `channel.probe` 给的 `text/plain`，也就是那个 base64 字符串的
 * **`repr()`**——外面裹着一对引号。
 *
 * **解析不出来就返回 undefined**，不返回空数组：
 * 「没解析出来」与「这个会话里没有变量」是两回事。
 */
export function parseVariables(raw: string | undefined): VariableSummary[] | undefined {
  if (!raw) return undefined
  // 去掉 repr 的外层引号（单引号或双引号都可能）
  const b64 = raw.trim().replace(/^['"]|['"]$/g, "")
  let json: string
  try {
    json = Buffer.from(b64, "base64").toString("utf8")
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined

  const out: VariableSummary[] = []
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.name !== "string") continue
    out.push({
      name: r.name,
      type: typeof r.type === "string" ? r.type : "（内核没说类型）",
      // **null 就是「拿不到」**，不给这个字段，而不是给一个 "null"
      ...(typeof r.dimensions === "string" ? { dimensions: r.dimensions } : {}),
      preview: typeof r.preview === "string" ? r.preview : "",
      previewTruncated: r.previewTruncated === true,
    })
  }
  // **按名字排**：面板里的顺序不该随内核内部的字典序抖动
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
