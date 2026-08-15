/**
 * MCP 客户端：起服务器、列工具、调工具（2026-08-15）。
 *
 * ## 为什么这一层是我们自己写的
 *
 * **pi 不带 MCP 客户端**——整个 pi 生态里搜不到任何 MCP 实现
 * （`pi-ai` 里那几处命中是 OAuth 的 scope 字符串）。所以这不是「接线」，
 * 是我们当客户端。坐的是官方 SDK 的 `Client` + `StdioClientTransport`
 * （`@modelcontextprotocol/sdk`，spike B 时就在依赖里了）。
 * **放弃的**：MCP 的 resources / prompts 两块（第一批只做 tools）、
 * 以及 HTTP/SSE 传输（要处理鉴权与重连，是另一件事——不假装支持）。
 *
 * ## 四件事在这里定死
 *
 * 1. **起不来的原因要说全。** 「缺 PGURL」与「命令不存在」与「它自己崩了」
 *    是三件事，笼统一句「连不上」会让人反复试同一条死路。
 * 2. **stderr 要接住，不能继承。** SDK 默认 `inherit`——那会把服务器的
 *    诊断输出直接印进我们的进程；而**服务器崩掉时，stderr 是唯一线索**。
 *    这里 `pipe` 并留最后几行，报错时一并交出去。
 * 3. **卡住要有终点。** 一台起不来的服务器不该让整段会话开不了。
 * 4. **进程按「名字 + 目录」共用**，不是每段会话起一份：
 *    开五段对话就起五个 postgres 客户端，既慢又会把连接数打满。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { McpServer } from "../config/schema.js"
import { 工具全名 } from "./名单.js"

/** 起一台服务器最多等多久。**一台起不来不该让整段会话开不了** */
const 起动上限毫秒 = 20_000

/** 留几行 stderr 用于报错。**全留会把一个刷屏的服务器变成内存泄漏** */
const 留几行 = 20

export interface MCP工具 {
  /** `<服务器名>__<工具名>`。模型看见的就是这个 */
  全名: string
  服务器名: string
  工具名: string
  描述: string
  /** JSON Schema，直接来自服务器。**原样转交，不翻译** */
  入参: unknown
}

export interface 一台的结果 {
  服务器名: string
  工具: MCP工具[]
  /** 起不来的原因。**有它就说明这台没起来**，工具必然是空的 */
  失败?: string
}

/** 取一个环境变量的值。取不到返回 undefined——**由调用方决定怎么说** */
export type 取密 = (服务器名: string, 变量名: string) => string | undefined

interface 一条连接 {
  client: Client
  transport: StdioClientTransport
  工具: MCP工具[]
  stderr尾巴: string[]
}

/**
 * 一池子 MCP 连接。**按「服务器名 + 工作目录」共用**。
 *
 * 生命周期跟着应用走，不跟着会话走：一段会话结束就关掉的话，
 * 下一段又要重新起一遍（有些服务器起来要好几秒）。
 */
export class MCP池 {
  private readonly 连着 = new Map<string, 一条连接>()
  /** 正在起的那些。**同一台被两段会话同时要到时，只起一次** */
  private readonly 起着 = new Map<string, Promise<一台的结果>>()

  constructor(private readonly opts: { 取密: 取密 }) {}

  /**
   * 池子的键。**分隔符用 NUL**：服务器名与路径里什么字符都可能有，
   * 只有它一定不会出现——用 `:` 或空格的话，
   * `a` + `/b:c` 与 `a:/b` + `c` 会撞成同一个键。
   * 写成转义而不是裸字符（源码卫生扫描盯着这一条）。
   */
  private 键(名: string, cwd: string | undefined): string {
    return `${名}\x00${cwd ?? ""}`
  }

  /**
   * 确保一台起着，并返回它的工具。
   *
   * **不抛异常**：一台起不来是要显示给人看的事实，不是异常
   * ——抛出去的话，一台坏服务器会让整段会话开不了。
   */
  async 备好(名: string, 配: McpServer, 默认cwd?: string): Promise<一台的结果> {
    const cwd = 配.cwd ?? 默认cwd
    const k = this.键(名, cwd)
    const 有 = this.连着.get(k)
    if (有) return { 服务器名: 名, 工具: 有.工具 }
    const 在起 = this.起着.get(k)
    if (在起) return 在起

    const p = this.起一台(名, 配, cwd, k).finally(() => this.起着.delete(k))
    this.起着.set(k, p)
    return p
  }

  private async 起一台(
    名: string,
    配: McpServer,
    cwd: string | undefined,
    k: string,
  ): Promise<一台的结果> {
    /**
     * **密钥先取齐再起进程。**
     *
     * 少一个就不起，并说清少的是哪一个。静默起一个连不上库的服务器，
     * 症状会表现成「这个工具怎么老是失败」——而人会去查工具、查网络、
     * 查模型，唯独不会想到是一个没配的环境变量。
     */
    const env: Record<string, string> = {}
    const 缺的: string[] = []
    for (const 变量 of 配.env ?? []) {
      const v = this.opts.取密(名, 变量)
      if (v === undefined || v === "") 缺的.push(变量)
      else env[变量] = v
    }
    if (缺的.length > 0) {
      return {
        服务器名: 名,
        工具: [],
        失败: `还没填 ${缺的.join("、")}——去「MCP 服务器」那一屏填上再连。`,
      }
    }

    const 尾巴: string[] = []
    const transport = new StdioClientTransport({
      command: 配.command,
      ...(配.args ? { args: [...配.args] } : {}),
      ...(cwd ? { cwd } : {}),
      ...(Object.keys(env).length > 0 ? { env: { ...默认环境(), ...env } } : {}),
      /**
       * **接住而不是继承。** 默认 `inherit` 会把服务器的诊断输出印进我们的进程；
       * 而它崩掉时 stderr 往往是唯一线索——不留就等于把线索扔了。
       */
      stderr: "pipe",
    })

    const client = new Client(
      { name: "dawn-science", version: "0.0.1" },
      { capabilities: {} },
    )

    try {
      await 限时(client.connect(transport), 起动上限毫秒, `连 ${名} 超过 ${起动上限毫秒 / 1000} 秒`)
      transport.stderr?.on("data", (b: Buffer) => {
        for (const 行 of String(b).split("\n")) {
          if (!行.trim()) continue
          尾巴.push(行)
          if (尾巴.length > 留几行) 尾巴.shift()
        }
      })

      const 列 = await 限时(client.listTools(), 起动上限毫秒, `列 ${名} 的工具超时`)
      const 工具: MCP工具[] = 列.tools.map((t) => ({
        全名: 工具全名(名, t.name),
        服务器名: 名,
        工具名: t.name,
        /** **描述缺席就如实说缺席**，不编一句——模型会照着编出来的那句去用它 */
        描述: t.description ?? `${名} 提供的工具 ${t.name}（这台服务器没有给出说明）`,
        入参: t.inputSchema,
      }))
      this.连着.set(k, { client, transport, 工具, stderr尾巴: 尾巴 })
      return { 服务器名: 名, 工具 }
    } catch (e) {
      await client.close().catch(() => {})
      const 原因 = e instanceof Error ? e.message : String(e)
      const 补 = 尾巴.length > 0 ? `\n它自己说：\n${尾巴.join("\n")}` : ""
      return { 服务器名: 名, 工具: [], 失败: `${原因}${补}` }
    }
  }

  /**
   * 调一次工具。
   *
   * **回的是给模型看的文字**：MCP 的结果是一串 content 块（文本、图片、
   * 资源引用），这里只把文本拼起来，其余如实说明有但没带进来——
   * 与 `run_code` 的 `摘要()` 同一条纪律：**不说清的话，
   * 模型会以为自己什么都没拿到，然后反复重试**。
   */
  async 调(
    名: string,
    配: McpServer,
    工具名: string,
    参数: Record<string, unknown>,
    默认cwd?: string,
  ): Promise<{ 文字: string; 出错了: boolean }> {
    const 备 = await this.备好(名, 配, 默认cwd)
    if (备.失败) return { 文字: `${名} 没连上：${备.失败}`, 出错了: true }
    const 连 = this.连着.get(this.键(名, 配.cwd ?? 默认cwd))
    if (!连) return { 文字: `${名} 没连上。`, 出错了: true }

    try {
      const r = await 连.client.callTool({ name: 工具名, arguments: 参数 })
      return { 文字: 摘出文字(r), 出错了: r.isError === true }
    } catch (e) {
      const 补 = 连.stderr尾巴.length > 0 ? `\n它自己说：\n${连.stderr尾巴.join("\n")}` : ""
      return { 文字: `${名}__${工具名} 调用失败：${e instanceof Error ? e.message : String(e)}${补}`, 出错了: true }
    }
  }

  /** 关掉一台（改了配置之后要重连）。**没连着也算成功**——那本来就是想要的状态 */
  async 关(名: string, cwd?: string): Promise<void> {
    const k = this.键(名, cwd)
    const 连 = this.连着.get(k)
    if (!连) return
    this.连着.delete(k)
    await 连.client.close().catch(() => {})
  }

  /** 全关掉（退出时）。**每个单独兜底**：一个关不掉不该拖住其余的 */
  async 全关(): Promise<void> {
    const 全部 = [...this.连着.values()]
    this.连着.clear()
    await Promise.all(全部.map((c) => c.client.close().catch(() => {})))
  }

  /**
   * 这一台现在连着吗、有哪些工具。
   *
   * **不连**：列名单时不该顺手把每台都起起来——那会在打开一个设置屏时
   * 悄悄拉起五个进程。所以没连着就回 undefined，界面显示「还没试过」，
   * **而「还没试过」与「试过、连不上」必须分得开**。
   */
  查(名: string, cwd?: string): { 工具: MCP工具[] } | undefined {
    const 连 = this.连着.get(this.键(名, cwd))
    return 连 ? { 工具: 连.工具 } : undefined
  }

  /** 现在连着哪几台。界面要能说清楚 */
  连着的(): string[] {
    return [...this.连着.keys()].map((k) => k.split("\x00")[0]!)
  }
}

/**
 * MCP 结果 → 给模型的文字。
 *
 * **非文本的块要点名说出来**：一张图、一份资源引用如果一声不吭地丢掉，
 * 模型会以为工具什么都没返回。
 */
export function 摘出文字(r: unknown): string {
  const 内容 = (r as { content?: unknown } | null)?.content
  const 块 = Array.isArray(内容) ? 内容 : []
  const 行: string[] = []
  for (const c of 块 as { type?: string; text?: string; mimeType?: string }[]) {
    if (c.type === "text" && typeof c.text === "string") 行.push(c.text)
    else if (c.type === "image") 行.push(`（返回了一张 ${c.mimeType ?? "图片"}，这里不带进来）`)
    else if (c.type === "resource") 行.push(`（返回了一份资源引用，这里不带进来）`)
    else if (c.type) 行.push(`（返回了一个 ${c.type} 块，这里不带进来）`)
  }
  const 文字 = 行.join("\n").trim()
  // **什么都没返回也要说一声**：一片空白会被读成「没调成」
  return 文字 || "（这次调用没有返回任何内容）"
}

/**
 * 起子进程时的基础环境。
 *
 * **不整份 `process.env` 倒过去**：那里面有我们自己的 API key。
 * 只给进程跑得起来必需的那几个——其余由配置显式声明。
 */
function 默认环境(): Record<string, string> {
  const 白名单 = ["PATH", "HOME", "USER", "SHELL", "LANG", "TMPDIR", "SystemRoot", "APPDATA"]
  const out: Record<string, string> = {}
  for (const k of 白名单) {
    const v = process.env[k]
    if (v) out[k] = v
  }
  return out
}

/** 给一个 promise 加终点。**超时要说清等的是什么**，不是一句 timeout */
async function 限时<T>(p: Promise<T>, 毫秒: number, 说明: string): Promise<T> {
  let 计时: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, 拒) => {
        计时 = setTimeout(() => 拒(new Error(说明)), 毫秒)
      }),
    ])
  } finally {
    if (计时) clearTimeout(计时)
  }
}
