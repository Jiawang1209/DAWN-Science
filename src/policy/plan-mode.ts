/**
 * 方案期的门（先出方案，2026-09-27，spec `2026-09-27-先出方案-design.md` §4.1）。
 *
 * ## 为什么在代码里拦，不在提示词里求
 *
 * 「先别动」写进提示词，模型照样可能顺手 `run_code` 一段、写一个文件——**靠提示词管住的门等于没有门**
 * （权限三档定案 1 同一个道理）。所以方案期由这里判，`native.ts` 在建会话时给**每一件**自定义工具套一层。
 *
 * ## 默认拒
 *
 * 与 `看风险()`「不认识的工具一律放行」**相反**：那边放行是因为默认拒会让「加一个工具」变成「悄悄坏掉一个功能」；
 * 这边只在方案期生效、而方案期的承诺是「只看不改」——新工具不表态就拦，宁可多拦，不可漏放。拒绝理由告诉模型怎么办。
 *
 * ## 方案期没有 bash（2026-09-28）
 *
 * 第一版给 bash 配了一张「只读命令名单」逐段判。安全审查半天找出二十来条绕过：引号拆词（`-de''lete`、`'-exec'`）、
 * 选项缩写（`sort --o=`、`git log --outp=`）、名单里命令的冷门写文件开关（`rg --hostname-bin`、`uniq - out`、`tree -H`、`file --comp`）……
 * **shell 的词法比我们的正则大**，补一条还有下一条。所以方案期 **bash / powershell 整件拒**，名单删掉——少一段会写错的代码。
 * 看目录、搜文件改用 pi 自带的 `ls` / `grep` / `find`：参数是类型化的，`rg` / `fd` 用 `--` 隔开、不过 shell。
 *
 * ## 已批准的方案文件（D3），两道
 *
 * ①**门**（这里的 `碰已批准`，方案期内外都生效）：写工具的路径——大小写不敏感的盘上按不敏感比、`realpath` 过符号链接；
 *   bash 的字面写入 / 删除目标；bash 目标看不清、却提到 `plans` 或方案文件名的，拒。
 * ②**指纹**（下半截的 `存档方案` / `核对方案` / `恢复方案` / `核对并恢复`）：门总有看不见的写法（`run_code` 里 `open(…, "w")`、
 *   通配藏住的路径），所以批准时记 sha256、在会话目录（工作区外）留一份存档；运行时读方案、对照、每轮结束时核对，
 *   被改了就恢复并**响亮地说**（spec §4.4、计划 Task 5）。
 */
import { createHash } from "node:crypto"
import { lstatSync, readlinkSync, realpathSync } from "node:fs"
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { 删除目标, 写入目标, type 门的决定 } from "./permissions.js"
import { 出方案工具名, 看数据工具名 } from "../protocol/plan.js"

/**
 * 方案期直接放行的工具。**只有这几件**——MCP 有专门的判据，别的一律拒。
 * `ls` / `grep` / `find` 是 pi 的类型化工具（`@earendil-works/pi-coding-agent` `core/tools/{ls,grep,find}.js`），不过 shell。
 * **运行时得真把这三件交给模型**（计划 Task 5 的注），不然方案期就只剩 `read`。
 */
export const 方案期放行: ReadonlySet<string> = new Set([
  "read",
  "ls",
  "grep",
  "find",
  "look_at_image",
  "read_main_session",
  出方案工具名,
  看数据工具名,
])

/** 方案期整件拒的 shell 类工具 */
const shell工具 = new Set(["bash", "powershell"])

const 先出方案 = "现在是「先出方案」：只能看、不能改。"

export interface 方案期语境 {
  /** 这段会话此刻在不在方案期 */
  方案期: boolean
  /** 已批准的方案文件，相对工作区（`plans.json` 里记的就是这个） */
  已批准: readonly string[]
  workspace: string
  /** 这件是 MCP 服务器自己声明 `readOnlyHint: true` 的工具（D6） */
  mcp只读?: boolean
  /** 文件系统按哪个平台的规矩比路径。缺省 `process.platform`；darwin / win32 大小写不敏感。测试用 */
  平台?: NodeJS.Platform
}

// ── 路径：已批准的方案文件 ──

/** 读路径的工具：参数里的路径是读，不算碰（`read` 读方案文件天经地义） */
const 只读取工具 = new Set(["read", "ls", "grep", "find", "look_at_image", "read_main_session", 看数据工具名, 出方案工具名])
/** 写类工具里哪些参数名是路径：pi 的 `path`，插件的 `output` / `file_path` / `dest`…… */
const 路径参数名 = /path|file|output|dest|target/i

/**
 * 能落到盘上的那个路径：从最长的**已存在**前缀 `realpath`，剩下的原样接上。
 * 末段是悬空的符号链接时顺着链接走（写会跟着它建文件）。只看**本机**；远端会话的门判不了远端的链接——那条靠指纹。
 */
function 真路径(p: string, 深 = 0): string {
  const 剩: string[] = []
  let 当前 = p
  for (;;) {
    try {
      return join(realpathSync.native(当前), ...剩)
    } catch {
      if (深 < 8) {
        try {
          if (lstatSync(当前).isSymbolicLink()) return 真路径(join(resolve(dirname(当前), readlinkSync(当前)), ...剩), 深 + 1)
        } catch {
          // 不存在：往上一层
        }
      }
    }
    const 上 = dirname(当前)
    if (上 === 当前) return p
    剩.unshift(basename(当前))
    当前 = 上
  }
}

function 比较形(p: string, 平台: NodeJS.Platform): string {
  const n = resolve(p).normalize("NFC")
  return 平台 === "darwin" || 平台 === "win32" ? n.toLowerCase() : n
}

/** 一个目标（相对或绝对）是不是某份已批准的方案文件。相对路径**只按工作区解析**——命令里的 `cd` 不跟（那种归「看不清」） */
function 是已批准(目标: string, 语境: 方案期语境): boolean {
  const 平台 = 语境.平台 ?? process.platform
  const 绝对 = isAbsolute(目标) ? resolve(目标) : resolve(语境.workspace, 目标)
  const 目标形 = new Set([绝对, 真路径(绝对)].map((p) => 比较形(p, 平台)))
  const 工作区们 = [...new Set([resolve(语境.workspace), 真路径(resolve(语境.workspace))])]
  for (const a of 语境.已批准) {
    for (const w of 工作区们) {
      const 批 = resolve(w, a)
      for (const p of [批, 真路径(批)]) if (目标形.has(比较形(p, 平台))) return true
    }
  }
  return false
}

/**
 * 一条 bash 命令提到 `plans`（大小写不论）或某份已批准文件的文件名，而它的**写入 / 删除目标看不清**时拒。
 * 「看得清」只有一种：每一段都是下面这几个只读命令、没有重定向写（`2>/dev/null` `2>&1` 除外）、没有变量与命令替换。
 * 别的（`sed -i`、`truncate`、`rm *`、`git checkout --`、`cd plans && rm`、`python -c`……）我们判不出它写不写方案——
 * 而既然它提到了方案，就不赌。**误伤只落在提到 plans 的命令上**，理由说清。
 */
const 提到时能跑的 = new Set(["cat", "head", "tail", "wc", "ls", "stat", "md5sum", "sha256sum", "shasum", "grep"])

function 看得清只读(cmd: string): boolean {
  if (/[`$\\]|<\(|>\(|<<|\r/.test(cmd)) return false
  const 去无害 = cmd.replace(/2>(\/dev\/null|&1)(?=$|[\s;&|])/g, " ")
  if (/>/.test(去无害)) return false
  const 段 = 去无害.split(/\|\||&&|;|\n|\||&/).map((s) => s.trim()).filter(Boolean)
  return 段.length > 0 && 段.every((句) => 提到时能跑的.has(句.split(/\s+/)[0]!))
}

function 提到方案(cmd: string, 语境: 方案期语境): boolean {
  if (/(^|[\s/'"=])plans([\s/'";&|)]|$)/i.test(cmd)) return true
  const 低 = cmd.toLowerCase()
  return 语境.已批准.some((a) => 低.includes(basename(a).toLowerCase()))
}

const 碰的理由 = (p: string) =>
  `拒绝改动 ${p}：这是已批准的分析方案（预注册），批准后不改。做法和方案不一样的地方，做完时在回复里逐条说明。`

/** 动了已批准的方案文件 → 拒绝理由；没动 → undefined */
export function 碰已批准(工具名: string, 参数: Record<string, unknown>, 语境: 方案期语境): string | undefined {
  if (语境.已批准.length === 0) return undefined
  if (shell工具.has(工具名)) {
    const cmd = typeof 参数.command === "string" ? 参数.command : ""
    const 删 = 删除目标(cmd)
    for (const t of [...写入目标(cmd), ...(删 === "看不清" ? [] : 删)]) {
      if (是已批准(t, 语境)) return 碰的理由(t)
    }
    if (提到方案(cmd, 语境) && !看得清只读(cmd)) {
      return (
        `拒绝执行 \`${cmd}\`：它提到了已批准的方案目录或方案文件，又看不清会写或删什么。` +
        `已批准的方案（${语境.已批准.join("、")}）批准后不改；要看它用 read。`
      )
    }
    return undefined
  }
  if (只读取工具.has(工具名)) return undefined
  for (const [k, v] of Object.entries(参数)) {
    if (typeof v === "string" && v && 路径参数名.test(k) && 是已批准(v, 语境)) return 碰的理由(v)
  }
  return undefined
}

/**
 * 方案期门的决定。**只回 allow / deny**——方案期没有「问一句」：人要批的是整份方案，不是一次调用。
 * 放行之后照样要过权限门（`native.ts` 里方案期门套在最外面、先判）。
 */
export function 方案期判(工具名: string, 参数: Record<string, unknown>, 语境: 方案期语境): 门的决定 {
  const 碰 = 碰已批准(工具名, 参数, 语境)
  if (碰) return { kind: "deny", reason: 碰 }
  if (!语境.方案期) return { kind: "allow" }
  if (方案期放行.has(工具名)) return { kind: "allow" }
  if (shell工具.has(工具名)) {
    return {
      kind: "deny",
      reason:
        `${先出方案}方案期不跑 ${工具名}。看目录用 ls，搜内容用 grep，找文件用 find，读文件用 read，` +
        "看数据的结构用 inspect_data；要跑的命令写进方案，批了再跑。",
    }
  }
  if (语境.mcp只读) return { kind: "allow" }
  if (工具名 === "run_code") {
    return {
      kind: "deny",
      reason:
        `${先出方案}run_code 会改内核里的状态，方案期不跑。` +
        "要看数据的结构（行列数、列类型、缺失、前几行、单变量分布）用 inspect_data；分析本身写进方案，批了再跑。",
    }
  }
  return { kind: "deny", reason: `${先出方案}${工具名} 会改东西，方案期不用。把这一步写进方案（propose_plan），批了再做。` }
}

// ── 指纹、存档、核对、恢复（D3 第二道，2026-09-28）──
//
// 只管**本机**文件。远端会话的方案文件在服务器上：运行时走会话执行器做同样的事（计划 Task 5 的注）。

/** 方案文件的指纹：sha256 十六进制 */
export function 方案指纹(内容: string | Uint8Array): string {
  return createHash("sha256").update(内容).digest("hex")
}

/**
 * 一版方案在会话目录里的文件名：**按 `planId` 取，不按方案文件名**（2026-09-28 审查）——文件名只在一个工作区里唯一，
 * 换个工作区、或者人删了再批出同名的一份，按文件名存会互相盖掉。`planId` 是模型给的 toolCallId，字符不可控：
 * 只留安全的几类、截短，再接一段它的指纹，保证不撞、不出目录。
 */
export function 方案存档名(planId: string): string {
  const 净 = planId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48)
  return `${净}-${方案指纹(planId).slice(0, 12)}.md`
}

/** 存档放在会话目录的 `plans/` 下，按 `planId` 取名（见 `方案存档名`） */
export function 存档位置(会话目录: string, planId: string): string {
  return join(会话目录, "plans", 方案存档名(planId))
}

/** 批准时调：读工作区里刚写好的方案文件，算指纹，拷一份进会话目录（工作区外，agent 的写工具碰不到它的常规路径） */
export async function 存档方案(a: { workspace: string; 相对: string; 会话目录: string; planId: string }): Promise<{ sha256: string; 存档: string }> {
  const 内容 = await readFile(resolve(a.workspace, a.相对))
  const 存档 = 存档位置(a.会话目录, a.planId)
  await mkdir(dirname(存档), { recursive: true })
  await writeFile(存档, 内容)
  return { sha256: 方案指纹(内容), 存档 }
}

/** 工作区里那份还是不是批准时那一份。被换成符号链接也算「被改过」——内容对得上也不行，链接那头随时能变 */
export async function 核对方案(a: { workspace: string; 相对: string; sha256: string }): Promise<"完好" | "被改过" | "不见了"> {
  const p = resolve(a.workspace, a.相对)
  try {
    if ((await lstat(p)).isSymbolicLink()) return "被改过"
    return 方案指纹(await readFile(p)) === a.sha256 ? "完好" : "被改过"
  } catch {
    return "不见了"
  }
}

/**
 * 从存档写回。存档自己也要对得上指纹，否则抛（不拿一份坏存档去「修」）。
 * 目标先摘掉（被换成链接的只摘链接，不顺着写到别处），再 `wx` 新建；方案目录本身被换成指向别处的链接 → 抛。
 */
export async function 恢复方案(a: { workspace: string; 相对: string; 存档: string; sha256: string }): Promise<void> {
  const 内容 = await readFile(a.存档)
  if (方案指纹(内容) !== a.sha256) throw new Error(`方案的存档 ${a.存档} 也对不上批准时的指纹，不拿它恢复`)
  const p = resolve(a.workspace, a.相对)
  await mkdir(dirname(p), { recursive: true })
  const 应在 = resolve(await realpath(a.workspace), dirname(a.相对))
  if ((await realpath(dirname(p))) !== 应在) throw new Error(`方案目录 ${dirname(a.相对)} 被换成了指向别处的链接，不往那边写`)
  await rm(p, { recursive: true, force: true })
  await writeFile(p, 内容, { flag: "wx" })
}

/**
 * 恢复之后补的一句（2026-09-28 审查）：指纹分不出是谁改的，一轮里改的都算 agent 的——人在这一轮里改、又没说一声的，也会被恢复。
 * 所以恢复时把出路说出来。
 */
export const 恢复后提醒 = "。如果这是你改的，把改动再说一次或重新提方案"

export interface 已批准存档 {
  相对: string
  sha256: string
  存档: string
}

/**
 * 逐份核对，被改的、不见的都恢复；每一份出一句**给人看的**话（运行时把它当通知发出去，不静默修）。完好的不出声。
 * 恢复失败也出声，说恢复不了、为什么。
 */
export async function 核对并恢复(workspace: string, 记录: readonly 已批准存档[]): Promise<string[]> {
  const 话: string[] = []
  for (const r of 记录) {
    if ((await 核对方案({ workspace, 相对: r.相对, sha256: r.sha256 })) === "完好") continue
    try {
      await 恢复方案({ workspace, ...r })
      话.push(`批准过的方案被改动过，已从存档恢复：${r.相对}${恢复后提醒}`)
    } catch (e) {
      话.push(`批准过的方案被改动过，恢复不了（${e instanceof Error ? e.message : String(e)}）：${r.相对}`)
    }
  }
  return 话
}

