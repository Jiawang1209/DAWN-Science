/**
 * 环境快照（②-B · S17）。
 *
 * ## 它回答的问题
 *
 * *「这个结果是在什么环境跑出来的？」*
 *
 * 这是「科研工具」与「AI 编辑器」的分界线之一。一张图、一个 p 值，
 * 脱离了产生它的解释器版本与包版本，**不是一个可以被别人检验的结论**。
 *
 * ## 两条禁令（学自 Rho 的 admission snapshot）
 *
 * 1. **不得回头探测当前库。**
 *    快照在**准入时刻**（会话起来的那一刻）冻结，此后只读那一份不可变 JSON。
 *    「现在装的是什么」与「当时装的是什么」是两个问题——
 *    拿前者去回答后者，就是用今天的环境伪造昨天的证据。
 * 2. **环境变量的值永不入库。**
 *    这里干脆一个环境变量都不采集。`PATH` 泄露目录结构，
 *    而 `*_API_KEY`、`*_TOKEN` 泄露的东西更糟——**而快照是要被分享出去的**。
 *    要记「用了哪个 conda 环境」，记解释器路径就够了。
 *
 * ## 上界要出声（规格 7.5）
 *
 * 包清单会很长（本机随便一个 conda 环境三四百个）。**超了要说省了多少**，
 * 而不是给一份看起来完整、其实被砍过的清单——
 * 那比不给更坏，因为它看不出来。
 */
import { createHash } from "node:crypto"

/** 包清单上界。三四百个是常态，2000 是「这不像一个环境」的信号 */
export const PACKAGES_MAX = 2000

export interface PackageRecord {
  name: string
  version: string
}

export interface EnvironmentSnapshot {
  language: "python" | "R"
  /** 解释器自报的版本串。**内核说的，不是我们从路径猜的** */
  version: string
  /** 解释器可执行文件。回答「到底是哪个 conda 环境」 */
  executable: string
  /** 操作系统与架构 */
  platform: string
  /** 库搜索路径。`sys.path` / `.libPaths()` */
  libraryPaths: string[]
  packages: PackageRecord[]
  /** 实际装了多少个。**与 `packages.length` 不同即为被截断** */
  packagesTotal: number
  /**
   * 在哪台机器上（远程内核，2026-09-03）。**本机内核不带这个字段**——指纹的规范化里只在有它时
   * 才出现 `where` 键，所以老快照的 id 一个字节不变；远端内核带它：同一个 conda env
   * 搬到另一台机器，是另一份快照（与 shell 快照的 `where` 同一条理由）。
   */
  where?: { connectionId: string }
}

/**
 * Python 的探测表达式。**必须是单个表达式**——`user_expressions` 只吃表达式。
 *
 * 与变量内省同样中间套一层 base64：`user_expressions` 回来的是 `repr()`，
 * 直接返回 JSON 会拿到一个带外层引号且内部全是转义的东西，在 JS 侧反解析很脆。
 */
const PYTHON_PROBE = `__import__('base64').b64encode(__import__('json').dumps({
  'language': 'python',
  'version': __import__('sys').version.split()[0],
  'executable': __import__('sys').executable,
  'platform': __import__('platform').platform(),
  'libraryPaths': [_p for _p in __import__('sys').path if _p],
  'packages': sorted([
    {'name': _d.metadata['Name'] or '?', 'version': _d.version or '?'}
    for _d in __import__('importlib.metadata', fromlist=['x']).distributions()
  ], key=lambda _x: _x['name'].lower())[:${PACKAGES_MAX}],
  'packagesTotal': len(list(__import__('importlib.metadata', fromlist=['x']).distributions())),
}, default=str).encode('utf-8')).decode('ascii')`.replace(/\n\s*/g, " ")

/**
 * R 的探测表达式。
 *
 * 与变量内省同一条理由走**十六进制**：`jsonlite` 不是 base R 的一部分，
 * 假定它装了就是在猜用户的环境；而在 base R 里手搓 JSON（转义引号、
 * 反斜杠、换行）风险大于收益。十六进制之后任何字节都安全。
 *
 * **不要把换行压成空格**——R 的多行代码压成一行会当场语法错误
 * （2026-08-10 在变量内省那边踩过一次）。
 */
const R_PROBE = `local({
  .ip <- utils::installed.packages()[, c("Package", "Version"), drop = FALSE]
  .n <- nrow(.ip)
  .keep <- .ip[seq_len(min(.n, ${PACKAGES_MAX})), , drop = FALSE]
  .pkgs <- paste(apply(.keep, 1, function(.r) paste(.r[1], .r[2], sep = "\u001f")), collapse = "\u001e")
  .txt <- paste(
    R.version.string,
    file.path(R.home("bin"), "R"),
    paste(R.version$platform, Sys.info()[["sysname"]], sep = " "),
    paste(.libPaths(), collapse = "\u001f"),
    .pkgs,
    as.character(.n),
    sep = "\u001d")
  paste(sprintf("%02x", as.integer(charToRaw(.txt))), collapse = "")
})`

export function environmentProbeFor(language: string | undefined): string | undefined {
  if (language === "python") return PYTHON_PROBE
  if (language === "R") return R_PROBE
  return undefined
}

/**
 * 解析 Python 那边的 base64 JSON。
 *
 * **解析不出来返回 undefined**，不返回一个空快照：
 * 「没问到」与「这个环境什么都没有」是两回事。
 */
export function parsePythonEnvironment(raw: string | undefined): EnvironmentSnapshot | undefined {
  if (!raw) return undefined
  const b64 = raw.trim().replace(/^['"]|['"]$/g, "")
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"))
  } catch {
    return undefined
  }
  if (typeof parsed !== "object" || parsed === null) return undefined
  const r = parsed as Record<string, unknown>
  if (typeof r.version !== "string" || typeof r.executable !== "string") return undefined

  const packages: PackageRecord[] = []
  if (Array.isArray(r.packages)) {
    for (const p of r.packages) {
      if (typeof p !== "object" || p === null) continue
      const q = p as Record<string, unknown>
      if (typeof q.name === "string" && typeof q.version === "string") {
        packages.push({ name: q.name, version: q.version })
      }
    }
  }
  return {
    language: "python",
    version: r.version,
    executable: r.executable,
    platform: typeof r.platform === "string" ? r.platform : "（内核没说平台）",
    libraryPaths: Array.isArray(r.libraryPaths) ? r.libraryPaths.filter((x): x is string => typeof x === "string") : [],
    packages,
    // **总数以内核说的为准**；它没说就退回我们真正拿到的条数
    packagesTotal: typeof r.packagesTotal === "number" ? r.packagesTotal : packages.length,
  }
}

/** 解析 R 那边的十六进制记录。字段用 `\u001d` 分隔、记录用 `\u001e`、记录内用 `\u001f`——理由见 `R_PROBE` */
export function parseREnvironment(raw: string | undefined): EnvironmentSnapshot | undefined {
  if (!raw) return undefined
  const hex = /[0-9a-f]{2,}/i.exec(raw.replace(/\s+/g, ""))?.[0]
  if (!hex || hex.length % 2 !== 0) return undefined
  let text: string
  try {
    text = Buffer.from(hex, "hex").toString("utf8")
  } catch {
    return undefined
  }
  const [version, executable, platform, libs, pkgs, total] = text.split("\u001d")
  if (!version || !executable) return undefined

  const packages: PackageRecord[] = []
  for (const rec of (pkgs ?? "").split("\u001e")) {
    const [name, v] = rec.split("\u001f")
    if (name) packages.push({ name, version: v || "?" })
  }
  packages.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  return {
    language: "R",
    version,
    executable,
    platform: platform || "（内核没说平台）",
    libraryPaths: (libs ?? "").split("\u001f").filter(Boolean),
    packages,
    packagesTotal: Number(total) || packages.length,
  }
}

export function parseEnvironmentFor(
  language: string | undefined,
  raw: string | undefined,
): EnvironmentSnapshot | undefined {
  if (language === "python") return parsePythonEnvironment(raw)
  if (language === "R") return parseREnvironment(raw)
  return undefined
}

/**
 * 快照的内容指纹。
 *
 * **同一个环境反复开会话，应当指向同一行**——否则一天下来数据库里
 * 躺着几十份逐字节相同的 JSON，而「这两次运行环境一样吗」
 * 这个问题还得靠比对内容来回答。
 *
 * 键按字典序拼，**不含任何时间戳**（§3.6：摘要必须确定性且排除时间戳）——
 * 带上时间的话每次都是新指纹，去重就白做了。
 */
export function fingerprintOf(snap: EnvironmentSnapshot): string {
  const canonical = JSON.stringify({
    language: snap.language,
    version: snap.version,
    executable: snap.executable,
    platform: snap.platform,
    libraryPaths: snap.libraryPaths,
    packages: snap.packages.map((p) => [p.name, p.version]),
    packagesTotal: snap.packagesTotal,
    ...(snap.where ? { where: snap.where.connectionId } : {}),
  })
  return createHash("sha256").update(canonical).digest("hex")
}
