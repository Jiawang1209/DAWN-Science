/**
 * 工作区文件访问（②-B · F1）。**只读。**
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
 * **写、删、改名一概不做。** 这一阶段只读——写操作要走授权门（阶段 ④），
 * 混进来会让一个「看看结果」的功能变成一把刀。
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { UserFacingError } from "../errors.js"

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
   * PDF（②-B · F5）。**与图片分开一档**：它在界面上走的是完全不同的一条路
   * （blob + `<embed>`，交给 Chromium 自带的阅读器），
   * 混进 `image` 会让界面拿 `<img>` 去画一个 PDF——那是一个空框。
   */
  | { kind: "pdf"; mediaType: string; base64: string; bytes: number }
  /** 认不出或太大。**说清是什么、多大**，而不是给一片空白 */
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

/** 读一个文件供预览。**只读，且带上界** */
export function readFileForPreview(workspace: string, relative: string): FileContent {
  const file = resolveInWorkspace(workspace, relative)
  const st = statSync(file)
  if (st.isDirectory()) throw new UserFacingError(`${relative} 是目录，不是文件`)

  const mediaType = mediaTypeOf(file)
  const bytes = st.size

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
    return { kind: "image", mediaType, base64: readFileSync(file).toString("base64"), bytes }
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
    return { kind: "pdf", mediaType, base64: readFileSync(file).toString("base64"), bytes }
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

  const buf = readFileSync(file)
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
