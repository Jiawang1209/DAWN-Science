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
 *    （Python 与 R 都支持了；别的语言仍走这条。）
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
 * 过滤掉的四类，各有理由：
 *   - `_` 开头：IPython 自己的历史变量（`_`, `__`, `_i1` …），不是用户造的
 *   - 可调用：函数与类不是「数据」，混进来会把真正的变量淹掉
 *   - 模块：`import numpy as np` 之后 `np` 不该出现在变量面板里
 *   - **IPython 的记账名**：`In` / `Out` / `exit` / `quit` / `get_ipython`。
 *     2026-08-10 由一条真 e2e 撞出来——面板上冒出一个预览是
 *     `['', "print(...)", "raise ..."]` 的东西，**那是 `In`，
 *     装着用户执行过的每一行代码**。它不是变量，是历史，
 *     而且长得足以把真正的变量挤出视野。
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
  and _k not in ('In', 'Out', 'exit', 'quit', 'get_ipython')
  and not callable(_v)
  and type(_v).__name__ != 'module'
], default=str).encode('utf-8')).decode('ascii')`.replace(/\n\s*/g, " ")

/**
 * R 的内省表达式。
 *
 * ## 为什么不是 JSON
 *
 * `jsonlite` **不是 base R 的一部分**——假定它装了就是在猜用户的环境。
 * 而在 base R 里手搓 JSON（转义引号、反斜杠、换行）风险大于收益。
 *
 * 所以走**十六进制 + 分隔符**：`charToRaw` 是 base R 自带的，
 * 而**十六进制之后任何字节都安全**——预览里出现引号、反斜杠、换行
 * 都不会破坏解析。**用一层编码换掉一整类转义 bug**，
 * 与 Python 那边用 base64 是同一个理由。
 *
 * 分隔符用 `\u001f`（字段）与 `\u001e`（记录）：它们是 ASCII 里专门
 * 干这个的控制字符，而且**编码之后根本不会与内容冲突**。
 *
 * 预览取 `str()` 的输出——它是 R 里「一眼看出这是什么」的标准做法，
 * 比 `print()` 紧凑得多。
 */
const R_PROBE = `paste(sprintf("%02x", as.integer(charToRaw(paste(vapply(
  Filter(function(.n) !is.function(get(.n, envir = globalenv())) && substr(.n, 1, 1) != ".",
         ls(envir = globalenv())),
  function(.n) {
    .v <- get(.n, envir = globalenv())
    .p <- paste(utils::capture.output(utils::str(.v, max.level = 0, give.attr = FALSE)), collapse = " ")
    paste(.n, class(.v)[1],
          if (is.null(dim(.v))) as.character(length(.v)) else paste(dim(.v), collapse = "x"),
          substr(.p, 1, ${PREVIEW_MAX}), as.character(nchar(.p) > ${PREVIEW_MAX}), sep = "\u001f")
  }, character(1)), collapse = "\u001e")))), collapse = "")`
/**
 * **不要把换行压成空格。**
 *
 * 2026-08-10 踩过：拿一个「换行加空白 → 单空格」的正则去压它，会让
 * `.v <- get(...)` 与 `.p <- paste(...)` 挤在一行、中间没有分隔符，
 * R 当场 `unexpected symbol`。**R 的 `code` 本来就允许多行**——
 * 压行省的那点字节，换来的是一个只在运行时才暴露的语法错误。
 */

/**
 * 解析 R 那边的十六进制记录。
 *
 * **解析不出来返回 undefined**，与 Python 那条同一条纪律：
 * 「没解析出来」与「这个会话里没有变量」是两回事。
 */
export function parseRVariables(raw: string | undefined): VariableSummary[] | undefined {
  if (!raw) return undefined
  // IRkernel 回来的可能是 `[1] "abc"` 或 `'abc'`——把十六进制串抠出来即可
  const hex = /[0-9a-f]{2,}/i.exec(raw.replace(/\s+/g, ""))?.[0]
  if (!hex || hex.length % 2 !== 0) {
    // **空命名空间是合法的**：R 的 paste 对空向量给空串，编码后也是空
    return /\[1\]\s*""|''|""/.test(raw) ? [] : undefined
  }
  let text: string
  try {
    text = Buffer.from(hex, "hex").toString("utf8")
  } catch {
    return undefined
  }
  if (text === "") return []
  const out: VariableSummary[] = []
  for (const rec of text.split("\u001e")) {
    const [name, type, dims, preview, truncated] = rec.split("\u001f")
    if (!name) continue
    out.push({
      name,
      type: type || "（内核没说类型）",
      ...(dims ? { dimensions: dims } : {}),
      preview: (preview ?? "").trim(),
      previewTruncated: truncated === "TRUE",
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 这个语言怎么问。
 *
 * Python 与 R 各有一条（编码方式不同，理由见各自的说明）。
 * **别的语言如实回 `undefined`**，界面据此说「这个内核暂不支持」——
 * **不返回空列表**：那会被读成「没有变量」。
 */
export function probeExpressionFor(language: string | undefined): string | undefined {
  if (language === "python") return PYTHON_PROBE
  if (language === "R") return R_PROBE
  return undefined
}

/** 按语言挑解析器。**两种编码，两个解析器**——各自都简单，合成一个反而绕 */
export function parseVariablesFor(
  language: string | undefined,
  raw: string | undefined,
): VariableSummary[] | undefined {
  return language === "R" ? parseRVariables(raw) : parseVariables(raw)
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
