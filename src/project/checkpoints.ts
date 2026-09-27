/**
 * 回退这一轮的影子存档（2026-09-27，spec `2026-09-27-回退这一轮-design.md`）。
 *
 * ## 为什么不是 git
 *
 * 科研仓库把 `out/`、`figures/` 写进 `.gitignore`，临时会话根本不是仓库；影子 git（另起一个 `GIT_DIR`）
 * 又要求机器上有新版 git、会被工作区里的 `.gitattributes`（LFS 过滤器）左右。我们只要「整文件退回某一版」，
 * 所以只用 Node `fs`：扫描复用 `fs-facts.ts`，旧版本用 `COPYFILE_FICLONE` 存（APFS 上是克隆、几乎不占地方，别的盘退回真拷贝）。
 *
 * ## 为什么不只跟踪编辑工具（Claude Code 的做法）
 *
 * 科研工作的主路径是 bash 跑脚本、`run_code` 在内核里写文件——只跟踪 write / edit 等于只退了最不要紧的那部分。
 * 所以按**工作区**拍，不按工具拍：这一句第一件工具之前一张（存内容），这一轮收尾一张（只 stat）。
 *
 * ## 三份东西
 *
 * - `snapshots.jsonl`：一行一张快照，只记对上一张的增量（全量 2 万条 × 每轮两张会把盘吃掉）；
 * - `ledger.jsonl`：一串「段」——`turn`（一句）/ `rewind`（一次回退本身）/ `gap`（断档），外加一行 `origin`；
 * - `objects/`：旧版本本体，按 stat 身份起名，不算哈希（不必把 50 MB 的文件读一遍）。
 *
 * **原始数据目录不存、不碰**：判据只有 `在原始数据里()`，目录名只从 `science-layout.ts` 取（设计契约扫描）。
 */
import { appendFileSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { copyFile, rename, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { fsSnapshot, FS_SNAPSHOT_CAP, type FsEntry } from "./fs-facts.js"
import { 原始数据目录 } from "../policy/science-layout.js"

/** 单个文件超过它就不存旧版本（spec §0.3）。改了它，回退时列在「退不回」 */
export const 单个文件上限 = 50 * 1024 * 1024
/** 每段会话存档的总量（逻辑大小，APFS 克隆省下的不抵扣——宁可早说满） */
export const 存档总上限 = 2 * 1024 * 1024 * 1024

export type 跳过原因 = "too_large" | "over_budget" | "raw_data"

export interface 清单条 {
  ino: number
  mtimeMs: number
  size: number
  /** 这一版存在 `objects/` 里叫什么。缺 = 这一版没存（只拍了 stat，或被跳过） */
  obj?: string
  /** 存下来时的权限位（只留 0o777），改回去时照设——`chmod +x` 过的脚本退回去还要能跑 */
  mode?: number
  skip?: 跳过原因
}
export type 清单 = Map<string, 清单条>

export type 断档原因 = "too_many_files" | "store_error"
export type 段 =
  | { kind: "turn"; entry: string; start: string; end?: string }
  | { kind: "rewind"; start: string; end?: string }
  | { kind: "gap"; entry?: string; reason: 断档原因 }

type 账行 = { op: "origin"; leaf: string | null } | { op: "open"; seg: 段 } | { op: "end"; end: string }
interface 快照行 {
  id: string
  at: string
  set: Record<string, 清单条>
  del: string[]
}

export interface 存档选项 {
  /** 工作区文件数上限，缺省沿用 `FS_SNAPSHOT_CAP` */
  cap?: number
  单个上限?: number
  总上限?: number
  /** 失败出声（规格 7.5）：每种原因每段会话只喊一次，不然一轮几十次工具调用就刷几十条 */
  喊?: (话: string) => void
  now?: () => Date
}

export const 同一版 = (a: Pick<FsEntry, "ino" | "mtimeMs" | "size"> | undefined, b: Pick<FsEntry, "ino" | "mtimeMs" | "size"> | undefined): boolean =>
  !!a && !!b && a.ino === b.ino && a.mtimeMs === b.mtimeMs && a.size === b.size

/** **唯一的判据**。`p` 是相对工作区的 posix 路径（`fsSnapshot` 给的就是这种） */
export const 在原始数据里 = (p: string): boolean => p === 原始数据目录 || p.startsWith(`${原始数据目录}/`)

const 对象名 = (e: Pick<FsEntry, "ino" | "mtimeMs" | "size">) => `${e.size}-${e.ino}-${String(e.mtimeMs).replace(".", "_")}`

export const 人话字节 = (n: number): string =>
  n >= 1024 ** 3 ? `${Number((n / 1024 ** 3).toFixed(1))} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`

function 套(旧: 清单, 行: 快照行): 清单 {
  const 新 = new Map(旧)
  for (const [p, e] of Object.entries(行.set)) 新.set(p, e)
  for (const p of 行.del) 新.delete(p)
  return 新
}

/** 这一行里**真变了**的路径：只多了 `obj`（这一版补存上了）不算变 */
function 变了(旧: 清单, 新: 清单, 行: 快照行): string[] {
  return [...Object.keys(行.set).filter((p) => !同一版(旧.get(p), 新.get(p))), ...行.del]
}

export class 检查点存档 {
  private readonly 账: string
  private readonly 快照账: string
  private readonly 对象: string
  private readonly 段们: 段[] = []
  private 起点值: string | null | undefined
  private 最新: { id: string; 清单: 清单 } | undefined
  private 序 = 0
  private 字节 = 0
  /** 一个接一个做：两件工具并行开头、收尾撞上下一句开头，都排在这条链上 */
  private 链: Promise<unknown> = Promise.resolve()
  private readonly 喊过 = new Set<string>()
  private readonly 坏行: string[] = []

  constructor(
    private readonly workspace: string,
    dir: string,
    private readonly 选项: 存档选项 = {},
  ) {
    this.账 = join(dir, "ledger.jsonl")
    this.快照账 = join(dir, "snapshots.jsonl")
    this.对象 = join(dir, "objects")
    mkdirSync(this.对象, { recursive: true })
    for (const 行 of this.读行<账行>(this.账)) this.吃(行)
    let 清: 清单 = new Map()
    for (const 行 of this.读行<快照行>(this.快照账)) {
      清 = 套(清, 行)
      this.最新 = { id: 行.id, 清单: 清 }
      this.序 = Math.max(this.序, Number(行.id.slice(1)) || 0)
    }
    for (const f of readdirSync(this.对象)) if (!f.endsWith(".tmp")) this.字节 += statSync(join(this.对象, f)).size
    // 崩在写一半的那一行：丢掉它，但要说出来（规格 7.5）
    if (this.坏行.length > 0) this.喊一次("bad_lines", `回退存档里有 ${this.坏行.length} 行没读懂（多半是上次写到一半），跳过了。`)
  }

  /** 存档从哪条之后开始。`undefined` = 还没记（刚建的） */
  起点(): string | null | undefined {
    return this.起点值
  }

  /** 只记第一次：续上的会话不改它——那之前的几句「在开始存档之前」 */
  记起点(leaf: string | null): void {
    if (this.起点值 !== undefined) return
    this.记({ op: "origin", leaf })
  }

  /** 测试与诊断用：段的副本 */
  段落(): 段[] {
    return this.段们.map((s) => ({ ...s }))
  }

  /**
   * 这一句的第一件工具之前：拍一张开头，把「上次存过之后变了的」存下来。同一句第二次来什么都不做。
   * **永不 reject**：拍不上就记断档并喊一声——工具照常执行，只是这一句以后回退不了文件。
   */
  开轮(entry: string): Promise<void> {
    return this.排(async () => {
      const 末 = [...this.段们].reverse().find((s) => s.kind !== "rewind")
      if (末 && "entry" in 末 && 末.entry === entry) return
      try {
        const id = await this.拍(true)
        if (!id) return this.记({ op: "open", seg: { kind: "gap", entry, reason: "too_many_files" } })
        this.收上一段(id)
        this.记({ op: "open", seg: { kind: "turn", entry, start: id } })
      } catch (e) {
        this.喊一次("store_error", `回退存档出错了，这一句动的文件以后退不回：${e instanceof Error ? e.message : String(e)}`)
        this.记({ op: "open", seg: { kind: "gap", entry, reason: "store_error" } })
      }
    })
  }

  /** 这一轮收尾：只拍 stat。之后你再改的，下一次回退据此认成「你后来改过」 */
  收尾(): Promise<void> {
    return this.排(async () => {
      const 末 = this.段们.at(-1)
      if (!末 || 末.kind === "gap" || 末.end) return
      try {
        const id = await this.拍(false)
        if (id) this.记({ op: "end", end: id })
        else this.记({ op: "open", seg: { kind: "gap", reason: "too_many_files" } })
      } catch (e) {
        this.喊一次("store_error", `回退存档出错了，这一句动的文件以后退不回：${e instanceof Error ? e.message : String(e)}`)
        this.记({ op: "open", seg: { kind: "gap", reason: "store_error" } })
      }
    })
  }

  private 排<T>(f: () => Promise<T>): Promise<T> {
    const p = this.链.then(f)
    this.链 = p.catch(() => {})
    return p
  }

  private 记(行: 账行): void {
    appendFileSync(this.账, `${JSON.stringify(行)}\n`)
    this.吃(行)
  }

  private 吃(行: 账行): void {
    if (行.op === "origin") this.起点值 = 行.leaf
    else if (行.op === "open") this.段们.push({ ...行.seg })
    else {
      const 末 = this.段们.at(-1)
      if (末 && 末.kind !== "gap" && !末.end) 末.end = 行.end
    }
  }

  private 收上一段(id: string): void {
    const 末 = this.段们.at(-1)
    if (末 && 末.kind !== "gap" && !末.end) this.记({ op: "end", end: id })
  }

  private 读行<T>(f: string): T[] {
    if (!existsSync(f)) return []
    return readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as T]
        } catch {
          this.坏行.push(l)
          return []
        }
      })
  }

  private 喊一次(键: string, 话: string): void {
    if (this.喊过.has(键)) return
    this.喊过.add(键)
    this.选项.喊?.(话)
  }

  private 此刻(): Date {
    return this.选项.now?.() ?? new Date()
  }

  /** 扫一遍，记一张增量快照；`拷` 时把没存过的这一版存下来。扫不动（超上限）返回 undefined */
  private async 拍(拷: boolean): Promise<string | undefined> {
    const cap = this.选项.cap ?? FS_SNAPSHOT_CAP
    const 扫到 = fsSnapshot(this.workspace, cap)
    if (!扫到) {
      this.喊一次("too_many_files", `工作区超过 ${cap} 个文件，没法存档：这之后动的文件回退不了（对话还能撤）。`)
      return undefined
    }
    const 旧 = this.最新?.清单 ?? new Map<string, 清单条>()
    const 新: 清单 = new Map()
    const set: Record<string, 清单条> = {}
    for (const [p, e] of 扫到) {
      const was = 旧.get(p)
      let 条: 清单条 = was && 同一版(was, e) ? was : { ino: e.ino, mtimeMs: e.mtimeMs, size: e.size }
      if (拷 && 条.obj === undefined && 条.skip === undefined) 条 = await this.存(p, 条)
      新.set(p, 条)
      if (条 !== was) set[p] = 条
    }
    const del = [...旧.keys()].filter((p) => !扫到.has(p))
    const id = `s${++this.序}`
    const 行: 快照行 = { id, at: this.此刻().toISOString(), set, del }
    appendFileSync(this.快照账, `${JSON.stringify(行)}\n`)
    this.最新 = { id, 清单: 新 }
    return id
  }

  /** 存一个文件的这一版。扫完之后它变了或没了：这一版不存（下一次开头再存） */
  private async 存(p: string, 条: 清单条): Promise<清单条> {
    if (在原始数据里(p)) return { ...条, skip: "raw_data" }
    const 单个 = this.选项.单个上限 ?? 单个文件上限
    if (条.size > 单个) return { ...条, skip: "too_large" }
    const 源 = join(this.workspace, p)
    let st
    try {
      st = await stat(源)
    } catch {
      return 条
    }
    if (!同一版(st, 条)) return 条
    const 名 = 对象名(条)
    const 到 = join(this.对象, 名)
    const mode = st.mode & 0o777
    if (existsSync(到)) return { ...条, obj: 名, mode }
    const 总 = this.选项.总上限 ?? 存档总上限
    if (this.字节 + 条.size > 总) {
      this.喊一次(
        "over_budget",
        `这段会话的回退存档满了（${人话字节(总)}）：之后改动的文件不再存旧版本，回退时会一个个列出来。`,
      )
      return { ...条, skip: "over_budget" }
    }
    await copyFile(源, `${到}.tmp`, constants.COPYFILE_FICLONE)
    // 拷的途中它又被改了：这份不对版，不留
    if (!同一版(await stat(源), 条)) {
      await unlink(`${到}.tmp`).catch(() => {})
      return 条
    }
    await rename(`${到}.tmp`, 到)
    this.字节 += 条.size
    return { ...条, obj: 名, mode }
  }
}
