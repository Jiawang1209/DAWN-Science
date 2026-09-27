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
 * ## 这里只判，不执行
 *
 * 纯函数（除了 `node:path`），逐条可测。**已批准文件的保护**不管在不在方案期都生效（D3）。
 */
import { isAbsolute, relative, resolve, sep } from "node:path"
import { 删除目标, 写入目标, type 门的决定 } from "./permissions.js"
import { 出方案工具名, 看数据工具名 } from "../protocol/plan.js"

/** 方案期直接放行的工具。**只有这几件**——别的要么有专门的判据（bash、MCP），要么拒 */
export const 方案期放行: ReadonlySet<string> = new Set(["read", "look_at_image", "read_main_session", 出方案工具名, 看数据工具名])

/**
 * 方案期能跑的只读命令名。**只收看得懂的**：解释器（`python -c`）、`awk`（能 `system()`）、`sed`（`-i`）、`xargs`、`env`（能带着跑别的命令）一概不在。
 * 几个有写文件或跑别的命令开关的（`sort -o`、`uniq 入 出`、`tree -o`、`find -delete`、`rg --pre`、`nvidia-smi -pm`、`git --output`、`file -C`……）在下面单独判。
 */
const 只读命令名 = new Set([
  "ls", "pwd", "cat", "head", "tail", "wc", "file", "stat", "du", "df", "tree", "find", "grep", "egrep", "fgrep", "rg",
  "sort", "uniq", "cut", "tr", "nl", "column", "zcat", "md5sum", "sha256sum", "git", "echo", "which", "uname", "whoami",
  "nproc", "free", "nvidia-smi", "date",
])

const 先出方案 = "现在是「先出方案」：只能看、不能改。"

/** 这条 bash 为什么**不算**只读。算只读 → undefined */
export function 只读命令不成立(原cmd: string): string | undefined {
  const cmd = 原cmd.replace(/\\\r?\n/g, " ").trim()
  if (!cmd) return "命令是空的"
  if (/`|\$\(|<\(|>\(/.test(cmd)) return "里面有命令替换，看不清会跑什么"
  // 只认两种无害的重定向：丢掉 stderr、并进 stdout。**后面要是词界**——`2>/dev/nullx` 是写一个叫 nullx 的文件
  const 去掉无害重定向 = cmd.replace(/2>(\/dev\/null|&1)(?=$|[\s;&|])/g, " ")
  if (/>/.test(去掉无害重定向)) return "会把输出写进文件"
  // 单个 `&`（丢到后台）也是分句：`ls & rm a` 的第二句同样要判（2026-09-28 实现时补）
  const 段 = 去掉无害重定向.split(/\|\||&&|;|\n|\||&/).map((s) => s.trim()).filter(Boolean)
  for (const 句 of 段) {
    const 词 = 句.split(/\s+/)
    const 名 = 词[0]!
    const 参 = 词.slice(1)
    const 非选项 = 参.filter((w) => !w.startsWith("-"))
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(名)) return "带着环境变量赋值，看不清会跑什么"
    if (!只读命令名.has(名)) return `用到了 ${名}，它不在方案期能跑的只读命令里`
    if (名 === "find" && 参.some((w) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(w))) {
      return "find 带着会删东西或跑别的命令的动作"
    }
    // 短选项可以并在一起（`-ro out`），所以看整串里有没有那个字母（2026-09-28 实现时补）
    if (名 === "sort" && 参.some((w) => /^(-[^-]*o|--output)/.test(w))) return "sort -o 会写文件"
    if (名 === "sort" && 参.some((w) => /^--compress-program/.test(w))) return "sort --compress-program 会跑别的命令"
    if (名 === "uniq" && 非选项.length > 1) return "uniq 的第二个参数是输出文件"
    if (名 === "tree" && 参.some((w) => /^-[^-]*o/.test(w))) return "tree -o 会写文件"
    if (名 === "file" && 参.some((w) => /^-[^-]*C|^--compile/.test(w))) return "file -C 会写魔数文件"
    if (名 === "rg" && 参.some((w) => /^--pre/.test(w))) return "rg --pre 会跑别的命令"
    // `-Iseconds` 是 -I 带参数，不是 -s
    if (名 === "date" && 参.some((w) => /^(-(?!I)[A-Za-z]*s|--set)/.test(w))) return "date -s 会改系统时间"
    if (名 === "nvidia-smi" && 参.some((w) => !/^(-L|--list-gpus|--query-gpu=.*|--format=.*)$/.test(w))) {
      return "nvidia-smi 只放不带参数、-L 与 --query-gpu"
    }
    if (名 === "git" && !/^(status|log|diff|show|ls-files)$/.test(参[0] ?? "")) {
      return `git ${参[0] ?? ""} 不在只读的那几个（status / log / diff / show / ls-files）里`
    }
    // log / diff / show 能把结果写进文件、能跑外部 diff 程序（2026-09-28 实现时补）
    if (名 === "git" && 参.some((w) => /^--output/.test(w))) return "git --output 会写文件"
    if (名 === "git" && 参.some((w) => /^--ext-diff/.test(w))) return "git --ext-diff 会跑外部程序"
  }
  return undefined
}

export interface 方案期语境 {
  /** 这段会话此刻在不在方案期 */
  方案期: boolean
  /** 已批准的方案文件，相对工作区（`plans.json` 里记的就是这个） */
  已批准: readonly string[]
  workspace: string
  /** 这件是 MCP 服务器自己声明 `readOnlyHint: true` 的工具（D6） */
  mcp只读?: boolean
}

/** 一个目标（相对或绝对）是不是某份已批准的方案文件。**只按工作区解析**——命令里的 `cd` 不跟（见计划风险 3） */
function 是已批准(目标: string, 语境: 方案期语境): boolean {
  const 绝对 = isAbsolute(目标) ? resolve(目标) : resolve(语境.workspace, 目标)
  const 相对 = relative(语境.workspace, 绝对).split(sep).join("/")
  return 语境.已批准.includes(相对)
}

/** 动了已批准的方案文件 → 拒绝理由；没动 → undefined */
export function 碰已批准(工具名: string, 参数: Record<string, unknown>, 语境: 方案期语境): string | undefined {
  if (语境.已批准.length === 0) return undefined
  const 理由 = (p: string) =>
    `拒绝改动 ${p}：这是已批准的分析方案（预注册），批准后不改。做法和方案不一样的地方，做完时在回复里逐条说明。`
  if ((工具名 === "write" || 工具名 === "edit") && typeof 参数.path === "string") {
    return 是已批准(参数.path, 语境) ? 理由(参数.path) : undefined
  }
  if (工具名 === "bash" && typeof 参数.command === "string") {
    const 删 = 删除目标(参数.command)
    for (const t of [...写入目标(参数.command), ...(删 === "看不清" ? [] : 删)]) {
      if (是已批准(t, 语境)) return 理由(t)
    }
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
  if (工具名 === "bash") {
    const cmd = typeof 参数.command === "string" ? 参数.command : ""
    const 不 = 只读命令不成立(cmd)
    return 不
      ? { kind: "deny", reason: `${先出方案}\`${cmd}\` ${不}。把这一步写进方案里，批了再做。` }
      : { kind: "allow" }
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
