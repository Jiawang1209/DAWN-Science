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
