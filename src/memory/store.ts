/**
 * 记忆存储核心(2026-08-25,学自 dsh-memory-evolve `lib/store.js`,Hermes 血统;
 * 规格 `specs/2026-08-25-记忆-design.md`)。
 *
 * 三轨,全部确认制的**注入轨**:
 *   - user   → `<全局目录>/USER.md`(用户档案)
 *   - memory → `<全局目录>/MEMORY.md`(全局事实)
 *   - key    → `<工作区>/.dawn/memory/KEY.md`(项目关键记忆,可进 git——
 *              换机器 clone 即同步,dsh 那套条目级合并器因此整个不用抄)
 *
 * 格式:纯文本,条目用 `\n§\n` 分隔(与 Hermes/dsh 字节兼容),**人可直接编辑**。
 * 因此三件安全带一件不少:
 *   1. drift guard——全文件重写(改/删/归档)前验磁盘内容 round-trip 过解析器,
 *      不过就备份 `.bak.<ts>` 并响亮拒绝;append 免检但拒绝「文件存在却读空」。
 *   2. 目录锁——锁文件带 pid,先探存活再看 mtime 超时;进程内可重入。
 *   3. 写入威胁扫描——「忽略之前的指令」类提示注入表述拒收。
 *
 * 头文法(程序维护的元数据,编辑只换正文):
 *   `[id:8hex]?` → `[YYYY-MM-DD]?` → `[branch:a,b]?` → 正文
 * **`[id:]` 只解析不生成**(为将来跨机合并留锚,dsh 施工图 §4);
 * 时间戳与 [branch:] 由程序盖——模型手写的日期剥掉重盖(声明 vs 观察,不变式 5)。
 */
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"

export const ENTRY_DELIMITER = "\n§\n"

export type 记忆轨 = "user" | "memory" | "key"

export function parseEntries(text: string): string[] {
  return text
    .split(ENTRY_DELIMITER)
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
}

export function serializeEntries(entries: string[]): string {
  return entries.join(ENTRY_DELIMITER) + "\n"
}

/** 文件是不是它自己条目的规范序列化。空白文件算规范(正常空库)。 */
export function isCanonical(text: string): boolean {
  return text.trim() === "" || serializeEntries(parseEntries(text)) === text
}

/** 头文法:[id:] → 日期 → [branch:],与 splitEntryHead 同一序列 */
const 头正则 = /^(?:\[id:[0-9a-f]{8}\]\s*)?(?:\[\d{4}-\d{2}-\d{2}\]\s*)?(?:\[branch:[^\]]*\]\s*)?/

/** 拆头与正文。编辑条目时用 head + 新正文重写——程序元数据不许被编辑改动。 */
export function splitEntryHead(entry: string): { head: string; body: string } {
  const m = 头正则.exec(String(entry ?? "").trim())
  const head = m?.[0] ?? ""
  return { head, body: String(entry ?? "").trim().slice(head.length) }
}

/** [branch:a,b] 的分支范围;null = 没有标记 = 全部分支可见。 */
export function parseEntryBranches(entry: string): string[] | null {
  const m = /(?:^(?:\[id:[0-9a-f]{8}\]\s*)?(?:\[\d{4}-\d{2}-\d{2}\]\s*)?)\[branch:([^\]]*)\]/.exec(
    String(entry ?? "").trim(),
  )
  if (m === null) return null
  const 列 = m[1]!.split(",").map((b) => b.trim()).filter(Boolean)
  return 列.length > 0 ? 列 : null
}

/** 剥条目最前的 [id:](展示与去重比较用;身份证是内部锚点,不进模型上下文)。 */
export function stripEntryId(entry: string): string {
  return String(entry ?? "").replace(/^\[id:[0-9a-f]{8}\]\s*/, "")
}

export function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * 盖戳:剥掉模型手写的日期前缀(它不知道今天几号,只会猜——dsh 原话
 * "writers do not know the current date and guess"),拼 [branch:](有的话),
 * 盖上今天。已带今天格式戳的内容幂等。
 */
export function 盖戳(content: string, branches?: string[]): string {
  let 正 = String(content ?? "").trim().replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, "")
  const 支 = (branches ?? []).map((b) => String(b).trim()).filter(Boolean)
  if (支.length > 0 && !/^\[branch:/.test(正)) 正 = `[branch:${支.join(",")}] ${正}`
  return `[${todayStamp()}] ${正}`
}

/** 提示注入扫描(dsh 五条原样)。命中回一句给人看的拒绝理由。 */
const 威胁 = [
  /ignore\s+(all\s+)?(previous|prior|earlier|above|your)\s+(instructions?|prompts?|messages?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|earlier|above|your)\s+(instructions?|prompts?|messages?|rules?)/i,
  /forget\s+(all|everything|your\s+instructions)/i,
  /忽略(所有|之前|以上|先前)(的)?(指令|指示|提示|规则)/,
  /无视(所有|之前|以上|先前)(的)?(指令|指示|提示|规则)/,
]
export function scanThreat(text: string): string | undefined {
  for (const p of 威胁) {
    if (p.test(text)) {
      return "内容包含疑似提示注入的表述(如「忽略指令」),已拒绝写入。确为有意内容的话,请在记忆屏手动添加。"
    }
  }
  return undefined
}

/** 当前 git 分支;非 git 仓库 / 拿不到 → undefined(调用方回退「不过滤」)。 */
export function gitBranch(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined
  try {
    const r = spawnSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (r.error || r.status !== 0) return undefined
    const b = String(r.stdout ?? "").trim()
    return b === "" ? undefined : b
  } catch {
    return undefined
  }
}

/* ── 目录锁(dsh :344-419):锁文件带 pid,先探存活再看 mtime ── */

const STALE_LOCK_MS = 10_000
const LOCK_TIMEOUT_MS = 5_000
const LOCK_RETRY_MS = 25
const 已持锁 = new Set<string>()

function 锁过期(lockPath: string): boolean {
  try {
    const info = statSync(lockPath)
    try {
      const owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number }
      if (typeof owner.pid === "number") {
        try {
          process.kill(owner.pid, 0) // 信号 0 = 只探测存活
          return false
        } catch {
          return true // 持有者已死(断电/中断残留)
        }
      }
    } catch {
      // 无 pid / 不可解析 → 按 mtime 判
    }
    return Date.now() - info.mtimeMs > STALE_LOCK_MS
  } catch {
    return false
  }
}

function 睡(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function withLock<T>(dir: string, fn: () => T): T {
  if (已持锁.has(dir)) return fn()
  const lockPath = join(dir, ".memory.lock")
  mkdirSync(dir, { recursive: true })
  const 死线 = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    let 拿到 = false
    try {
      const fd = openSync(lockPath, "wx")
      try {
        writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: Date.now() }))
      } finally {
        closeSync(fd)
      }
      拿到 = true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
    }
    if (拿到) break
    if (锁过期(lockPath)) rmSync(lockPath, { force: true })
    if (Date.now() >= 死线) throw new Error("记忆:等锁超时(另一个进程占着记忆目录)")
    睡(LOCK_RETRY_MS)
  }
  已持锁.add(dir)
  try {
    return fn()
  } finally {
    已持锁.delete(dir)
    rmSync(lockPath, { force: true })
  }
}

/* ── 三轨 store ── */

export interface 写结果 {
  ok: boolean
  message: string
  duplicate?: boolean
  /** remove 成功时:被删整条原文(归档等「移动」场景直接用,免二次匹配) */
  removed?: string
}

export interface 轨上下文 {
  /** key 轨必给:项目工作区(KEY.md 落它的 .dawn/memory/) */
  workspace?: string
  /** add 到 key 时的分支范围(空/缺省 = 全部分支) */
  branches?: string[]
}

export class MemoryStore {
  constructor(private readonly 全局目录: string) {}

  /** 轨 → {目录, 文件名}。key 无工作区抛人话。 */
  private 定位(target: 记忆轨, ctx?: 轨上下文, 归档 = false): { dir: string; file: string } {
    if (target === "user") return { dir: this.全局目录, file: 归档 ? "USER-archive.md" : "USER.md" }
    if (target === "memory") return { dir: this.全局目录, file: 归档 ? "MEMORY-archive.md" : "MEMORY.md" }
    if (!ctx?.workspace) throw new Error("记忆:key 轨需要项目工作区(当前没有活跃项目)")
    return { dir: join(ctx.workspace, ".dawn", "memory"), file: 归档 ? "KEY-archive.md" : "KEY.md" }
  }

  private 读(loc: { dir: string; file: string }): { text: string; size: number } {
    const p = join(loc.dir, loc.file)
    try {
      return { text: readFileSync(p, "utf8"), size: statSync(p).size }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { text: "", size: 0 }
      throw e
    }
  }

  private 原子写(loc: { dir: string; file: string }, entries: string[]): void {
    mkdirSync(loc.dir, { recursive: true })
    const p = join(loc.dir, loc.file)
    const tmp = `${p}.tmp.${process.pid}`
    writeFileSync(tmp, serializeEntries(entries))
    renameSync(tmp, p)
  }

  /**
   * 锁内重载(全文件重写用):drift 则备份并给出 kind。
   * 「存在却读空」按不可读拒——重写它会抹掉历史。
   */
  private 重载(loc: { dir: string; file: string }):
    | { kind: "ok"; entries: string[] }
    | { kind: "read-failed" }
    | { kind: "drift"; backup: string } {
    const { text, size } = this.读(loc)
    if (text === "" && size > 0) return { kind: "read-failed" }
    if (!isCanonical(text)) {
      const backup = `${join(loc.dir, loc.file)}.bak.${Date.now()}`
      writeFileSync(backup, text)
      return { kind: "drift", backup }
    }
    return { kind: "ok", entries: parseEntries(text) }
  }

  entries(target: 记忆轨, ctx?: 轨上下文): string[] {
    return parseEntries(this.读(this.定位(target, ctx)).text)
  }

  archived(target: 记忆轨, ctx?: 轨上下文): string[] {
    return parseEntries(this.读(this.定位(target, ctx, true)).text)
  }

  /** 追加一条(append-only,免 drift guard):扫描 → 盖戳 → 去重 → 落盘。 */
  add(target: 记忆轨, content: string, ctx?: 轨上下文): 写结果 {
    let loc: { dir: string; file: string }
    try {
      loc = this.定位(target, ctx)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    const 正 = String(content ?? "").trim()
    if (!正) return { ok: false, message: "记忆:内容为空,没有可写的" }
    const 险 = scanThreat(正)
    if (险) return { ok: false, message: 险 }
    const 戳好 = 盖戳(正, target === "key" ? ctx?.branches : undefined)
    return withLock(loc.dir, () => {
      const { text, size } = this.读(loc)
      if (text === "" && size > 0) return { ok: false, message: "记忆:文件读不出来,拒绝写入以免抹掉历史" }
      const entries = parseEntries(text)
      // 去重按剥 [id:] 后的全文比;另按正文比一次——同一句话昨天记过,今天再记只是换了日期戳
      const 新正文 = splitEntryHead(戳好).body
      if (entries.some((e) => stripEntryId(e) === stripEntryId(戳好) || splitEntryHead(e).body === 新正文)) {
        return { ok: true, duplicate: true, message: "已有一模一样的条目,没有重复添加" }
      }
      this.原子写(loc, [...entries, 戳好])
      return { ok: true, message: `已写入 ${target}(现 ${entries.length + 1} 条)` }
    })
  }

  /** 唯一子串命中一条;0 条 / 多条都拒绝(匹配是判据,歧义不动手)。 */
  private 命中(entries: string[], match: string): { index: number } | { error: string } {
    const q = String(match ?? "").trim()
    if (!q) return { error: "记忆:匹配片段为空" }
    const 命 = entries.filter((e) => e.includes(q))
    if (命.length === 0) return { error: `记忆:没有包含「${q}」的条目` }
    if (命.length > 1) return { error: `记忆:「${q}」命中 ${命.length} 条,换个更长的片段` }
    return { index: entries.indexOf(命[0]!) }
  }

  /** 只换正文,头(id/日期/branch)原样保留。全文件重写 → drift guard。 */
  updateBody(target: 记忆轨, match: string, newBody: string, ctx?: 轨上下文): 写结果 {
    let loc: { dir: string; file: string }
    try {
      loc = this.定位(target, ctx)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    const 正 = String(newBody ?? "").trim()
    if (!正) return { ok: false, message: "记忆:新正文为空(想删就用删除)" }
    if (正.includes("§")) return { ok: false, message: "记忆:正文不能包含条目分隔符 §" }
    const 险 = scanThreat(正)
    if (险) return { ok: false, message: 险 }
    return withLock(loc.dir, () => {
      const r = this.重载(loc)
      if (r.kind === "drift") {
        return { ok: false, message: `记忆:${loc.file} 被手工改过,不敢整文件重写;原文已备份到 ${r.backup},请手动处理` }
      }
      if (r.kind === "read-failed") return { ok: false, message: "记忆:文件读不出来,拒绝重写" }
      const 命 = this.命中(r.entries, match)
      if ("error" in 命) return { ok: false, message: 命.error }
      const { head } = splitEntryHead(r.entries[命.index]!)
      const next = [...r.entries]
      next[命.index] = `${head}${正}`
      this.原子写(loc, next)
      return { ok: true, message: "已更新(头部元数据原样保留)" }
    })
  }

  remove(target: 记忆轨, match: string, ctx?: 轨上下文): 写结果 {
    let loc: { dir: string; file: string }
    try {
      loc = this.定位(target, ctx)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    return withLock(loc.dir, () => {
      const r = this.重载(loc)
      if (r.kind === "drift") {
        return { ok: false, message: `记忆:${loc.file} 被手工改过,不敢整文件重写;原文已备份到 ${r.backup},请手动处理` }
      }
      if (r.kind === "read-failed") return { ok: false, message: "记忆:文件读不出来,拒绝重写" }
      const 命 = this.命中(r.entries, match)
      if ("error" in 命) return { ok: false, message: 命.error }
      const removed = r.entries[命.index]!
      const next = [...r.entries]
      next.splice(命.index, 1)
      this.原子写(loc, next)
      return { ok: true, message: `已删除(余 ${next.length} 条)`, removed }
    })
  }

  /**
   * 归档:**先归档后删除**(dsh 三步:peek → 写归档 → 删主轨)。
   * 归档写入失败时主轨原样;删除失败时归档多一条可手清——宁重复不丢失。
   */
  archive(target: 记忆轨, match: string, ctx?: 轨上下文): 写结果 {
    let loc: { dir: string; file: string }
    let 归loc: { dir: string; file: string }
    try {
      loc = this.定位(target, ctx)
      归loc = this.定位(target, ctx, true)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    return withLock(loc.dir, () => {
      const r = this.重载(loc)
      if (r.kind === "drift") {
        return { ok: false, message: `记忆:${loc.file} 被手工改过,不敢动;原文已备份到 ${r.backup}` }
      }
      if (r.kind === "read-failed") return { ok: false, message: "记忆:文件读不出来,拒绝操作" }
      const 命 = this.命中(r.entries, match)
      if ("error" in 命) return { ok: false, message: 命.error }
      const 原文 = r.entries[命.index]!
      this.原子写(归loc, [...parseEntries(this.读(归loc).text), 原文])
      const next = [...r.entries]
      next.splice(命.index, 1)
      this.原子写(loc, next)
      return { ok: true, message: "已归档(不再注入;记忆屏归档页可转正)" }
    })
  }

  /** 转正:归档条剥日期戳后 add 回主轨(重新盖今天的戳),成功再删归档条。 */
  promote(target: 记忆轨, match: string, ctx?: 轨上下文): 写结果 {
    let 归loc: { dir: string; file: string }
    try {
      归loc = this.定位(target, ctx, true)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    return withLock(归loc.dir, () => {
      const 归条 = parseEntries(this.读(归loc).text)
      const 命 = this.命中(归条, match)
      if ("error" in 命) return { ok: false, message: 命.error }
      const 原文 = 归条[命.index]!
      const body = stripEntryId(原文).replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "")
      const r = this.add(target, body, ctx)
      if (!r.ok && !r.duplicate) return r
      const next = [...归条]
      next.splice(命.index, 1)
      this.原子写(归loc, next)
      return { ok: true, message: "已移回主记忆(下一段会话生效)" }
    })
  }
}
