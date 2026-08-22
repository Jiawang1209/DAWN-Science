/**
 * 子 agent 定义的加载（①-B″ · S1）。
 *
 * 定义是 markdown + YAML frontmatter，住在 `<project>/.dawn/agents/*.md`：
 *
 * ```markdown
 * ---
 * name: scout
 * description: 快速踏勘代码库，返回压缩后的上下文
 * tools: read, grep, find, ls
 * model: deepseek-v4-flash
 * ---
 *
 * 你是踏勘员。只读不写，返回要点。
 * ```
 *
 * ## 形态学自 pi，两处刻意不同
 *
 * 计划 §6 的纪律：**形态一样、上界一样、三种模式一样，代码是我们的**——
 * `examples/extensions/subagent/` 是示例源码而非发布 API，抄进来会让 MIT 源码
 * 混入本仓库，动摇规格 §3.3「代码库完整归属自己」。
 *
 * **不同之一：不静默跳过。** pi 的示例在 frontmatter 缺字段时直接 `continue`，
 * 文件就这么消失了。规格 7.5 要求**失败必须出声**，所以这里读不进来的文件
 * 连同原因一并返回。agent 定义是用户手写的 markdown，写错 frontmatter 是常态；
 * 静默跳过的表现是「我明明建了这个 agent，它却不在列表里」，而无处可查。
 *
 * **不同之二：重名保留先读到的，并出声。** pi 用 `Map.set` 后写覆盖先写。
 * 覆盖本身不危险，危险的是不出声——人会改错文件，改完发现没效果。
 *
 * ## ⚠ 一条开着的缝，留给阶段 ④ 的授权门
 *
 * pi 的 README 对**项目级** agent 定义写了明确警告：
 *
 * > *"Project-local agents (`.pi/agents/*.md`) are **repo-controlled prompts**
 * > that can instruct the model to read files, run bash commands, etc.
 * > **Default behavior:** Only loads user-level agents."*
 *
 * 而本项目的定义**正是项目级的**。这意味着：定义文件的正文原样成为子 agent 的
 * system prompt，而子 agent 手里有 `read` / `bash` / `write`；文件在仓库里，
 * 于是控制权不在使用者手上，而在**谁能往这个仓库提交**手上——
 * clone 来的仓库、团队里任何有写权限的人、一个 PR 里夹带的定义。
 * **这不是漏洞利用，就是正常功能。**
 *
 * **2026-08-09 作者决定：照做，不加确认层，交给阶段 ④ 的能力授权门**
 * （计划 §6「作者的决定与它的代价」记有完整的三个备选与取舍）。
 * 理由：**提示词注入拦不干净，能力边界拦得住**——真正的解法是限制 agent
 * 能干什么，而不是限制谁能写提示词。
 *
 * 已做的收窄只有两条，**都不解决上述问题**，只是不让它更糟：
 *   1. 只认 `<project>/.dawn/agents/` 一层，不向上查找父目录（pi 会一路往上找，
 *      那样一个上级目录就能影响其下所有仓库）
 *   2. 名字必须是安全标识符——它后面要进日志、界面与账本
 *
 * **阶段 ④ 加授权门时，本模块是第一个要接的调用点。**
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
// pi 的公开导出。**同一份 frontmatter 解析规则，不自己再写一套**——
// 两套解析规则会在边角情形上悄悄分家，而定义文件是用户手写的，边角情形很多
import { parseFrontmatter } from "@earendil-works/pi-coding-agent"

export interface SubagentDefinition {
  name: string
  /** 给**模型**看的选择依据，不是给人看的装饰——它决定了父 agent 会不会选中它 */
  description: string
  /**
   * 允许的工具。**缺省 = 继承默认工具集，不是「一个工具都不给」。**
   * 缺失不等于相同，缺失也不等于支持——这里的默认值选择才是要害。
   */
  tools?: string[]
  /** 覆盖模型。缺省 = 用会话当前的模型 */
  model?: string
  systemPrompt: string
  /** 出问题时要能指回具体哪个文件 */
  filePath: string
  /** 它从哪儿来（2026-08-22 起三层）：自带 / 你写的 / 这个项目带的。同名时项目 > 全局 > 自带 */
  from?: "builtin" | "global" | "project"
  /** 给人看的名字（frontmatter `title`，可以是中文）；`name` 仍是给模型与文件的安全标识符 */
  title?: string
  /** 分组（frontmatter `group`），只给屏上分区用；没写就「其它」 */
  group?: string
  /** 停用了（frontmatter `disabled: true`）：屏上列出来，但不给模型、不当技能 */
  disabled?: boolean
}

export interface DefinitionProblem {
  filePath: string
  reason: string
}

export interface DefinitionLoad {
  agents: SubagentDefinition[]
  /** 读不进来的文件与原因。**不静默跳过**（规格 7.5） */
  problems: DefinitionProblem[]
}

/** 定义目录相对项目根的位置。**只此一层，不向上查找** */
export const AGENTS_DIR = join(".dawn", "agents")

/**
 * 名字要能安全地进日志、界面、账本与进程参数。
 *
 * **放行**中日韩文字与 `-` `_`——本项目界面全中文，禁掉 CJK 等于逼人用英文命名；
 * 而 `code-reviewer` 这类连字符命名是最常见的写法。
 * **禁掉**空白、路径分隔符、点号开头、控制字符。
 *
 * 控制字符写成显式的 `\x00-\x1f`。第一版这里是两个**裸控制字节**——
 * 我以为敲进去的是「空格和连字符」，实际写进文件的是 `\0` 与 `\x1f`。
 * 行为碰巧是对的，但源码里从此有了不可见字节，**`grep` 把整个文件当二进制，
 * 一行都不返回**（那正是它被发现的方式）。**能写成转义就不要写成字面控制字符。**
 */
const SAFE_NAME = /^[^\s./\\\x00-\x1f][^\s/\\\x00-\x1f]*$/

export function loadSubagentDefinitions(projectRoot: string): DefinitionLoad {
  const dir = join(projectRoot, AGENTS_DIR)
  const agents: SubagentDefinition[] = []
  const problems: DefinitionProblem[] = []

  // **没有定义不是错误**，是「这个项目还没定义子 agent」
  if (!existsSync(dir)) return { agents, problems }

  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (err) {
    problems.push({ filePath: dir, reason: `读不了定义目录：${message(err)}` })
    return { agents, problems }
  }

  // **排序**：文件系统的返回顺序不保证稳定，而重名时「保留先读到的」这条规则
  // 必须是确定的，否则同一个项目在两台机器上会得到不同的 agent
  const seen = new Map<string, SubagentDefinition>()
  for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
    const filePath = join(dir, name)
    let raw: string
    try {
      raw = readFileSync(filePath, "utf8")
    } catch (err) {
      problems.push({ filePath, reason: `读不了这个文件：${message(err)}` })
      continue
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw)
    const def = validate(filePath, frontmatter, body)
    if ("reason" in def) {
      problems.push({ filePath, reason: def.reason })
      continue
    }

    const prior = seen.get(def.name)
    if (prior) {
      problems.push({
        filePath,
        reason: `名字 "${def.name}" 与 ${prior.filePath} 重复，已保留先读到的那个`,
      })
      continue
    }
    seen.set(def.name, def)
    agents.push(def)
  }

  return { agents, problems }
}

/**
 * 三层目录一起读（2026-08-22，学自 dsh-agency-agents 的「名册」）：
 * 顺序就是优先级——先给的赢，同名后来的记一条「重复」。每一层的 `from` 标在定义上。
 * 目录不存在不是错误。
 */
export function loadSubagentsFrom(层: readonly { dir: string; from: "builtin" | "global" | "project" }[]): DefinitionLoad {
  const agents: SubagentDefinition[] = []
  const problems: DefinitionProblem[] = []
  const seen = new Map<string, SubagentDefinition>()
  for (const { dir, from } of 层) {
    if (!existsSync(dir)) continue
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch (err) {
      problems.push({ filePath: dir, reason: `读不了定义目录：${message(err)}` })
      continue
    }
    for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
      const filePath = join(dir, name)
      let raw: string
      try {
        raw = readFileSync(filePath, "utf8")
      } catch (err) {
        problems.push({ filePath, reason: `读不了这个文件：${message(err)}` })
        continue
      }
      const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw)
      const def = validate(filePath, frontmatter, body)
      if ("reason" in def) {
        problems.push({ filePath, reason: def.reason })
        continue
      }
      const prior = seen.get(def.name)
      if (prior) {
        // 跨层同名不算写坏：项目级盖住自带的正是设计；只在同一层里才是重复
        if (prior.from === from) problems.push({ filePath, reason: `名字 "${def.name}" 与 ${prior.filePath} 重复，已保留先读到的那个` })
        continue
      }
      const 完整: SubagentDefinition = { ...def, from }
      seen.set(def.name, 完整)
      agents.push(完整)
    }
  }
  return { agents, problems }
}

function validate(
  filePath: string,
  fm: Record<string, string>,
  body: string,
): SubagentDefinition | { reason: string } {
  const name = (fm.name ?? "").trim()
  if (!name) return { reason: "frontmatter 缺 name" }
  if (!SAFE_NAME.test(name)) {
    return { reason: `name "${name}" 不是安全的标识符：不能含路径分隔符、空白或以点号开头` }
  }

  const description = (fm.description ?? "").trim()
  if (!description) {
    // 它是给模型看的选择依据。没有它，父 agent 无从判断该不该选中这个子 agent
    return { reason: "frontmatter 缺 description" }
  }

  const systemPrompt = body.trim()
  if (!systemPrompt) return { reason: "正文为空——空的 system prompt 会让子 agent 无所适从" }

  const tools = (fm.tools ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  const model = (fm.model ?? "").trim()
  const group = (fm.group ?? "").trim()
  const title = (fm.title ?? "").trim()
  const disabled = /^(true|yes|on|1)$/i.test(String(fm.disabled ?? "").trim())

  return {
    name,
    description,
    // **空表要退回缺省**：写了 `tools:` 却是空的，意图是「没写」，不是「不给工具」
    ...(tools.length > 0 ? { tools } : {}),
    ...(model ? { model } : {}),
    ...(title ? { title } : {}),
    ...(group ? { group } : {}),
    ...(disabled ? { disabled: true } : {}),
    systemPrompt,
    filePath,
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
