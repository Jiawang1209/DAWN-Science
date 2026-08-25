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
 * 盖戳:把正文冒充的**程序元数据前缀**先剥干净,再由程序盖上今天的日期与
 * (可选的)分支作用域。元数据一律由程序掌控——正文以它们开头会劫持解析:
 * 把讲解性内容误当成作用域(`[branch:]`)、身份(`[id:]`)或时间戳。
 *
 * 三条剥离,顺序即头文法顺序:
 *   - `[id:8hex]`:身份证只有 sync 层生成,正文里的一律剥(审查 debug#14:否则
 *     头顺序变成 `[date][id:][date]`,stripEntryId 剥不掉,[id:] 泄进模型上下文);
 *   - **纯日期 / 日期+时分[:秒]**:剥模型手写的猜日期(它不知道今天几号)。
 *     **只认纯时间戳**,不动 `[2024-03-05 组会]` 这类带文字的标签(审查 debug#3:
 *     旧正则 `[^\]]*` 会把「组会」连方括号一起吞掉,静默丢内容);
 *   - `[branch:…]`:分支作用域只能由 `branches` 参数设(审查 debug#4:否则
 *     以 `[branch:dev]` 开头的讲解性正文会被当成 dev 专属,在别的分支整条消失;
 *     且显式 branches 会被正文里的标记悄悄覆盖)。
 */
export function 盖戳(content: string, branches?: string[]): string {
  let 正 = String(content ?? "").trim()
  正 = 正.replace(/^\[id:[0-9a-f]{8}\]\s*/, "")
  正 = 正.replace(/^\[\d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2}(?::\d{2})?)?\]\s*/, "")
  正 = 正.replace(/^\[branch:[^\]]*\]\s*/, "")
  const 支 = (branches ?? []).map((b) => String(b).trim()).filter(Boolean)
  if (支.length > 0) 正 = `[branch:${支.join(",")}] ${正}`
  return `[${todayStamp()}] ${正}`
}

/**
 * 去重比较键(审查 debug#1):剥 `[id:]` 与日期戳,**保留 `[branch:]` 与正文**。
 * 「同一句话昨天记过、今天换了日期戳」要判重(键相同);而 main 与 dev 上的
 * 同一句话作用域不同(`[branch:main] X` ≠ `[branch:dev] X`),键不同,不误判——
 * 旧实现只比正文(`splitEntryHead(e).body`),把两个分支的同句误判为重复,
 * 采纳后什么都没写却报「已写入」,dev 分支的记忆永久丢失。
 */
export function 去重键(entry: string): string {
  return stripEntryId(entry).replace(/^\[\d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2}(?::\d{2})?)?\]\s*/, "")
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
/** pid 存活时的持锁上限(审查 debug C8):超过它即使 pid 活着也当残留——记忆操作毫秒级,不该持锁这么久 */
const 持锁上限MS = 60_000
const LOCK_TIMEOUT_MS = 5_000
const LOCK_RETRY_MS = 25
const 已持锁 = new Set<string>()

/**
 * 判这把锁是不是残留。**返回它判定时看到的 mtimeMs**(不是 boolean)——
 * 调用方据此做 compare-and-delete:只删 mtime 没变过的那把(审查 debug C13)。
 * `null` = 不是残留 / 已经没了,不该删。
 */
function 锁残留于(lockPath: string): number | null {
  try {
    const info = statSync(lockPath)
    const 残留 = (是: boolean) => (是 ? info.mtimeMs : null)
    try {
      const owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number }
      if (typeof owner.pid === "number") {
        try {
          process.kill(owner.pid, 0) // 信号 0 = 只探测存活
          // **pid 存活也要有 mtime 上限**(审查 debug C8):记忆锁内操作是毫秒级的,
          // 若一把锁持有超过这个上限,几乎必然是崩溃残留 + pid 被系统复用给了别的进程——
          // 旧实现「pid 存活即有效」完全短路了 mtime 兜底,残留锁永久有效,该目录的记忆写入永久失败。
          return 残留(Date.now() - info.mtimeMs > 持锁上限MS)
        } catch {
          return 残留(true) // 持有者已死(断电/中断残留),或别的用户的进程(EPERM)——都当 stale
        }
      }
    } catch {
      // 无 pid / 不可解析 → 按 mtime 判
    }
    return 残留(Date.now() - info.mtimeMs > STALE_LOCK_MS)
  } catch {
    return null
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
    // **compare-and-delete**(审查 debug C13):判残留与删除之间有窗口——别的进程可能刚把这把
    // 残留锁删了、又建了一把新的自己的锁。若我们无条件 rm,就把人家刚拿到的活锁删了,两个进程一起进。
    // 只删「mtime 与判定时一致」的那把:别人重建过的话 mtime 变了,我们不动它。
    const 残留mtime = 锁残留于(lockPath)
    if (残留mtime !== null) {
      try {
        if (statSync(lockPath).mtimeMs === 残留mtime) rmSync(lockPath, { force: true })
      } catch {
        /* 已经被别人清了 */
      }
    }
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

  /**
   * 追加一条:扫描 → 盖戳 → 去重 → 落盘。
   *
   * **走 drift guard,和 updateBody/remove 一样**(审查 debug C7)。此前这里号称
   * 「append-only 免 drift」,可它其实是 `parseEntries`→整文件 `原子写` 的**全量重写**:
   * 文件被手工改成非规范形态时,旧路径不备份、直接把它归一重写掉——drift 信号(有人动过这个文件)
   * 被 add 悄悄抹平,`.bak` 永远不出现。全量重写就该受同一道 guard 管。
   */
  add(target: 记忆轨, content: string, ctx?: 轨上下文): 写结果 {
    let loc: { dir: string; file: string }
    try {
      loc = this.定位(target, ctx)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
    const 正 = String(content ?? "").trim()
    if (!正) return { ok: false, message: "记忆:内容为空,没有可写的" }
    // § 是条目分隔符:正文里带它会把一条记忆劈成两条,后半截丢日期戳与分支作用域,
    // 且 isCanonical 仍为 true(drift guard 永远不报)——审查 debug#2。与 updateBody 同一道校验。
    if (正.includes("§")) return { ok: false, message: "记忆:内容不能包含条目分隔符 §" }
    const 险 = scanThreat(正)
    if (险) return { ok: false, message: 险 }
    const 戳好 = 盖戳(正, target === "key" ? ctx?.branches : undefined)
    return withLock(loc.dir, () => {
      const r = this.重载(loc)
      if (r.kind === "drift") {
        return { ok: false, message: `记忆:${loc.file} 被手工改过,不敢整文件重写;原文已备份到 ${r.backup},请手动处理` }
      }
      if (r.kind === "read-failed") return { ok: false, message: "记忆:文件读不出来,拒绝写入以免抹掉历史" }
      const entries = r.entries
      // 去重:剥 [id:] 与日期戳、**保留分支作用域**再比(审查 debug#1)——
      // 同一句话跨日期判重,而 main/dev 上的同句不误判。
      const 目标键 = 去重键(戳好)
      if (entries.some((e) => 去重键(e) === 目标键)) {
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
    // **整条精确优先**(审查 debug J11):UI 传的是完整条目文本,即使它是另一条更长条目的
    // 子串(「喜欢 ggplot2」vs「喜欢 ggplot2 而不是 base」),也能精确命中自己那条——
    // 否则短的那条永远删不掉,屏上只给一句它做不到的「换个更长的片段」。[id:] 免疫。
    const 精确 = entries.filter((e) => e.trim() === q || stripEntryId(e).trim() === stripEntryId(q).trim())
    if (精确.length === 1) return { index: entries.indexOf(精确[0]!) }
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
