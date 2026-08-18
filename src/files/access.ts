/**
 * 工作区文件访问（②-A′ · F1）。**只读。**
 *
 * ## 这个文件的全部重量在路径守卫上
 *
 * 一旦开了「读文件」这个口子，**渲染进程就能问后端要任意路径的内容**——
 * 写错一行就是任意文件读取。所以这里的规矩比功能本身重要：
 *
 * 1. **先 `realpath` 再判前缀。** 只做字符串比对挡不住 `..`，
 *    更挡不住**符号链接**——`ws/link → /etc` 的字符串前缀完全合法。
 * 2. **越界响亮失败**，不返回空内容。空内容会被读成「这个文件是空的」。
 * 3. **上界要说清超了多少**，不静默截断（规格 7.5）。
 *
 * ## 明确不做
 *
 * **改名与新建目录一概不做**（往「文件管理器」滑的第一步）。
 *
 * **删除在 2026-08-17 由作者拍板加了**（批 5），而这一句原本写的是
 * 「写、删、改名一概不做……写操作要走授权门（阶段 ④）」。
 * 那条禁令针对的是 **agent 通过工具去写**——所以它说「要走授权门」，
 * 而**授权门管的是 agent**。这次是**人自己点删除**：
 * 人对自己的数据负责，不需要一道给 agent 设的门。
 *
 * **删除不在这个文件里**（它走 `deletePath`，本地经主进程的废纸篓）：
 * 这里仍然只读。留着一句已经不成立的禁令比删掉它更坏——
 * 下一个读它的人会照着它做判断。
 */
import { readdirSync, readFileSync, realpathSync, statSync, openSync, readSync, closeSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { UserFacingError } from "../errors.js"
import { 读成表, 表格字节上界, 像表格吗 } from "./table.js"

/** 文本预览上界。512 KB 够看清一个数据文件的形状，又不至于把界面撑死 */
export const TEXT_MAX_BYTES = 512 * 1024
/** 图片上界。10 MB 放得下相当大的 png；再大就该问「这张图是不是出错了」 */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
/**
 * PDF 上界。**比图片宽**——R 的 `pdf()` 出的图往往一个文件装好几页，
 * 而 25 MB 之外基本就不是「看一眼结果」了。
 */
export const PDF_MAX_BYTES = 25 * 1024 * 1024
/** 一层目录最多列这么多。**超了要说省了多少**，不是悄悄截断 */
export const DIR_MAX_ENTRIES = 1000

/**
 * 默认忽略的目录。
 *
 * **忽略要能被看见**：调用方拿得到 `ignored` 计数，界面据此给一个开关，
 * 而不是让人以为这些目录不存在。
 */
export const DEFAULT_IGNORED = new Set([".git", "node_modules", ".dawn", "__pycache__", ".venv"])

export interface DirEntry {
  name: string
  kind: "file" | "dir"
  /** 文件字节数。目录没有这个字段——**目录的「大小」是个误导** */
  size?: number
  modifiedAt: string
}

export interface DirListing {
  /** 相对工作区的路径。根目录是空串 */
  path: string
  entries: DirEntry[]
  /** 被默认规则忽略掉的条目数。**摆出来**，否则人会以为它们不存在 */
  ignored: number
  /** 超过 `DIR_MAX_ENTRIES` 而没有列出的条目数 */
  omitted: number
}

export type FileContent =
  | { kind: "text"; mediaType: string; text: string; bytes: number; truncated?: { originalBytes: number; keptBytes: number } }
  | { kind: "image"; mediaType: string; base64: string; bytes: number }
  /**
   * PDF（②-A′ · F5）。**与图片分开一档**：它在界面上走的是完全不同的一条路
   * （blob + `<embed>`，交给 Chromium 自带的阅读器），
   * 混进 `image` 会让界面拿 `<img>` 去画一个 PDF——那是一个空框。
   */
  | { kind: "pdf"; mediaType: string; base64: string; bytes: number }
  /** 认不出或太大。**说清是什么、多大**，而不是给一片空白 */
  | {
      kind: "table"
      mediaType: string
      bytes: number
      /** 表本身。形状见 `files/table.ts` */
      table: import("./table.js").表格
    }
  | { kind: "other"; mediaType: string; bytes: number; reason: string }

/**
 * 把一个用户给的相对路径解析成真实路径，**并保证它在工作区内**。
 *
 * ## 为什么要 `realpath`
 *
 * `resolve(ws, "../etc/passwd")` 会得到工作区外的路径——字符串判断能挡住它。
 * **但符号链接挡不住**：`ws/link` 指向 `/etc` 时，`resolve` 的结果仍以 `ws` 开头。
 * 只有把两边都 `realpath` 之后再比，才是真的在比「同一棵树上的位置」。
 *
 * @throws {UserFacingError} 越界、或路径不存在
 */
export function resolveInWorkspace(workspace: string, relative: string): string {
  let root: string
  try {
    root = realpathSync(workspace)
  } catch {
    throw new UserFacingError(`工作区不存在或读不了：${workspace}`)
  }

  // **绝对路径一律拒绝**：这个接口的语义是「工作区内的相对路径」，
  // 允许绝对路径等于把守卫的判断权交给调用方
  if (relative.startsWith("/") || /^[A-Za-z]:[\\/]/.test(relative)) {
    throw new UserFacingError("只能读工作区内的文件（不接受绝对路径）")
  }

  const candidate = resolve(root, relative)
  let real: string
  try {
    real = realpathSync(candidate)
  } catch {
    throw new UserFacingError(`找不到：${relative}`)
  }

  // **前缀比对必须带分隔符**：否则 `/ws-evil` 会被判成 `/ws` 的子路径
  if (real !== root && !real.startsWith(root + sep)) {
    throw new UserFacingError(`拒绝：${relative} 在工作区之外`)
  }
  return real
}

/** 列一层目录。**不递归**——递归让「一次调用」的代价不可预期 */
export function listDirectory(
  workspace: string,
  relative = "",
  opts: { includeIgnored?: boolean } = {},
): DirListing {
  const dir = resolveInWorkspace(workspace, relative || ".")
  if (!statSync(dir).isDirectory()) throw new UserFacingError(`${relative} 不是目录`)

  const all = readdirSync(dir, { withFileTypes: true })
  let ignored = 0
  const kept: DirEntry[] = []
  for (const d of all) {
    if (!opts.includeIgnored && DEFAULT_IGNORED.has(d.name)) {
      ignored += 1
      continue
    }
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(join(dir, d.name))
    } catch {
      // 断链的符号链接之类。**跳过但计入 ignored**，不假装它不存在
      ignored += 1
      continue
    }
    kept.push({
      name: d.name,
      kind: st.isDirectory() ? "dir" : "file",
      ...(st.isDirectory() ? {} : { size: st.size }),
      modifiedAt: st.mtime.toISOString(),
    })
  }

  // 目录在前、同类按名字。**顺序稳定**——列表每次刷新都跳会让人失去方位
  kept.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
  const omitted = Math.max(0, kept.length - DIR_MAX_ENTRIES)
  return { path: relative, entries: kept.slice(0, DIR_MAX_ENTRIES), ignored, omitted }
}

/** 扩展名 → mime。**认不出就说认不出**，不猜一个 */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".py": "text/x-python",
  ".r": "text/x-r",
  ".ipynb": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".ts": "text/typescript",
  ".js": "text/javascript",
  ".html": "text/html",
  ".log": "text/plain",
}

export function mediaTypeOf(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream"
}

/**
 * 读一个**本地**文件供预览。只读，且带上界。
 *
 * 分类交给 `分类预览`——**它与远端那条共用同一份**。
 */
export function readFileForPreview(workspace: string, relative: string): FileContent {
  const file = resolveInWorkspace(workspace, relative)
  const st = statSync(file)
  if (st.isDirectory()) throw new UserFacingError(`${relative} 是目录，不是文件`)
  return 分类预览(file, st.size, (最多) => (最多 === undefined ? readFileSync(file) : 部分读(file, 最多)))
}

/**
 * 读前面若干字节。**不整个读进来**——嗅探与截断都只要开头那一段
 * （判据只看前十行，为此把一个 2GB 的日志整个读进来是荒唐的）。
 */
function 部分读(file: string, 最多: number): Buffer {
  const n = Math.max(0, 最多)
  const fd = openSync(file, "r")
  try {
    const buf = Buffer.alloc(n)
    const 读到 = readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, 读到)
  } catch {
    // 读不了就当空的：**后面那些分支会照常处理并如实报错**
    return Buffer.alloc(0)
  } finally {
    closeSync(fd)
  }
}

/**
 * 把一堆字节判成「该怎么显示」。**只有这一份**（2026-08-17，批 3）。
 *
 * 抽出来是因为远端文件也要走同一套：本地读盘、远端走 SFTP，
 * 而**分类必须是同一份**——两份的话，本地和远端会对同一个 `.csv`
 * 说两种话，而那种不一致没有任何地方会报出来。
 *
 * @param 名 只用来推 mediaType（看扩展名）。远端传的是那台机器上的路径。
 * @param 读 按需取字节。**给了上界就只取那么多**——嗅探表格只要 64 KB，
 *   为它把一个 800 MB 的文件整个搬过来是荒唐的。
 * @param 表格行上限 表读多少行。缺省是 `预览行数`（200，够看清形状）。
 *   **审阅那一屏要传一个大得多的数**：那边比的是两张表之间改了什么，
 *   只比前 200 行就下结论会骗人（2026-08-18）。**分类仍然只有这一份**——
 *   这个参数只改「读多少」，不改「这是什么」。
 */
export function 分类预览(
  名: string,
  bytes: number,
  读: (最多?: number) => Buffer,
  表格行上限?: number,
): FileContent {
  const mediaType = mediaTypeOf(名)

  if (mediaType.startsWith("image/")) {
    if (bytes > IMAGE_MAX_BYTES) {
      return {
        kind: "other",
        mediaType,
        bytes,
        // **说清多大**：人据此判断是自己写错了还是图确实该这么大
        reason: `图片有 ${Math.round(bytes / 1024 / 1024)} MB，超过 ${IMAGE_MAX_BYTES / 1024 / 1024} MB 没有显示`,
      }
    }
    return { kind: "image", mediaType, base64: 读().toString("base64"), bytes }
  }

  /**
   * **分隔文本读成表**（2026-08-14）。
   *
   * 此前 `.csv` 走 `text` 那一支，屏幕上是一坨逗号原文——
   * 一个叫 DAWN **Science** 的应用打开数据文件却看不见数据。
   *
   * 放在 `text` 之前：`text/csv` 也是 `text/`，顺序反了就永远走不到这儿。
   */
  /**
   * **`.txt` 看内容决定**（2026-08-14，作者要的）。
   *
   * 科研数据里 `.txt` 常是制表符分隔的表，但日志与笔记也是 `.txt`——
   * 按扩展名一律当表的话，一个日志会被读成一张乱表，**而且不报任何错**。
   * 判据在 `像表格吗()`：前几行的列数一致且不止一列。
   */
  const 可能是表 =
    mediaType === "text/csv" ||
    mediaType === "text/tab-separated-values" ||
    (mediaType === "text/plain" && 像表格吗(读(64 * 1024).toString("utf8")))

  if (可能是表) {
    const 完整 = bytes <= 表格字节上界
    // **超了只读前面那段**，而不是拒绝打开：看一眼形状比什么都看不到有用得多
    const buf = 完整 ? 读() : 读(表格字节上界)
    const 正文 = buf.subarray(0, 表格字节上界).toString("utf8")
    return { kind: "table", mediaType, bytes, table: 读成表(正文, 完整, 表格行上限) }
  }

  if (mediaType === "application/pdf") {
    if (bytes > PDF_MAX_BYTES) {
      return {
        kind: "other",
        mediaType,
        bytes,
        // **说清多大**：人据此判断是自己写错了还是它确实该这么大
        reason: `PDF 有 ${Math.round(bytes / 1024 / 1024)} MB，超过 ${PDF_MAX_BYTES / 1024 / 1024} MB 没有显示，用系统程序打开`,
      }
    }
    return { kind: "pdf", mediaType, base64: 读().toString("base64"), bytes }
  }

  const 是文本 = mediaType.startsWith("text/") || mediaType === "application/json"
  if (!是文本) {
    return {
      kind: "other",
      mediaType,
      bytes,
      reason: `这是 ${mediaType}，暂时不能在应用里预览`,
    }
  }

  const buf = 读(TEXT_MAX_BYTES + 1)
  if (buf.byteLength <= TEXT_MAX_BYTES) {
    return { kind: "text", mediaType, text: buf.toString("utf8"), bytes }
  }
  /**
   * 按**字节**截断并修掉被切坏的那个多字节字符。
   * 直接 `slice` 对中文会切出乱码——与内核输出那边同一条纪律。
   */
  const cut = buf.subarray(0, TEXT_MAX_BYTES)
  const text = new TextDecoder("utf-8").decode(cut).replace(/�+$/, "")
  return {
    kind: "text",
    mediaType,
    text,
    bytes,
    truncated: { originalBytes: bytes, keptBytes: Buffer.byteLength(text, "utf8") },
  }
}
