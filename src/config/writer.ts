/**
 * 往 `providers.yaml` 里加一个 native agent（2026-08-10）。
 *
 * ## 为什么会有这个文件
 *
 * 作者：*「我其实配置了 kimi-coding 的 API，但是我配置完，在对话里面无法选择 kimi 呢？」*
 *
 * 因为**填 key 只是「连得上」，能不能建会话看的是配置里有没有声明 agent**。
 * 这件事此前只写在设置界面一个**默认折叠**的说明里——于是它等于不存在。
 * 光把话说清还不够：**让人打开一个 yaml 手写一段，本身就是这个应用没做完。**
 *
 * ## 三条纪律
 *
 * 1. **一个既有字节都不动。**
 *
 *    先试过 `parseDocument` + `toString()`：注释确实保住了，
 *    但它**重新序列化整份文件**——用户手写的 `models: [opus, sonnet]`
 *    被改写成了块状列表。那违反了下面第 2 条：我们只是来加一段的。
 *
 *    所以解析**只用来校验**，写入走**纯文本插入**：找到 `agents:` 这一段的末尾，
 *    把新的几行插进去，其余原样。
 * 2. **只加，不改不删。** 已经存在的同名 agent 一律拒绝，不覆盖：
 *    覆盖掉的是用户手写的东西，而他没要求我们改它。
 * 3. **先读回来再宣布成功。** 写完重新解析一次，**解析不过就把文件还原**——
 *    一个写坏的配置会让应用下次起不来，那比「加不上」严重得多。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseDocument } from "yaml"
import { UserFacingError } from "../errors.js"
import { loadRegistry } from "./loader.js"
import type { ProviderRegistry } from "./schema.js"

/**
 * 把新 agent 的几行插进 `agents:` 那一段的末尾。
 *
 * **纯文本操作**：其余每一个字节原样保留——包括缩进风格、空行、
 * 以及用户手写的 `[opus, sonnet]` 这种行内列表。
 */
function 插入(原文: string, agent: NewNativeAgent): string {
  const lines = 原文.split("\n")
  const 起 = lines.findIndex((l) => /^agents:\s*$/.test(l))
  if (起 < 0) throw new UserFacingError("配置里没有 `agents:` 这一段，不知道该往哪里加")

  /**
   * 段的末尾 = 最后一条**缩进**行。
   *
   * 空行不算末尾（段中间常有空行分组），但也不能把段尾的空行吞进来——
   * 所以先扫到第一条顶格的非空行为止，再回退掉尾部的空行。
   */
  let 末 = lines.length
  for (let i = 起 + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === "") continue
    if (!/^\s/.test(l)) {
      末 = i
      break
    }
  }
  while (末 > 起 + 1 && lines[末 - 1]!.trim() === "") 末 -= 1

  const 块 = [
    "",
    `  # 由 DAWN 在设置里添加`,
    `  ${agent.agentId}:`,
    `    kind: native`,
    `    provider: ${agent.provider}`,
    `    model: ${agent.model}`,
    `    capabilities: [chat, exec]`,
  ]
  return [...lines.slice(0, 末), ...块, ...lines.slice(末)].join("\n")
}

/**
 * agent id 的形状。
 *
 * **不允许空格与点**：它要进 YAML 的键、要进 URL 之外的各种记录，
 * 而一个带空格的键在 yaml 里得加引号——那是把复杂度推给下一个读这个文件的人。
 */
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/

export interface NewNativeAgent {
  agentId: string
  provider: string
  model: string
}

/**
 * 加一个 `kind: native` 的 agent。
 *
 * @returns 重新解析之后的完整 registry。**调用方拿它去原地更新内存里那一份**——
 *   `registry` 对象被多处按引用持有，替换引用没用，得改同一个对象。
 * @throws {UserFacingError} id 不合法、已存在、或写完读不回来
 */
export function addNativeAgent(file: string, agent: NewNativeAgent): ProviderRegistry {
  if (!ID.test(agent.agentId)) {
    throw new UserFacingError(
      `agent 名字只能用小写字母、数字和连字符，且不超过 32 个字符（收到「${agent.agentId}」）`,
    )
  }
  if (!existsSync(file)) throw new UserFacingError(`找不到配置文件：${file}`)

  const 原文 = readFileSync(file, "utf8")

  // **解析只用来校验**，不用它写回去（理由见文件头第 1 条）
  const doc = parseDocument(原文)
  const agents = doc.get("agents") as { has?: (k: string) => boolean } | undefined
  if (!agents || typeof agents.has !== "function") {
    throw new UserFacingError("配置里没有 `agents:` 这一段，不知道该往哪里加")
  }
  if (agents.has(agent.agentId)) {
    // **不覆盖**：那是用户手写的东西，他没要求我们改它
    throw new UserFacingError(`配置里已经有一个叫「${agent.agentId}」的 agent 了`)
  }

  const 新文 = 插入(原文, agent)

  writeFileSync(file, 新文, "utf8")

  /**
   * **写完读回来再宣布成功。**
   *
   * 读不回来就还原——一个写坏的配置会让应用下次起不来，
   * 那比「加不上」严重得多。
   */
  try {
    return loadRegistry(file)
  } catch (err) {
    writeFileSync(file, 原文, "utf8")
    throw new UserFacingError(
      `写进去的配置读不回来，已还原：${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * 一个 provider 的连接设置。**密钥不在里面**——它在钥匙串里。
 *
 * 三样都可空：**空 = 不覆盖**，交给 pi 自己的默认。
 */
export interface ProviderConnectionInput {
  baseUrl?: string | undefined
  api?: string | undefined
  models?: readonly string[] | undefined
}

/**
 * 写一个 provider 的连接设置（2026-08-10）。
 *
 * 作者：*「设置里把那 8 个的输入框也补上」*——那 8 个不自带 `baseUrl` 的
 * provider（Bedrock / Azure / Vertex / Cloudflare×2 / opencode×2 / radius），
 * 地址跟账号、区域、项目走，只能由人填。
 *
 * **2026-08-10 扩了口径**：原来只写 `baseUrl`。作者：*「我觉得可以在设置里面，
 * 通过 baseUrl、api、models 分别留出可以填写的地方，然后自行填写。」*
 * 三样一起给，才配得上「自定义端点」这四个字——只给地址的话，
 * 一个自建的 vLLM 仍然是「连得上但模型选择器是空的」，而没有一句话解释为什么。
 *
 * 与 `addNativeAgent` 同一套纪律：**纯文本，既有字节一个不动**；
 * 写完读回来，读不回来就还原。
 *
 * ## 这是**全量替换**那一条，不是打补丁
 *
 * 界面上那个编辑器一次交出三样的当前值，所以这里照单全收。
 * 打补丁（「没给的保持原样」）会让「把 api 清空」变得表达不出来——
 * 而清空正是「我填错了，回到 pi 的默认」唯一的说法。
 *
 * **三样全空等于取消覆盖**——把那一段删掉。存一个空 `baseUrl`
 * 会让请求打到一个空地址上，而报错与「你填空了」毫无关系。
 */
export function setProviderConnection(
  file: string,
  providerId: string,
  conn: ProviderConnectionInput,
): ProviderRegistry {
  if (!ID.test(providerId)) {
    throw new UserFacingError(`provider 名字不合法：「${providerId}」`)
  }
  if (!existsSync(file)) throw new UserFacingError(`找不到配置文件：${file}`)

  const 整理: ProviderConnectionInput = {
    baseUrl: conn.baseUrl?.trim() || undefined,
    api: conn.api?.trim() || undefined,
    models: conn.models?.map((m) => m.trim()).filter(Boolean),
  }

  const 原文 = readFileSync(file, "utf8")
  const 新文 = 写连接(原文, providerId, 整理)
  writeFileSync(file, 新文, "utf8")
  try {
    return loadRegistry(file)
  } catch (err) {
    writeFileSync(file, 原文, "utf8")
    throw new UserFacingError(
      `写进去的配置读不回来，已还原：${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** 找一段顶层键的行范围 `[起, 末)`；没有这一段返回 undefined */
function 段范围(lines: string[], key: string): [number, number] | undefined {
  const 起 = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l))
  if (起 < 0) return undefined
  let 末 = lines.length
  for (let i = 起 + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === "") continue
    if (!/^\s/.test(l)) {
      末 = i
      break
    }
  }
  while (末 > 起 + 1 && lines[末 - 1]!.trim() === "") 末 -= 1
  return [起, 末]
}

/**
 * YAML 的双引号字符串。
 *
 * **只转义反斜杠与双引号**：地址与模型 id 里不会有控制字符，
 * 而一个自作聪明的转义表迟早会把某个合法字符写坏。
 */
const 引 = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

function 写连接(原文: string, id: string, conn: ProviderConnectionInput): string {
  const lines = 原文.split("\n")
  const 段 = 段范围(lines, "providers")

  /** 这个 provider 已有的那几行 */
  const 找条目 = (起: number, 末: number): [number, number] | undefined => {
    const i = lines.findIndex((l, k) => k > 起 && k < 末 && new RegExp(`^  ${id}:\\s*$`).test(l))
    if (i < 0) return undefined
    let j = i + 1
    while (j < 末 && (lines[j]!.trim() === "" || /^ {4}/.test(lines[j]!))) j++
    return [i, j]
  }

  /** 有内容才写这一条；三样全空 = 取消覆盖 */
  const 有内容 = Boolean(conn.baseUrl || conn.api || (conn.models && conn.models.length > 0))
  const 块 = [
    `  ${id}:`,
    ...(conn.baseUrl ? [`    baseUrl: ${引(conn.baseUrl)}`] : []),
    ...(conn.api ? [`    api: ${引(conn.api)}`] : []),
    ...(conn.models && conn.models.length > 0
      ? [`    models: [${conn.models.map(引).join(", ")}]`]
      : []),
  ]

  if (!段) {
    // **还没有这一段**：加在文件最前面，紧挨着已有注释之后
    if (!有内容) return 原文
    return ["providers:", ...块, "", ...lines].join("\n")
  }

  const [起, 末] = 段
  const 旧 = 找条目(起, 末)
  if (旧) {
    const [a, b] = 旧
    if (有内容) return [...lines.slice(0, a), ...块, ...lines.slice(b)].join("\n")
    /**
     * **删掉这一条；如果它是最后一条，连 `providers:` 这一行一起删。**
     *
     * 留一个空的 `providers:` 会被 YAML 读成 `null`，配置当场校验不过——
     * 那时应用起不来，而原因是「你把最后一个覆盖删掉了」，没人猜得到。
     */
    const 剩下 = 末 - (b - a) - 起 - 1
    const 从 = 剩下 <= 0 ? 起 : a
    const 到 = 剩下 <= 0 ? 末 : b
    return [...lines.slice(0, 从), ...lines.slice(到)].join("\n")
  }
  if (!有内容) return 原文
  return [...lines.slice(0, 末), ...块, ...lines.slice(末)].join("\n")
}
