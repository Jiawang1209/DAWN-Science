/**
 * MCP 客户端：起服务器、列工具、调工具（2026-08-15）。
 *
 * ## 为什么这一层是我们自己写的
 *
 * **pi 不带 MCP 客户端**——整个 pi 生态里搜不到任何 MCP 实现
 * （`pi-ai` 里那几处命中是 OAuth 的 scope 字符串）。所以这不是「接线」，
 * 是我们当客户端。坐的是官方 SDK 的 `Client` + `StdioClientTransport`
 * （`@modelcontextprotocol/sdk`，spike B 时就在依赖里了）。
 * 支持 stdio、Streamable HTTP 和 SSE。普通 tools/call 无默认执行期限，
 * 结果保留原始信封，模型投影由 results.ts 负责；暂不提供独立 resources/prompts 目录。
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
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { 是远端MCP } from "../config/schema.js"
import type { McpServer } from "../config/schema.js"
import { 工具全名 } from "./名单.js"
import { legacyMlaiReads } from "./readonly-compat.js"
import { createHash } from "node:crypto"
import { McpClient, McpCallCancelled, McpConnectionError, waitForMcp } from "./requests.js"
import { McpRequestFetch, mcpSafeFetch } from './request-fetch.js'

/**
 * 起一台服务器最多等多久。**一台起不来不该让整段会话开不了。**
 *
 * **60 秒不是拍脑袋**（2026-08-15 实测改的）：第一次接
 * `@cyanheads/pubmed-mcp-server` 时 20 秒不够——`npx` 要先把包下下来，
 * 而那句「连 pubmed 超过 20 秒」读起来像**「这台服务器是坏的」**，
 * 于是人会去换一台、去查网络，唯独不会想到它只是在下载。
 * 预热之后同一台 1 秒就连上了。
 *
 * 代价：一台真的起不来的服务器，要多等 40 秒才说出口。
 * **这个代价是对的**——把「慢」误报成「坏」的成本高得多。
 */
const 默认起动上限毫秒 = 60_000

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
  /**
   * 服务器声明只读，或缺声明的旧 MLAI 通过内置窄契约兼容。其他工具不推断。
   * 它是服务器的一面之词：方案期据它放行，**仍要过原来那道 MCP 门**（信不信得过、哪一档）。
   */
  只读?: true
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
  client: McpClient
  signature: string
  /**
   * **三种传输都可能**（2026-08-19 起）。这里用 SDK 的公共接口，
   * 而不是钉死 `StdioClientTransport`——钉死的话，远端那两种在类型上就进不来。
   */
  transport: Transport
  工具: MCP工具[]
  /** **只有本机那种有**：远端那条没有子进程，也就没有 stderr */
  stderr尾巴: string[]
}

interface 正在连接 {
  signature: string
  workspace: string | undefined
  controller: AbortController
  promise: Promise<一台的结果>
}

export interface MCP调用结果 {
  文字: string
  出错了: boolean
  /** Original server envelope. The tool must project it before exposing it to a model. */
  result?: CallToolResult
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
  private readonly 起着 = new Map<string, 正在连接>()
  private readonly 失败过 = new Map<string, string>()
  private closed = false

  /**
   * @param opts.起动上限毫秒 **可注入只为可测**——按默认值验一次超时要等一分钟，
   *   那种测试没人会跑，于是这条路等于没人看（与 `leaseTtlSeconds` 同一副做法）。
   */
  constructor(private readonly opts: { 取密: 取密; 起动上限毫秒?: number; 可用?: (名: string, 配: McpServer, 工作区?: string) => boolean }) {}

  private get 上限(): number {
    return this.opts.起动上限毫秒 ?? 默认起动上限毫秒
  }

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
    if (this.closed || this.opts.可用?.(名, 配, 默认cwd) === false) return { 服务器名: 名, 工具: [], 失败: this.closed ? 'MCP 连接池已关闭。' : 'MCP 服务器已停用、移除或配置已变化，请求未发送；请重新加载会话。' }
    /**
     * **远端那种没有 cwd**（2026-08-19）：它已经跑在别处了，
     * 我们连它的进程都看不见，更谈不上决定它从哪个目录起。
     */
    const cwd = 是远端MCP(配) ? undefined : (配.cwd ?? 默认cwd)
    const k = this.键(名, cwd)
    // Credentials are represented only by this in-memory digest, never logged.
    const keys = 是远端MCP(配) ? 配.headers : 配.env
    const signature = createHash('sha256').update(JSON.stringify([配, cwd, (keys ?? []).map(key => [key, this.opts.取密(名, key)])])).digest('hex')
    const 有 = this.连着.get(k)
    const 在起 = this.起着.get(k)
    if (有?.signature === signature) return { 服务器名: 名, 工具: 有.工具 }
    if (在起?.signature === signature) return 在起.promise

    const pending: 正在连接 = { signature, workspace: 默认cwd, controller: new AbortController(), promise: undefined as unknown as Promise<一台的结果> }
    // Claim the replacement before the first await. New requests and explicit
    // close can now invalidate it while the previous generation is shutting down.
    this.连着.delete(k)
    this.起着.set(k, pending)
    在起?.controller.abort()
    pending.promise = (async () => {
      await Promise.all([
        ...(有 ? [限时(有.client.close(), 5000, 'MCP 关闭超时').catch(() => {})] : []),
        ...(在起 ? [在起.promise] : []),
      ])
      if (this.closed || pending.controller.signal.aborted || this.起着.get(k) !== pending) return { 服务器名: 名, 工具: [], 失败: 'MCP 初始化已取消，连接未启用。' }
      return this.起一台(名, 配, cwd, k, pending)
    })().then(result => {
      if (this.起着.get(k) === pending) {
        if (result.失败) this.失败过.set(k, result.失败)
        else this.失败过.delete(k)
      }
      return result
    }).finally(() => { if (this.起着.get(k) === pending) this.起着.delete(k) })
    return pending.promise
  }

  private async 起一台(
    名: string,
    配: McpServer,
    cwd: string | undefined,
    k: string,
    pending: 正在连接,
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
    /**
     * **两种形态要的密钥不是同一样东西，但纪律是同一条**（2026-08-19）：
     * 本机那种要环境变量，远端那种要请求头——
     * **都只在配置里留名字，值一律走钥匙串**。
     */
    const 要的密钥 = 是远端MCP(配) ? (配.headers ?? []) : (配.env ?? [])
    for (const 变量 of 要的密钥) {
      const 原值 = this.opts.取密(名, 变量)
      // 只在远端那条补 `Bearer `：本机那条是环境变量，值原样给
      const v = 是远端MCP(配) && 原值 !== undefined ? 补认证方案(变量, 原值) : 原值
      if (v === undefined || v === "") 缺的.push(变量)
      else env[变量] = v
    }
    /**
     * **请求头的值只能是 ASCII**（2026-08-19，写完两分钟内自己踩到的）。
     *
     * HTTP 头走 Latin-1，塞一个中文进去，`fetch` 抛的是
     * `Cannot convert argument to a ByteString because the character at index 7
     * has a value of 25105`——**那句话对着一个刚填完令牌的人什么都没说**。
     *
     * 只在远端那条查：本机那条走的是环境变量，中文没问题。
     */
    if (是远端MCP(配)) {
      // 令牌中间断了行（两头的已经去掉）：fetch 会拒绝这个头、报一句看不懂的错——在这里说清楚（审查 09-29）
      const 断行的 = Object.entries(env).filter(([, v]) => /[\r\n]/.test(v))
      if (断行的.length > 0) {
        return {
          服务器名: 名,
          工具: [],
          失败: `${断行的.map(([k]) => k).join("、")} 的值中间有换行——令牌应该是一整行，重新粘一次。`,
        }
      }
      const 带中文的 = Object.entries(env).filter(([, v]) => /[^\x00-\xff]/.test(v))
      if (带中文的.length > 0) {
        return {
          服务器名: 名,
          工具: [],
          失败:
            `${带中文的.map(([k]) => k).join("、")} 的值里有非 ASCII 字符——` +
            `HTTP 请求头装不下它。令牌一般是纯字母数字，检查一下是不是复制时多带了什么。`,
        }
      }
    }

    if (缺的.length > 0) {
      return {
        服务器名: 名,
        工具: [],
        失败: `还没填 ${缺的.join("、")}——去「MCP 服务器」那一屏填上再连。`,
      }
    }

    const 尾巴: string[] = []
    /**
     * **按形态挑传输**（2026-08-19）。
     *
     * 官方 SDK 三种都有；我们收两种：`http`（streamable HTTP，现在的标准）
     * 与 `sse`（老那套）。作者的原话是*「新的，或者老的，还是要适配的」*——
     * 存量文档里 SSE 仍然常见，只收新的等于把一半的服务器挡在外面。
     *
     * **远端那条没有 stderr**：本机那条连不上时子进程的 stderr 往往是唯一线索
     * （下面专门留了尾巴），而 HTTP 只有状态码与响应体。
     * 所以那条路上的错误信息更要紧——见下面 `catch` 里那段。
     */
    /**
     * **这一处的 `as Transport` 是 SDK 类型声明与我们更严的编译选项之间的摩擦，
     * 不是语义问题**（2026-08-19）。
     *
     * `Transport` 接口写的是 `sessionId?: string`，而 `StreamableHTTPClientTransport`
     * 上是 `sessionId: string | undefined`——在 `exactOptionalPropertyTypes: true`
     * 下这两者不兼容（「可以没有这个属性」与「有这个属性但可能是 undefined」
     * 是两件事，而那个区分正是我们打开这个选项想要的）。
     *
     * **收窄到这一行**，而不是把编译选项调松：那个选项在别处替我们挡过
     * 真实的错误。
     */
    const requestFetch = new McpRequestFetch()
    const transport: Transport = (是远端MCP(配)
      ? 配.type === "sse"
        ? new SSEClientTransport(new URL(配.url), {
            fetch: requestFetch.fetch,
            requestInit: { headers: env },
            eventSourceInit: { fetch: (u, i) => mcpSafeFetch(u, { ...i, headers: { ...i?.headers, ...env } }) },
          })
        : new StreamableHTTPClientTransport(new URL(配.url), {
            fetch: requestFetch.fetch,
            requestInit: { headers: env },
          })
      : new StdioClientTransport({
      command: 配.command,
      ...(配.args ? { args: [...配.args] } : {}),
      ...(cwd ? { cwd } : {}),
      ...(Object.keys(env).length > 0 ? { env: { ...默认环境(), ...env } } : {}),
      /**
       * **接住而不是继承。** 默认 `inherit` 会把服务器的诊断输出印进我们的进程；
       * 而它崩掉时 stderr 往往是唯一线索——不留就等于把线索扔了。
       */
      stderr: "pipe",
    })) as Transport

    const client = new McpClient(transport, requestFetch)
    const signal = pending.controller.signal
    const abort = () => { void client.close().catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    // Attach before initialization: early process stderr is often the only diagnosis.
    const 子进程的 = transport instanceof StdioClientTransport ? transport : undefined
    子进程的?.stderr?.on('data', (b: Buffer) => {
      for (const 行 of String(b).split('\n')) {
        if (!行.trim()) continue
        尾巴.push(行)
        if (尾巴.length > 留几行) 尾巴.shift()
      }
    })

    try {
      /**
       * **超时那句话要把「可能只是在下载」说出来**（2026-08-15 实测）。
       * 不说的话，一次首启下载会被读成「这台服务器是坏的」。
       */
      await 限时(
        waitForMcp(client.connect(client.channel, { signal, timeout: this.上限 + 1000 }), signal),
        this.上限,
        `连 ${名} 超过 ${Math.round(this.上限 / 1000)} 秒。` +
          `如果它是用 npx / uvx 起的，第一次要先把包下下来，多半就是慢在这儿——` +
          `在终端里先跑一遍那条命令，下完再回来按「试一次」。`,
      )
      const 列 = await 限时(waitForMcp(client.listTools(undefined, { signal, timeout: this.上限 }), signal), this.上限, `列 ${名} 的工具超时`)
      const 兼容只读 = legacyMlaiReads(client.getServerVersion(), 列.tools)
      const 工具: MCP工具[] = 列.tools.map((t) => ({
        全名: 工具全名(名, t.name),
        服务器名: 名,
        工具名: t.name,
        /** **描述缺席就如实说缺席**，不编一句——模型会照着编出来的那句去用它 */
        描述: t.description ?? `${名} 提供的工具 ${t.name}（这台服务器没有给出说明）`,
        入参: t.inputSchema,
        ...(t.annotations?.readOnlyHint === true || 兼容只读.has(t.name) ? { 只读: true as const } : {}),
      }))
      if (this.closed || signal.aborted || this.起着.get(k) !== pending) throw new Error('MCP 初始化已取消，连接未启用。')
      if (this.opts.可用?.(名, 配, pending.workspace) === false) throw new Error('MCP 服务器配置在初始化期间已变化，连接未启用，请求未发送。')
      if (!client.transport) throw new Error('MCP 服务器在发现工具期间断开，连接未启用。')
      const connection: 一条连接 = { client, signature: pending.signature, transport, 工具, stderr尾巴: 尾巴 }
      client.onclose = () => {
        if (this.连着.get(k) !== connection) return
        this.连着.delete(k)
        this.失败过.set(k, `${名} 的 MCP 连接已断开；下次使用时重新连接，已发送请求不会自动重放。`)
      }
      this.连着.set(k, connection)
      return { 服务器名: 名, 工具 }
    } catch (e) {
      await 限时(client.close(), 5000, 'MCP 关闭超时').catch(() => {})
      const 原因 = e instanceof Error ? e.message : String(e)
      const 补 = 尾巴.length > 0 ? `\n它自己说：\n${尾巴.join("\n")}` : ""
      return { 服务器名: 名, 工具: [], 失败: `${原因}${补}` }
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }

  /**
   * 调一次工具。
   *
   * Preserve the original result and a compatibility text summary. A lost response
   * is an unknown outcome, never permission to replay a write after reconnecting.
   */
  async 调(
    名: string,
    配: McpServer,
    工具名: string,
    参数: Record<string, unknown>,
    默认cwd?: string,
    signal?: AbortSignal,
    expectedTool?: MCP工具,
  ): Promise<MCP调用结果> {
    let 连: 一条连接 | undefined
    const cwd = 是远端MCP(配) ? undefined : (配.cwd ?? 默认cwd)
    const k = this.键(名, cwd)
    try {
      if (signal?.aborted) throw new McpCallCancelled(false)
      const 备 = await waitForMcp(this.备好(名, 配, 默认cwd), signal)
      if (备.失败) return { 文字: `${名} 没连上：${备.失败}`, 出错了: true }
      if (this.opts.可用?.(名, 配, 默认cwd) === false) return { 文字: 'MCP 服务器已停用、移除或配置已变化，请求未发送。', 出错了: true }
      连 = this.连着.get(k)
      if (!连) return { 文字: `${名} 没连上，请求未发送。`, 出错了: true }
      if (expectedTool) {
        const current = 连.工具.find(tool => tool.工具名 === 工具名)
        if (!current || current.只读 !== expectedTool.只读 || JSON.stringify(current.入参) !== JSON.stringify(expectedTool.入参)) {
          return { 文字: `${名}__${工具名} 的定义已变化，请新建会话重新加载工具及权限声明；本次请求未发送。`, 出错了: true }
        }
      }
      const r = await 连.client.callTool({ name: 工具名, arguments: 参数 }, undefined, signal ? { signal } : undefined)
      return { 文字: 摘出文字(r), 出错了: r.isError === true, result: CallToolResultSchema.parse(r) }
    } catch (e) {
      if (e instanceof McpConnectionError && 连 && this.连着.get(k) === 连) {
        this.连着.delete(k)
        this.失败过.set(k, e.message)
        await 限时(连.client.close(), 5000, 'MCP 关闭超时').catch(() => {})
      }
      const 补 = !(e instanceof McpCallCancelled) && 连?.stderr尾巴.length ? `\n它自己说：\n${连.stderr尾巴.join("\n")}` : ""
      return { 文字: `${名}__${工具名} 调用失败：${e instanceof Error ? e.message : String(e)}${补}`, 出错了: true }
    }
  }

  /** 关掉一台（改了配置之后要重连）。**没连着也算成功**——那本来就是想要的状态 */
  async 关(名: string, cwd?: string): Promise<void> {
    const k = this.键(名, cwd)
    const 连 = this.连着.get(k)
    const pending = this.起着.get(k)
    this.连着.delete(k)
    this.起着.delete(k)
    this.失败过.delete(k)
    pending?.controller.abort()
    await Promise.all([
      ...(连 ? [限时(连.client.close(), 5000, 'MCP 关闭超时').catch(() => {})] : []),
      ...(pending ? [pending.promise] : []),
    ])
  }

  /** Configuration/credential changes and disable/remove affect every directory scope. */
  async 关服务器(名: string): Promise<void> {
    const keys = new Set([...this.连着.keys(), ...this.起着.keys(), ...this.失败过.keys()])
    await Promise.all([...keys].filter(key => key.split('\x00')[0] === 名).map(key => this.关(名, key.split('\x00')[1] || undefined)))
  }

  /** 全关掉（退出时）。**每个单独兜底**：一个关不掉不该拖住其余的 */
  async 全关(): Promise<void> {
    this.closed = true
    const keys = new Set([...this.连着.keys(), ...this.起着.keys()])
    await Promise.all([...keys].map(key => this.关(key.split('\x00')[0]!, key.split('\x00')[1] || undefined)))
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

  状态(名: string, cwd?: string): { state: 'unknown' | 'ready' | 'failed'; error?: string; 工具: MCP工具[] } {
    const ready = this.查(名, cwd)
    if (ready) return { state: 'ready', 工具: ready.工具 }
    const error = this.失败过.get(this.键(名, cwd))
    return error ? { state: 'failed', error, 工具: [] } : { state: 'unknown', 工具: [] }
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
 * **`Authorization` 只填了令牌，就替人补上 `Bearer `**（2026-09-29）。
 *
 * 作者接自己的 MCP，填了一个有效的令牌却拿到 `invalid_token`：
 * 服务器要的是 `Authorization: Bearer <令牌>`，而「MCP 服务器」那一屏的框
 * 从没说过要连 `Bearer ` 一起填——**不知道 Bearer 是什么的人只会填令牌**。
 *
 * **补在请求头拼出来的这一处，而不是存进钥匙串那一处**：
 * 这是所有远端头值唯一的出口，填的、以前存下的裸令牌都经过这里，
 * 已经存着裸令牌的人不用重填就能连上；钥匙串里存的仍是他填的原样。
 *
 * 只动名字是 `Authorization`（不分大小写）的头；
 * 值已经带了方案（`Bearer x`、`bearer x`、`Basic x`、`Token x`……，
 * 即「一个方案词 + 空白 + 其余」）就原样留着，不会补出两个 `Bearer `。
 * 空值留空——「没填」要照旧点名，不能被补成一个只有 `Bearer ` 的头。
 */
export function 补认证方案(头名: string, 值: string): string {
  const v = 值.trim()
  if (头名.toLowerCase() !== "authorization") return 值
  if (v === "") return v
  // 只有一个方案词、没有令牌：当作没填（不补出 `Bearer Bearer`），让「还差 Authorization 没填」照旧点名
  if (/^bearer$/i.test(v)) return ""
  // RFC 9110 的 auth-scheme 是一个 token；后面至少一个空白再跟凭据
  if (/^[A-Za-z0-9!#$%&'*+.^_`|~-]+\s+\S/.test(v)) return v
  return `Bearer ${v}`
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
