/**
 * `inspect_data`：方案期看数据的**结构**（2026-09-27，spec `2026-09-27-先出方案-design.md` §4.2，D1）。
 *
 * ## 为什么不让方案期跑 run_code
 *
 * `run_code` 在活内核里跑任意代码——`df.dropna(inplace=True)`、`to_csv`、`!pip install` 都在它能做的范围里，
 * **判不出一段代码只读**。这件工具的代码**写死在我们这边**：只看形状、类型、缺失、前几行、单变量分布，
 * 不做相关、不拟合——预注册的意义就是定方案之前没看过结果。计算照旧交给解释器（pandas / R），不在 TS 里重写。
 *
 * ## 为什么还跑在对话内核里
 *
 * 远端会话的数据在服务器上，只有那台内核够得着；内核里已经读进来的表也能直接看（`variable`）。
 *
 * ## 不留名字、不拼代码
 *
 * - Python 包在 `__dawn_inspect_data` 函数里，`finally` 里 `del` 掉；R 是匿名函数当场调用——**用户的命名空间里不多一个名字**
 *   （IPython 的输入历史、R 的 `.Last.value` 这类内核自己记的账躲不开）。
 * - 人（模型）给的字符串**一个字都不进代码原文**：整份参数编码后塞进去（Python base64 的 JSON、R 十六进制），
 *   代码里只剩 `[A-Za-z0-9+/=]` / `[0-9a-f]`——引号、换行、`; import os`、`"); system("x")` 都只是数据。
 *   变量名另要是标识符、路径另要在工作区里（相对、不含 `..`、没有控制字符）：编码挡的是注入，这两条挡的是「看错地方」。
 *
 * ## 执行走 run_code 那条路
 *
 * 中止（排着的不跑、在跑的发中断、等不回来先交还）、50 KB 的模型上限（`截给模型`）、报错带 traceback——
 * 与 `run_code` 一模一样，所以直接复用它的 `execute`，只换代码与抬头。**不另写一套中止**：两套会各自漂。
 */
import { Type } from "typebox"
import type { SessionId } from "../runtime/types.js"
import type { 内核语言, 对话内核 } from "../kernel/挂载.js"
import { 看数据工具名 } from "../protocol/plan.js"
import { createRunCodeTool } from "./run-code.js"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}
const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {}),
  details: undefined,
})

export interface 看数据参数 {
  path?: string
  variable?: string
  sheet?: string
  rows: number
}

/** 前几行：缺省 5，最多 20。**非数字 / NaN 也落回缺省**——`Math.max(1, NaN)` 是 NaN，会原样拼进 R 代码 */
function 行数(x: unknown): number {
  const n = typeof x === "number" && Number.isFinite(x) ? Math.floor(x) : 5
  return Math.min(20, Math.max(1, n))
}

const PY = (b64: string) => `def __dawn_inspect_data(__a):
    import base64 as _b, json as _j, os as _o
    a = _j.loads(_b.b64decode(__a).decode("utf-8"))
    try:
        import pandas as pd
    except ImportError:
        print("这个解释器里没有 pandas，看不了表格的结构。")
        return
    n = int(a.get("rows", 5))
    if a.get("variable"):
        g = globals()
        if a["variable"] not in g:
            print(f"内核里没有叫 {a['variable']} 的变量。")
            return
        df = g[a["variable"]]
    else:
        p = a["path"]
        ext = _o.path.splitext(p)[1].lower()
        if not _o.path.exists(p):
            print(f"找不到文件：{p}（相对内核的工作目录 {_o.getcwd()}）")
            return
        if ext in (".csv", ".txt"):
            df = pd.read_csv(p)
        elif ext == ".tsv":
            df = pd.read_csv(p, sep="\\t")
        elif ext in (".xlsx", ".xls"):
            df = pd.read_excel(p, sheet_name=a.get("sheet") or 0)
        elif ext == ".parquet":
            df = pd.read_parquet(p)
        else:
            print(f"不认识的格式：{ext}（认得 csv / tsv / txt / xlsx / xls / parquet）")
            return
    if not isinstance(df, pd.DataFrame):
        print(f"类型：{type(df).__name__}；形状：{getattr(df, 'shape', '（没有）')}")
        print(repr(df)[:2000])
        return
    with pd.option_context("display.width", 200, "display.max_columns", 50):
        print(f"形状：{df.shape[0]} 行 × {df.shape[1]} 列")
        print("列类型："); print(df.dtypes.to_string())
        print("缺失："); print(df.isna().sum().to_string())
        print(f"前 {n} 行："); print(df.head(n).to_string())
        for c in list(df.select_dtypes(exclude="number").columns)[:20]:
            vc = df[c].value_counts(dropna=False)
            print(f"{c}：{vc.size} 个取值；最多的：{vc.head(10).to_dict()}")
        num = df.select_dtypes(include="number")
        if num.shape[1]:
            print("数值列的分布："); print(num.describe().T.to_string())
try:
    __dawn_inspect_data("${b64}")
finally:
    del __dawn_inspect_data
`

const R = (路径: string, 变量: string, 表: string, n: number) => `(function() {
  .h <- function(x) {
    if (nchar(x) == 0) return("")
    s <- rawToChar(as.raw(strtoi(substring(x, seq(1, nchar(x), 2), seq(2, nchar(x), 2)), 16L)))
    Encoding(s) <- "UTF-8"
    s
  }
  path <- .h("${路径}"); var <- .h("${变量}"); sheet <- .h("${表}"); n <- ${n}L
  if (nzchar(var)) {
    if (!exists(var, envir = globalenv(), inherits = FALSE)) { cat("内核里没有叫", var, "的变量。\\n"); return(invisible()) }
    df <- get(var, envir = globalenv())
  } else {
    if (!file.exists(path)) { cat("找不到文件：", path, "（相对内核的工作目录", getwd(), "）\\n"); return(invisible()) }
    ext <- tolower(tools::file_ext(path))
    if (ext %in% c("csv", "txt")) df <- utils::read.csv(path, check.names = FALSE)
    else if (ext == "tsv") df <- utils::read.delim(path, check.names = FALSE)
    else if (ext %in% c("xlsx", "xls")) {
      if (!requireNamespace("readxl", quietly = TRUE)) { cat("这个 R 里没有 readxl，读不了 excel。\\n"); return(invisible()) }
      df <- readxl::read_excel(path, sheet = if (nzchar(sheet)) sheet else 1)
    } else if (ext == "rds") df <- readRDS(path)
    else { cat("不认识的格式：", ext, "（认得 csv / tsv / txt / xlsx / xls / rds）\\n"); return(invisible()) }
  }
  if (!is.data.frame(df)) { cat("类型：", class(df)[1], "\\n"); utils::str(df); return(invisible()) }
  cat("形状：", nrow(df), "行 ×", ncol(df), "列\\n")
  cat("列类型与前几个值：\\n"); utils::str(df, give.attr = FALSE)
  cat("缺失：\\n"); print(colSums(is.na(df)))
  cat("前", n, "行：\\n"); print(utils::head(df, n))
  cat("分布：\\n"); print(summary(df))
  invisible()
})()
`

/** 写死的那段代码。**参数只以编码后的形式出现**（见文件头） */
export function 看数据代码(语言: 内核语言, 参: 看数据参数): string {
  const 规整 = { ...参, rows: 行数(参.rows) }
  if (语言 === "python") {
    return PY(Buffer.from(JSON.stringify(规整), "utf8").toString("base64"))
  }
  const hex = (s: string | undefined) => Buffer.from(s ?? "", "utf8").toString("hex")
  return R(hex(规整.path), hex(规整.variable), hex(规整.sheet), 规整.rows)
}

/** Python 标识符（ASCII）；R 的语法名（字母或「点后不跟数字」开头）。**两门分开判**：`df.x` 在 R 是名字，在 Python 不是 */
const 标识符: Record<内核语言, RegExp> = {
  python: /^[A-Za-z_][A-Za-z0-9_]*$/,
  R: /^(?:[A-Za-z]|\.(?![0-9]))[A-Za-z0-9._]*$/,
}
const 控制字符 = /[\u0000-\u001f\u007f]/

/** 变量名为什么不收。收 → undefined */
export function 变量名不成立(语言: 内核语言, 名: string): string | undefined {
  if (名.length > 200 || !标识符[语言].test(名)) return `variable 只收一个 ${语言} 变量名，${JSON.stringify(名)} 不是。`
  return undefined
}

/**
 * 路径为什么不收。收 → undefined。**只收工作区里的相对路径**：内核的工作目录就是会话的工作区（远端也是），
 * 绝对路径与 `..` 会看到工作区外面去——方案期看的是这个项目的数据。
 */
export function 路径不成立(p: string): string | undefined {
  if (p.length > 1024) return "path 太长了。"
  if (控制字符.test(p)) return "path 里有换行或控制字符。给一个相对工作区的文件路径。"
  if (/^([/\\~]|[A-Za-z]:)/.test(p)) return `path 要相对工作区（例如 data/raw/a.csv），${JSON.stringify(p)} 不是。`
  if (p.split(/[/\\]/).includes("..")) return `path 不能用 .. 走出工作区：${JSON.stringify(p)}。`
  return undefined
}

export function createInspectDataTool(opts: {
  /** 这一轮属于哪个对话。**由调用方绑死**，不让模型自己指定 */
  对话: SessionId
  内核: 对话内核
  /** 测试用：覆盖 `run_code` 的 `中断后最多等` */
  中断等待毫秒?: number
}) {
  const 跑 = createRunCodeTool({
    对话: opts.对话,
    内核: opts.内核,
    ...(opts.中断等待毫秒 !== undefined ? { 中断等待毫秒: opts.中断等待毫秒 } : {}),
  })
  return {
    name: 看数据工具名,
    label: 看数据工具名,
    description:
      "先出方案时看一份表格数据的结构：行列数、列类型、缺失、前几行、非数值列的取值、数值列的分布。" +
      "给 path（相对工作区的 csv / tsv / txt / xlsx / xls / parquet / rds）或 variable（内核里已有的一个表）。不做相关、不拟合模型。",
    promptSnippet: "inspect_data：先出方案时看表格数据的结构",
    parameters: Type.Object({
      language: Type.Union([Type.Literal("python"), Type.Literal("R")]),
      path: Type.Optional(Type.String({ description: "数据文件，相对工作区" })),
      variable: Type.Optional(Type.String({ description: "内核里已有的变量名" })),
      sheet: Type.Optional(Type.String({ description: "excel 的工作表名" })),
      rows: Type.Optional(Type.Number({ description: "看前几行，默认 5，最多 20" })),
    }),
    async execute(
      toolCallId: string,
      params: { language?: unknown; path?: unknown; variable?: unknown; sheet?: unknown; rows?: unknown },
      signal?: AbortSignal,
    ): Promise<ToolResult> {
      const 语言 = params.language
      if (语言 !== "python" && 语言 !== "R") return text(`language 要给 "python" 或 "R"，收到的是 ${JSON.stringify(语言)}。`, true)
      const path = typeof params.path === "string" && params.path.trim() ? params.path.trim() : undefined
      const variable = typeof params.variable === "string" && params.variable.trim() ? params.variable.trim() : undefined
      if (Boolean(path) === Boolean(variable)) return text("path 与 variable 要给且只给一个。", true)
      const 不 = variable ? 变量名不成立(语言, variable) : 路径不成立(path!)
      if (不) return text(不, true)
      const sheet = typeof params.sheet === "string" && params.sheet ? params.sheet : undefined
      if (sheet && (sheet.length > 200 || 控制字符.test(sheet))) return text("sheet 要是一个工作表名（不带换行、不超过 200 字）。", true)
      if (signal?.aborted) return text("这一轮已经停了，没有看。", true)
      const 代码 = 看数据代码(语言, {
        ...(path ? { path } : {}),
        ...(variable ? { variable } : {}),
        ...(sheet ? { sheet } : {}),
        rows: 行数(params.rows),
      })
      const r = await 跑.execute(toolCallId, { language: 语言, code: 代码 }, signal)
      const 看的 = path ? `path ${path}` : `variable ${variable}`
      const [首, ...余] = r.content
      return { ...r, content: [{ type: "text", text: `inspect_data（${看的}）\n${首?.text ?? ""}` }, ...余] }
    },
  }
}
