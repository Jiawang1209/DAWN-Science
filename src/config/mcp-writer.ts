/**
 * 往 `providers.yaml` 里加 / 删一台 MCP 服务器（2026-08-15）。
 *
 * ## 为什么会有这个文件
 *
 * 作者：*「我准备如何配置其他的 MCP 呢？就和我配置其他的大模型，
 * 或者 Skill 似的，我是不是应该搞一个配置的接口啥的呢？」*
 *
 * 我原先的决定是「不做表单，把文件路径说清楚就行」，理由是
 * 「填不全的表单比没有更坏」。**那是做不好的借口，不是不做的理由**——
 * 而且这个仓库早就为同一件事下过结论，就写在 `writer.ts` 的文件头：
 *
 * > *「让人打开一个 yaml 手写一段，本身就是这个应用没做完。」*
 *
 * ## 三条纪律与 `writer.ts` 一字不差
 *
 * 1. **一个既有字节都不动。** 解析只用来校验，写入走纯文本插入——
 *    `parseDocument` + `toString()` 会重新序列化整份文件，
 *    把用户手写的 `[a, b]` 改成块状列表。
 * 2. **只加，不改不删同名的。** 覆盖掉的是用户手写的东西。
 * 3. **写完读回来再宣布成功**，读不回来就还原——
 *    一个写坏的配置会让应用下次起不来，比「加不上」严重得多。
 *
 * ## 比 `writer.ts` 多一件事：那一段可能压根不存在
 *
 * `agents:` 是第一次启动就生成的，一定在；而 `mcp:` **多半没有**。
 * 所以这里要能新建整段——追加在文件末尾，**不插在中间**：
 * 插在中间要猜「哪儿算合适」，而猜错就动了别人的排版。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseDocument } from "yaml"
import { UserFacingError } from "../errors.js"
import { loadRegistry } from "./loader.js"
import type { ProviderRegistry } from "./schema.js"
import { 名字过得了API } from "../mcp/名单.js"

/**
 * 名字的长度上限。**形状由 `mcp/名单.ts` 的 `名字过得了API` 定**——
 * 那条规则只有一个家：它是「送进模型 API 之后谁在收」决定的，不是我们的偏好。
 *
 * 我第一版把形状写在这里，还允许中文——**当天就炸了**：
 * `官方参考__echo` 送进 DeepSeek 直接 400，而且整段对话都发不出去。
 */
const 长度上限 = 32

export interface 新MCP服务器 {
  名: string
  command: string
  args?: readonly string[]
  /** 要哪些环境变量。**只有名字**——值走钥匙串，不进这份文件 */
  env?: readonly string[]
  cwd?: string
}

/** YAML 的行内标量：拿不准就加引号。**宁可多一对引号，不可写出一份读不回来的文件** */
function 引(s: string): string {
  return JSON.stringify(s)
}

function 成块(台: 新MCP服务器): string[] {
  const 行 = [`  ${台.名}:`, `    command: ${引(台.command)}`]
  if (台.args && 台.args.length > 0) 行.push(`    args: [${台.args.map(引).join(", ")}]`)
  if (台.env && 台.env.length > 0) 行.push(`    env: [${台.env.map(引).join(", ")}]`)
  if (台.cwd) 行.push(`    cwd: ${引(台.cwd)}`)
  return 行
}

/**
 * 把新的几行插进 `mcp:` 那一段的末尾；**没有那一段就在文件末尾新建**。
 */
function 插入(原文: string, 台: 新MCP服务器): string {
  const lines = 原文.split("\n")
  const 起 = lines.findIndex((l) => /^mcp:\s*$/.test(l))

  if (起 < 0) {
    /**
     * **没有 `mcp:` 就追加在末尾。** 不插在中间——
     * 「哪儿算合适」只能靠猜，而猜错就动了别人的排版。
     */
    const 尾 = [...lines]
    while (尾.length > 0 && 尾[尾.length - 1]!.trim() === "") 尾.pop()
    return [...尾, "", "# MCP 服务器（由 DAWN 添加）", "mcp:", ...成块(台), ""].join("\n")
  }

  /**
   * 段的末尾 = 最后一条**缩进**行。空行不算末尾（段中间常有空行分组），
   * 但也不能把段尾的空行吞进来。与 `writer.ts` 同一套。
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

  return [...lines.slice(0, 末), "", ...成块(台), ...lines.slice(末)].join("\n")
}

/**
 * 加一台 MCP 服务器。
 *
 * @returns 重新解析之后的完整 registry。**调用方拿它去原地更新内存里那一份**——
 *   `registry` 对象被多处按引用持有，替换引用没用，得改同一个对象。
 * @throws {UserFacingError} 名字不合法、已存在、或写完读不回来
 */
export function addMcpServer(file: string, 台: 新MCP服务器): ProviderRegistry {
  const 名字不行 = 名字过得了API(台.名)
  if (名字不行) throw new UserFacingError(名字不行)
  if (台.名.length > 长度上限) {
    throw new UserFacingError(`服务器名不要超过 ${长度上限} 个字符（收到 ${台.名.length} 个）`)
  }
  if (!台.command.trim()) throw new UserFacingError("`command` 不能是空的——不知道该怎么把它启动起来")
  if (!existsSync(file)) throw new UserFacingError(`找不到配置文件：${file}`)

  const 原文 = readFileSync(file, "utf8")

  // **解析只用来校验**，不用它写回去（理由见文件头第 1 条）
  const doc = parseDocument(原文)
  const 段 = doc.get("mcp") as { has?: (k: string) => boolean } | undefined
  if (段 && typeof 段.has === "function" && 段.has(台.名)) {
    // **不覆盖**：那可能是用户手写的，他没要求我们改它
    throw new UserFacingError(`配置里已经有一台叫「${台.名}」的 MCP 服务器了`)
  }

  writeFileSync(file, 插入(原文, 台), "utf8")

  /** **写完读回来再宣布成功**，读不回来就还原 */
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
 * 删一台。
 *
 * **只删我们能认出来的那一段**：从 `  <名>:` 那一行到下一条同级键之前。
 * 认不出来就报错，不猜——猜错删掉的是别人的配置。
 */
export function removeMcpServer(file: string, 名: string): ProviderRegistry {
  if (!existsSync(file)) throw new UserFacingError(`找不到配置文件：${file}`)
  const 原文 = readFileSync(file, "utf8")
  const lines = 原文.split("\n")

  const 段起 = lines.findIndex((l) => /^mcp:\s*$/.test(l))
  if (段起 < 0) throw new UserFacingError("配置里没有 `mcp:` 这一段")

  const 键行 = new RegExp(`^\\s{2}${名.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:\\s*$`)
  let 起 = -1
  for (let i = 段起 + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() !== "" && !/^\s/.test(l)) break // 出了这一段
    if (键行.test(l)) {
      起 = i
      break
    }
  }
  if (起 < 0) throw new UserFacingError(`配置里没有叫「${名}」的 MCP 服务器`)

  /** 到下一条**同级**键（两个空格缩进）或段末为止 */
  let 终 = lines.length
  for (let i = 起 + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === "") continue
    if (!/^\s/.test(l) || /^\s{2}\S/.test(l)) {
      终 = i
      break
    }
  }
  /** 把它上面紧挨着的注释与空行一并带走——**留下孤零零的注释比不删更难看** */
  while (起 > 段起 + 1 && (lines[起 - 1]!.trim() === "" || /^\s*#/.test(lines[起 - 1]!))) 起 -= 1

  let 剩下 = [...lines.slice(0, 起), ...lines.slice(终)]

  /**
   * **最后一台删掉之后，那个空的 `mcp:` 也要带走**（2026-08-15 测试抓到的）。
   *
   * 空段在 YAML 里解析成 `null`，而 schema 要的是一张表——
   * 于是**整份配置读不回来**，应用下次起不来。
   * 这个洞是「删最后一台」这条用例逼出来的：只删中间那台永远撞不上。
   */
  const 段行 = 剩下.findIndex((l) => /^mcp:\s*$/.test(l))
  if (段行 >= 0) {
    const 还有 = 剩下
      .slice(段行 + 1)
      .some((l) => (l.trim() === "" ? false : /^\s/.test(l) ? /^\s{2}\S/.test(l) : false))
    if (!还有) {
      let 头 = 段行
      // 连同它上面紧挨着的注释与空行一起
      while (头 > 0 && (剩下[头 - 1]!.trim() === "" || /^\s*#/.test(剩下[头 - 1]!))) 头 -= 1
      let 尾 = 段行 + 1
      while (尾 < 剩下.length && 剩下[尾]!.trim() === "") 尾 += 1
      剩下 = [...剩下.slice(0, 头), ...剩下.slice(尾)]
    }
  }

  writeFileSync(file, 剩下.join("\n"), "utf8")

  try {
    return loadRegistry(file)
  } catch (err) {
    writeFileSync(file, 原文, "utf8")
    throw new UserFacingError(
      `删完之后配置读不回来，已还原：${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * 把别人 README 里那段 Claude Desktop 的 JSON 翻译过来（2026-08-15）。
 *
 * ## 为什么是「粘贴」而不是「填五个格子」
 *
 * 每一台 MCP 服务器的文档给你的都是这个形状。照着它填格子既慢又容易抄漏
 * 一个引号——**而那正是「填不全的表单」真正的危险所在**。
 *
 * ## 密钥的值一律丢掉，只留名字
 *
 * 那份 JSON 里 `env` 是 `{名: 值}`，值就是密钥本身。我们**只取名字**，
 * 值单独走钥匙串——**这份配置文件是会被分享、会进 git 的**。
 * 不这么做的话，照抄的人根本不会注意到自己刚把 key 提交上去了。
 *
 * 收三种形状，都是真实文档里出现过的：
 *   ① `{"mcpServers": {"名": {...}}}`  ——最常见，整份配置
 *   ② `{"名": {...}}`                  ——只给了一台
 *   ③ `{"command": ..., "args": ...}`  ——连名字都没有，由调用方另填
 */
export function 从JSON解出(文本: string): {
  台: Omit<新MCP服务器, "名"> & { 名?: string }
  /** JSON 里带着值的那些密钥。**只回名字，值不往外传** */
  密钥名: string[]
} {
  let 原: unknown
  try {
    原 = JSON.parse(文本)
  } catch (e) {
    throw new UserFacingError(
      `这段不是合法的 JSON：${e instanceof Error ? e.message : String(e)}。` +
        `从文档里连着大括号一起复制，别漏掉最外层。`,
    )
  }
  if (!原 || typeof 原 !== "object") throw new UserFacingError("这段 JSON 不是一个对象")

  let 名: string | undefined
  let 体 = 原 as Record<string, unknown>

  const 包 = 体["mcpServers"] ?? 体["servers"]
  if (包 && typeof 包 === "object") 体 = 包 as Record<string, unknown>

  if (typeof 体["command"] !== "string") {
    /** 还没到那一层：应当是 `{"名": {...}}` */
    const 键 = Object.keys(体)
    if (键.length === 0) throw new UserFacingError("这段 JSON 里没有任何服务器")
    if (键.length > 1) {
      throw new UserFacingError(
        `这段 JSON 里有 ${键.length} 台（${键.join("、")}）。一次加一台，只粘其中一台。`,
      )
    }
    名 = 键[0]!
    const 里 = 体[名]
    if (!里 || typeof 里 !== "object") throw new UserFacingError(`「${名}」下面不是一个对象`)
    体 = 里 as Record<string, unknown>
  }

  const command = 体["command"]
  if (typeof command !== "string" || !command.trim()) {
    throw new UserFacingError("这段 JSON 里没有 `command`——不知道该怎么把它启动起来")
  }

  const args = Array.isArray(体["args"]) ? 体["args"].map((x) => String(x)) : undefined
  const cwd = typeof 体["cwd"] === "string" ? 体["cwd"] : undefined

  /** **只取名字，值一律丢掉。** 这是这个函数存在的一半理由 */
  const envObj = 体["env"]
  const 密钥名 =
    envObj && typeof envObj === "object" && !Array.isArray(envObj)
      ? Object.keys(envObj as Record<string, unknown>)
      : Array.isArray(envObj)
        ? (envObj as unknown[]).map((x) => String(x))
        : []

  return {
    台: {
      ...(名 ? { 名 } : {}),
      command,
      ...(args ? { args } : {}),
      ...(密钥名.length > 0 ? { env: 密钥名 } : {}),
      ...(cwd ? { cwd } : {}),
    },
    密钥名,
  }
}
