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
import { randomBytes } from "node:crypto"
import { appendFileSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, type Stats } from "node:fs"
import { chmod, copyFile, link, lstat, mkdir, realpath, rename, rmdir, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, sep } from "node:path"
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
  /**
   * **只给测试用**（2026-09-27）：在回退的几个节骨眼上插一脚，演「扫完之后、挪的途中又有人动了它」这类竞争。
   * `开始挪`：计划算完、第一件挪动之前；`换下之后`：现在那份刚进废纸篓、旧版本还没就位。
   */
  插一脚?: (时机: "开始挪" | "换下之后", path: string) => void | Promise<void>
}

export const 同一版 = (a: Pick<FsEntry, "ino" | "mtimeMs" | "size"> | undefined, b: Pick<FsEntry, "ino" | "mtimeMs" | "size"> | undefined): boolean =>
  !!a && !!b && a.ino === b.ino && a.mtimeMs === b.mtimeMs && a.size === b.size

/** **唯一的判据**。`p` 是相对工作区的 posix 路径（`fsSnapshot` 给的就是这种） */
export const 在原始数据里 = (p: string): boolean => p === 原始数据目录 || p.startsWith(`${原始数据目录}/`)

const 对象名 = (e: Pick<FsEntry, "ino" | "mtimeMs" | "size">) => `${e.size}-${e.ino}-${String(e.mtimeMs).replace(".", "_")}`
/** `对象名()` 起出来的只会是这个样子；别的（被人改过的存档）不认——`../x` 会读到存档外面去 */
const 对象名合法 = (n: unknown): n is string => typeof n === "string" && /^\d+-\d+-[\d_e+-]+$/.test(n)

/**
 * 存档里的路径只可能是 `fsSnapshot` 给的相对 posix 路径（2026-09-27）。带 `..`、绝对路径、反斜杠的，
 * 只可能是会话目录被人改过——认了它，回退就会往工作区外面写。
 */
export const 路径合法 = (p: unknown): p is string =>
  typeof p === "string" &&
  p.length > 0 &&
  !p.includes("\\") &&
  !p.includes("\0") &&
  !isAbsolute(p) &&
  !/^[A-Za-z]:/.test(p) &&
  p.split("/").every((s) => s !== "" && s !== "." && s !== "..")

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

export interface 回退计划 {
  restore: string[]
  remove: string[]
  keep: { path: string; reason: "changed_after" }[]
  cannot: { path: string; reason: 跳过原因 | "not_stored"; size?: number }[]
}
export type 文件回退不了 = "before_archive" | "gap" | "too_many_files"
export type 计划结果 = ({ ok: true } & 回退计划) | { ok: false; reason: 文件回退不了 }

/** 第 N 句是哪几条：第 N 句及之后（当前对话分支上）的用户消息 entry id；`在存档之前` 由运行时对着 `起点()` 判 */
export interface 计划问 {
  之后的用户: readonly string[]
  在存档之前: boolean
}

export interface 回退结果 {
  restored: string[]
  removed: string[]
  keep: 回退计划["keep"]
  cannot: 回退计划["cannot"]
  failed: { path: string; message: string }[]
  /** 挪走的、换下来的放在哪儿（相对工作区，posix）。一个都没挪就没有 */
  trash?: string
}

/** `no_archive`：这段会话压根没有存档（远端、关掉了）——由运行时抛，与预览的缘故同名（2026-09-27 Task 4 复审） */
export class 回退不了 extends Error {
  constructor(readonly reason: 文件回退不了 | "no_archive") {
    super(`文件回退不了（${reason}）`)
    this.name = "回退不了"
  }
}

type 内部计划 = { ok: false; reason: 文件回退不了 } | { ok: true; 公开: 回退计划; 恢复: { path: string; obj: string; mode: number | undefined }[] }
const 空计划 = (): 回退计划 => ({ restore: [], remove: [], keep: [], cannot: [] })
const 说 = (e: unknown) => (e instanceof Error ? e.message : String(e))
const 码 = (e: unknown) => (e as NodeJS.ErrnoException | undefined)?.code

/** 回退拒绝碰的那种情形：原因写给人看，原样进 `failed` */
class 不碰 extends Error {}

const 种类 = (st: Stats) =>
  st.isDirectory() ? "目录" : st.isSymbolicLink() ? "符号链接" : st.isFIFO() ? "管道" : st.isSocket() ? "套接字" : "特殊文件"

/** 只有 ENOENT 算「没有」；别的错（权限、I/O）照抛——不能把「看不见」当成「不存在」然后放心覆盖 */
async function 看(abs: string): Promise<Stats | undefined> {
  try {
    return await lstat(abs)
  } catch (e) {
    if (码(e) === "ENOENT") return undefined
    throw e
  }
}

/**
 * 把 `从` 放到 `到`，**不顶掉**那里已有的东西：`link` 在目标已存在时报 EEXIST（`rename` 会悄悄覆盖）。
 * 盘不支持硬链接（exFAT、有的网络盘）才退回 `rename`，且只在此刻目标确实不在时——那一瞬的竞争窗口是剩下的风险。
 */
async function 不覆盖地放(从: string, 到: string): Promise<void> {
  try {
    await link(从, 到)
  } catch (e) {
    const c = 码(e)
    if (c === "EEXIST" || !["EPERM", "ENOTSUP", "EOPNOTSUPP", "EMLINK", "ENOSYS"].includes(c ?? "")) throw e
    if (await 看(到)) throw Object.assign(new Error(`EEXIST: ${到} 已存在`), { code: "EEXIST" })
    await rename(从, 到)
    return
  }
  await unlink(从).catch(() => {})
}

/** 废纸篓清单里的一条：挪了什么、挪到哪、为什么 */
type 挪动缘由 = "not_there_before" | "replaced" | "appeared_during_rewind" | "put_back"

/**
 * 影子存档（2026-09-27）。
 *
 * **已知边界：收尾之后还在写的后台写手**（Task 4 复审记下）——bash 里 `&` 放出去的进程、团队成员、内核异步吐出来的文件：
 * 它们在这一句的「结尾」拍完之后才落盘，存档分不出那是 agent 还是你，只能当成「你后来改过的」（`keep: changed_after`），
 * **留着不退**。方向是安全的（宁可少退、不会把你的东西覆盖掉），但确认框与通知里会点名它们，别当成 bug。见 spec「已知边界」。
 */
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
    for (const 行 of this.读快照()) {
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
        this.喊一次("store_error", `回退存档出错了，这一句动的文件以后退不回：${说(e)}`)
        this.记不丢({ op: "open", seg: { kind: "gap", entry, reason: "store_error" } })
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
        this.喊一次("store_error", `回退存档出错了，这一句动的文件以后退不回：${说(e)}`)
        this.记不丢({ op: "open", seg: { kind: "gap", reason: "store_error" } })
      }
    })
  }

  /** 回到第 N 句之前，文件这一半会怎样。只读（扫一遍此刻） */
  计划(q: 计划问): Promise<计划结果> {
    return this.排(async () => {
      const r = this.算计划(q)
      return r.ok ? { ok: true as const, ...r.公开 } : r
    })
  }

  /**
   * 照计划做。**先拍一张 stat、记一段 `rewind`，做完再拍一张收尾**——回退本身算「我们的」，下一次往前退时不当成你改的。
   * 改回去的顺序：旧版本先拷到旁边的临时名、设回权限，再把现在那份挪进废纸篓，最后「不覆盖地」就位——中途失败，现在那份不丢。
   *
   * 数据安全（2026-09-27 审查复现过的几条，挪的是你的科研文件）：
   * - **不写到工作区外面**：每一级父目录 `lstat` 过、不许是链接，父目录的 realpath 必须在工作区里——`rm -rf out && ln -s 别处 out` 之后
   *   不跟着链接写过去；`.dawn`、`.dawn/trash` 是链接也一样。
   * - **不在没留副本的情况下覆盖或挪走任何东西**：只挪普通文件（目录、链接、管道一律不碰，进 `failed`）；就位用 `link`（目标已有就 EEXIST，
   *   不像 `rename` 那样悄悄顶掉半路冒出来的那个）。
   * - **做了什么都要交代，哪怕只做了一半**：挪动阶段不 reject，出事的那一件进 `failed`、已做的照列；废纸篓里先写一份 `manifest.json`，每挪一件追加一条。
   * @throws 回退不了（在存档之前 / 断档 / 扫不动）——这时一个文件都还没动
   */
  回退(q: 计划问): Promise<回退结果> {
    return this.排(async () => {
      const r = this.算计划(q)
      if (!r.ok) throw new 回退不了(r.reason)
      const 结果: 回退结果 = { restored: [], removed: [], keep: r.公开.keep, cannot: r.公开.cannot, failed: [] }
      if (r.公开.remove.length === 0 && r.恢复.length === 0) return 结果
      const 开 = await this.拍(false)
      if (!开) throw new 回退不了("too_many_files")
      this.收上一段(开)
      this.记({ op: "open", seg: { kind: "rewind", start: 开 } })
      // 从这里起文件开始动：之后无论出什么事都要走到 finally 把这一段收住、把结果交回去
      let 用过篓 = false
      let 篓相对: string | undefined
      let 手上 = ""
      try {
        const 根实 = await realpath(this.workspace)
        const 时刻 = this.此刻()
        let 篓: { 相对: string }
        try {
          篓 = await this.开废纸篓(根实, 时刻)
        } catch (e) {
          // 废纸篓开不了（`.dawn` 被换成链接、盘只读）：一件都不挪——没地方留副本就不动
          for (const p of [...r.公开.remove, ...r.恢复.map((x) => x.path)]) 结果.failed.push({ path: p, message: `废纸篓开不了（${说(e)}），没动它` })
          return 结果
        }
        篓相对 = 篓.相对
        const 清单 = { rewind: 篓.相对, at: 时刻.toISOString(), planned: { restore: r.公开.restore, remove: r.公开.remove }, moved: [] as { path: string; to: string; why: 挪动缘由 }[], done: false }
        const 清单名 = this.清单名(r.公开)
        const 写清单 = () => {
          try {
            writeFileSync(join(this.workspace, 篓.相对, 清单名), `${JSON.stringify(清单, null, 2)}\n`)
          } catch (e) {
            this.喊一次("manifest", `回退的废纸篓清单写不进去（${说(e)}）：挪走的文件照样在 ${篓.相对}/ 里。`)
          }
        }
        写清单()

        /** 把 p 挪进废纸篓。那里本来就没有 → undefined；不是普通文件 → 不碰（抛 `不碰`） */
        const 挪走 = async (p: string, why: 挪动缘由): Promise<string | undefined> => {
          const 源 = await this.落点(根实, p, false)
          const st = await 看(源)
          if (!st) return undefined
          if (!st.isFile()) throw new 不碰(`现在那里是${种类(st)}，不是普通文件，没动它`)
          let 篓里 = `${篓.相对}/${p}`
          // 同一件挪两次（换下来的那份 + 半路冒出来的那份）：各留各的，不互相顶掉
          for (let k = 2; await 看(join(this.workspace, 篓里)); k++) 篓里 = `${篓.相对}/${p}~${k}`
          const 到 = await this.落点(根实, 篓里, true)
          await rename(源, 到)
          用过篓 = true
          清单.moved.push({ path: p, to: 篓里, why })
          写清单()
          return 篓里
        }

        await this.选项.插一脚?.("开始挪", "")
        for (const p of r.公开.remove) {
          手上 = p
          try {
            if (await 挪走(p, "not_there_before")) 结果.removed.push(p)
          } catch (e) {
            结果.failed.push({ path: p, message: 说(e) })
          }
        }
        for (const x of r.恢复) {
          手上 = x.path
          let 临时: string | undefined
          let 换下: string | undefined
          let 到: string | undefined
          try {
            if (!对象名合法(x.obj)) throw new 不碰("存档里这一版的名字不对（存档被改过？），没动它")
            到 = await this.落点(根实, x.path, true)
            临时 = `${到}.dawn-rewind-${randomBytes(4).toString("hex")}.tmp`
            // EXCL：临时名撞上已有的东西就失败，不覆盖
            await copyFile(join(this.对象, x.obj), 临时, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
            if (x.mode !== undefined) await chmod(临时, x.mode)
            换下 = await 挪走(x.path, "replaced")
            await this.选项.插一脚?.("换下之后", x.path)
            try {
              await 不覆盖地放(临时, 到)
            } catch (e) {
              if (码(e) !== "EEXIST") throw e
              // 换下之后原处又冒出一个（别的进程刚写的）：它也先进废纸篓，再试一次；还不行就算了
              await 挪走(x.path, "appeared_during_rewind")
              await 不覆盖地放(临时, 到)
            }
            临时 = undefined
            结果.restored.push(x.path)
          } catch (e) {
            if (临时) await unlink(临时).catch(() => {})
            let message = 说(e)
            if (换下 && 到) {
              // 现在那份已经进了废纸篓、旧版本没就位：放回原处；放不回就说清它在哪儿
              try {
                await 不覆盖地放(join(this.workspace, 换下), 到)
                清单.moved.push({ path: x.path, to: x.path, why: "put_back" })
                写清单()
                message += "；现在那份已放回原处"
              } catch {
                message += `；现在那份在 ${换下}`
              }
            }
            结果.failed.push({ path: x.path, message })
          }
        }
        清单.done = true
        写清单()
        // 一件都没挪：把只装着清单的空目录收掉（只删我们自己刚建的这两样，不递归）
        if (!用过篓) {
          await unlink(join(this.workspace, 篓.相对, 清单名)).catch(() => {})
          await rmdir(join(this.workspace, 篓.相对)).catch(() => {})
        }
      } catch (e) {
        // 没料到的错：停在这里，已做的照样交代
        结果.failed.push({ path: 手上, message: `回退中途出错，停在这里：${说(e)}` })
      } finally {
        await this.收回退段()
      }
      return 用过篓 && 篓相对 ? { ...结果, trash: 篓相对 } : 结果
    })
  }

  /** 回退做完（或做到一半出了事）：拍一张收尾。拍不上就记断档——不然这一段一直开着，你之后改的会被当成回退改的 */
  private async 收回退段(): Promise<void> {
    try {
      const 收 = await this.拍(false)
      if (收) this.记({ op: "end", end: 收 })
      else this.记不丢({ op: "open", seg: { kind: "gap", reason: "too_many_files" } })
    } catch (e) {
      this.喊一次("store_error", `回退之后没拍上收尾（${说(e)}）：再往前的回退会说「断档」。`)
      this.记不丢({ op: "open", seg: { kind: "gap", reason: "store_error" } })
    }
  }

  /** 工作区下 `.dawn/trash/rewind-<时间>`；同一毫秒来两次就加 `-2`、`-3`——两次回退的东西不能混进一个目录 */
  private async 开废纸篓(根实: string, 时刻: Date): Promise<{ 相对: string }> {
    await this.落点(根实, ".dawn/trash/_", true)
    const 基 = `rewind-${时刻.toISOString().replace(/[:.]/g, "-")}`
    for (let k = 1; ; k++) {
      const 名 = k === 1 ? 基 : `${基}-${k}`
      try {
        await mkdir(join(this.workspace, ".dawn", "trash", 名))
        return { 相对: `.dawn/trash/${名}` }
      } catch (e) {
        if (码(e) !== "EEXIST" || k > 1000) throw e
      }
    }
  }

  /** 清单叫 `manifest.json`；要挪的文件里正好有一个就叫这个名字（工作区根上的 manifest.json），换个名字，不和它撞 */
  private 清单名(计划: 回退计划): string {
    const 占 = new Set([...计划.remove, ...计划.restore].map((p) => p.split("/")[0]))
    for (let k = 1; ; k++) {
      const 名 = k === 1 ? "manifest.json" : `manifest-${k}.json`
      if (!占.has(名)) return 名
    }
  }

  /**
   * 工作区里一条相对路径的绝对位置——前提是**落笔安全**（2026-09-27，审查复现过 `out` 被换成指向外面的链接）：
   * 每一级父目录 `lstat`，不许是链接、不许是文件；`建` 时缺的父目录一级一级建（不用 `recursive`，它会穿过链接）；
   * 最后父目录的 realpath 必须在工作区的 realpath 里（`/var` 与 `/private/var` 这种工作区本身是链接的，比 realpath 就对了）。
   * 父目录不存在且不 `建`：直接返回——目标自然也不存在。
   */
  private async 落点(根实: string, p: string, 建: boolean): Promise<string> {
    if (!路径合法(p)) throw new 不碰(`路径不合法（${p}），没动它`)
    const 段 = p.split("/")
    let 当前 = this.workspace
    for (let k = 0; k < 段.length - 1; k++) {
      当前 = join(当前, 段[k]!)
      let st = await 看(当前)
      if (!st && 建) {
        await mkdir(当前).catch((e) => {
          if (码(e) !== "EEXIST") throw e
        })
        st = await 看(当前)
      }
      const 名 = 段.slice(0, k + 1).join("/")
      if (!st) return join(this.workspace, p)
      if (st.isSymbolicLink()) throw new 不碰(`${名} 是符号链接，不跟进去（可能指到工作区外面），没动它`)
      if (!st.isDirectory()) throw new 不碰(`${名} 现在不是目录（是${种类(st)}），没动它`)
    }
    const 父实 = await realpath(dirname(join(this.workspace, p)))
    if (父实 !== 根实 && !父实.startsWith(根实 + sep)) throw new 不碰(`${p} 实际落在工作区外面（${父实}），没动它`)
    return join(this.workspace, p)
  }

  private 算计划(q: 计划问): 内部计划 {
    if (q.在存档之前) return { ok: false, reason: "before_archive" }
    const 候选 = new Set(q.之后的用户)
    const i = this.段们.findIndex((s) => s.kind === "turn" && 候选.has(s.entry))
    const 断 = this.段们.some(
      (s, k) => s.kind === "gap" && ((s.entry !== undefined && 候选.has(s.entry)) || (i >= 0 && k > i)),
    )
    if (断) return { ok: false, reason: "gap" }
    if (i < 0) return { ok: true, 公开: 空计划(), 恢复: [] }
    const S = (this.段们[i] as Extract<段, { kind: "turn" }>).start
    const 此刻 = fsSnapshot(this.workspace, this.选项.cap ?? FS_SNAPSHOT_CAP)
    if (!此刻) return { ok: false, reason: "too_many_files" }

    const 我们的 = new Set(this.段们.flatMap((s) => (s.kind !== "gap" && s.end ? [`${s.start}>${s.end}`] : [])))
    const P = new Set<string>()
    const 你的 = new Set<string>()
    let 清: 清单 = new Map()
    let 前: string | undefined
    let S清: 清单 | undefined
    for (const 行 of this.读快照()) {
      const 旧 = 清
      清 = 套(清, 行)
      if (S清) for (const p of 变了(旧, 清, 行)) (我们的.has(`${前}>${行.id}`) ? P : 你的).add(p)
      if (行.id === S) S清 = 清
      前 = 行.id
    }
    if (!S清) return { ok: false, reason: "gap" } // 账上有这段、快照里没有它的开头：当断档，不猜
    /**
     * 最后一张 → 此刻：通常是「你的」。例外是最后一段还开着（应用在一轮中途崩了、没拍上结尾）——
     * 那时它开头到此刻都算「我们的」（spec §7）。
     */
    const 末 = this.段们.at(-1)
    const 末开着 = !!末 && 末.kind !== "gap" && !末.end
    for (const p of new Set([...清.keys(), ...此刻.keys()])) if (!同一版(清.get(p), 此刻.get(p))) (末开着 ? P : 你的).add(p)

    const 公开 = 空计划()
    const 恢复: { path: string; obj: string; mode: number | undefined }[] = []
    for (const p of [...P].sort()) {
      if (在原始数据里(p)) {
        公开.cannot.push({ path: p, reason: "raw_data" })
        continue
      }
      if (你的.has(p)) {
        公开.keep.push({ path: p, reason: "changed_after" })
        continue
      }
      const 旧版 = S清.get(p)
      const 现 = 此刻.get(p)
      if (!旧版) {
        if (现) 公开.remove.push(p)
        continue
      }
      if (同一版(旧版, 现)) continue
      if (旧版.obj) {
        公开.restore.push(p)
        恢复.push({ path: p, obj: 旧版.obj, mode: 旧版.mode })
        continue
      }
      公开.cannot.push({ path: p, reason: 旧版.skip ?? "not_stored", size: 旧版.size })
    }
    return { ok: true, 公开, 恢复 }
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

  /**
   * 出错路径上记断档：写不进账本也**不许抛**（`开轮` / `收尾` 答应过永不 reject）。写不进去时这段会话里仍按断档算（内存里记上），
   * 并喊一声——重开之后账上没有这条，那是盘出了问题，只能说出来。
   */
  private 记不丢(行: 账行): void {
    try {
      this.记(行)
    } catch (e) {
      this.吃(行)
      this.喊一次("ledger_error", `回退账本写不进去（${说(e)}）：这段会话之后动的文件可能退不回。`)
    }
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

  /**
   * 读快照账，顺手把不认的条目剔掉（2026-09-27）：路径不合法（`..`、绝对路径、反斜杠）的整条不认，
   * `obj` 名字不对的只当「这一版没存」。它们只可能来自被改过的会话目录——认了就会往工作区外面写、从存档外面读。
   */
  private 读快照(): 快照行[] {
    let 不认 = 0
    const 行们 = this.读行<快照行>(this.快照账).flatMap((行) => {
      if (!行 || typeof 行.id !== "string" || typeof 行.set !== "object" || !行.set || !Array.isArray(行.del)) {
        不认++
        return []
      }
      const set: Record<string, 清单条> = {}
      for (const [p, e] of Object.entries(行.set)) {
        if (!路径合法(p) || !e || typeof e !== "object") {
          不认++
          continue
        }
        if (e.obj !== undefined && !对象名合法(e.obj)) {
          不认++
          const { obj: _丢, ...其余 } = e
          set[p] = 其余
        } else set[p] = e
      }
      const del = 行.del.filter((p) => 路径合法(p) || (不认++, false))
      return [{ ...行, set, del }]
    })
    if (不认 > 0) this.喊一次("bad_keys", `回退存档里有 ${不认} 条路径或名字不认（存档目录可能被改过），跳过了，回退不会碰它们。`)
    return 行们
  }

  private 喊一次(键: string, 话: string): void {
    if (this.喊过.has(键)) return
    this.喊过.add(键)
    try {
      this.选项.喊?.(话)
    } catch {
      // 喊的人自己出错，不能反过来让存档 reject
    }
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
      // lstat：扫完之后它被换成了链接，就不跟过去把别处的文件读进存档
      st = await lstat(源)
    } catch {
      return 条
    }
    if (!st.isFile() || !同一版(st, 条)) return 条
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
    // objects 被换成了链接（会话目录被动过）：不往那里写
    if (lstatSync(this.对象).isSymbolicLink()) throw new Error("回退存档的 objects 目录是符号链接，不往里写")
    await copyFile(源, `${到}.tmp`, constants.COPYFILE_FICLONE)
    // 拷的途中它又被改了：这份不对版，不留
    if (!同一版(await lstat(源), 条)) {
      await unlink(`${到}.tmp`).catch(() => {})
      return 条
    }
    await rename(`${到}.tmp`, 到)
    this.字节 += 条.size
    return { ...条, obj: 名, mode }
  }
}
