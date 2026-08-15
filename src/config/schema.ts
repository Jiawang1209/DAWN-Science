/**
 * Provider 注册表的类型与校验。
 *
 * **2026-08-08 返工 R2：删掉 `endpoints` 段。**
 *
 * 原设计是两段式——`endpoints`（baseUrl + apiKey + models 清单）与 `agents`。
 * 它要求用户手写模型服务的连接信息，**那是自建 LLM provider 抽象**，
 * 正是规格 §4 非目标清单里明令不做的一条。
 *
 * pi-ai 内置 39 个 provider，各自带 baseUrl、API 形态与生成的模型目录。
 * 配置只需说「用哪个 provider 的哪个模型」，连接细节交给 pi。
 * 顺带修好的两件事：
 *   - **anthropic / google 的原生 API 现在走得通**——旧实现写死 `openAICompletionsApi()`
 *   - **模型目录不必手维护**——旧配置里 models 清单要人跟着 provider 一起更新
 *
 * 凭证按 **provider** 存（原来按 endpoint），由 app 的凭证库管，配置文件里不出现。
 *
 * 这里用 zod。与工具 schema 的分工不变：**zod 管配置校验，TypeBox 管 agent 工具 schema**。
 */
import { z } from "zod"

/** agent 被授予的能力。授权是显式的白名单，不做能力推断（规格 4.1 否决第三条）。 */
export const CapabilitySchema = z.enum(["fs_write", "exec", "mcp", "hooks", "chat"])
export type Capability = z.infer<typeof CapabilitySchema>

/**
 * 进程内跑 pi 的编码 agent，直连 pi 内置 provider。
 *
 * `provider` 必须是 pi 认识的 id（`knownProviders()`），**由 loader 在加载期校验**——
 * 拼错一个 provider 名不该留到建会话时才崩。
 */
const NativeAgentSchema = z
  .object({
    kind: z.literal("native"),
    /** pi 的内置 provider id，如 deepseek / anthropic / openai */
    provider: z.string().min(1),
    /**
     * 必须钉具体版本的 model id。Spike A 实测：pi 的 deepseek provider 只认
     * deepseek-v4-flash / deepseek-v4-pro，别名 deepseek-chat 不在注册表内。
     * 且指向会漂移的别名与本项目「可追溯」的核心主张冲突。
     */
    model: z.string().min(1),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()

/** 在 PTY 里起一个外部 CLI（claude / codex 等），我方只管进程与隔离配置。 */
const PtyAgentSchema = z
  .object({
    kind: z.literal("pty"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()

/**
 * 外部 CLI 的 **headless 模式**（①-C）：我方驱动它、并翻译它吐出的结构化事件。
 *
 * ## 与 `pty` 的区别不是形态，是语义
 *
 * `pty` 拿到的是**终端字节流**——ANSI 转义、边框、spinner。那里面没有
 * 「工具调用」这个概念，所以一个 PTY 托管的 claude 会话在账本上只能是
 * **一条 `pty_session` Run**：它读了什么、改了什么、花了多少，一概不知道。
 * **不是我们没记，是拿不到。**
 *
 * `cli` 拿到的是**结构化事件**（Spike G 实测）：
 * ```
 * claude  --print --output-format stream-json --input-format stream-json
 * codex   exec --json  /  exec resume <thread_id> --json
 * ```
 * 于是它的工具调用、消息、用量能落进已有的那一套——transcript、
 * `tool_call:<工具名>` 的 Run、变更 pane、成本栏。
 * **不变式 3 与 5 第一次能覆盖外部 CLI。**
 *
 * ## 所以刻意新增一种，而不是复用 `pty`
 *
 * 形态像不等于语义同。复用会让「这个会话有没有终端」这个判断从此不可靠，
 * 而界面正靠它决定画对话还是画终端。
 *
 * **`pty` 没有被取代**：它作为**通用终端**保留（跑任意命令，也可手动起
 * 那两个 CLI 的 TUI）——作者定的定位。
 */
const CliAgentSchema = z
  .object({
    kind: z.literal("cli"),
    /** 可执行文件名或路径，如 `claude` / `codex` */
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    /**
     * 默认用哪个模型。**缺省 = 用 CLI 自己的默认**，不替它选一个。
     */
    model: z.string().min(1).optional(),
    /**
     * 模型选择器里能选哪些。**只能由配置声明**（Spike H）。
     *
     * pi 那边有模型目录（`availableModels(provider)`），**两个 CLI 都没有
     * 对应的接口**：claude 认别名（`opus`/`sonnet`/`haiku`）也认全名，
     * codex 认模型名，但**都没有「列出可选项」的方式**。
     *
     * 没声明就不显示模型选择器——**与 native 那边「取不到就不假装有得选」
     * 是同一条纪律**。
     */
    models: z.array(z.string().min(1)).optional(),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()
  /**
   * ## 关于 `model` 与 `models` 的一条纪律（2026-08-09 反转过一次）
   *
   * **`model` 缺省是正常的，而且多半是对的。**
   *
   * 上一版这里有一条 `refine`：声明了 `models` 就必须声明 `model`，
   * 理由是「选择器要知道当前是哪个才画得出来」。**那条规则是错的**，
   * 因为它逼着配置去**钉死一个模型**——而钉死模型会**覆盖掉用户自己
   * CLI 的配置**。作者试用时两个都撞上了：
   *
   * - 他的 `~/.claude/settings.json` 写着 `"model": "opus[1m]"`，
   *   我们传 `--model sonnet` 把它盖掉了
   * - 他的 `~/.codex/config.toml` 写着 `model = "gpt-5.6-sol"`，
   *   我们传 `--model gpt-5.1-codex`，**直接 400**（他的账号不支持那个）
   *
   * **覆盖用户自己的配置，比没有选择器坏得多。**
   * 所以：不声明 `model` 时**不传 `--model`**，CLI 用它自己的默认；
   * 选择器照常显示，当前那格标「CLI 默认」——**那是实情，不是缺陷**。
   */

/**
 * 一个 **Jupyter 内核**（②-A · K4）。
 *
 * ## 为什么 `command` 是 kernelspec 的名字，不是解释器路径
 *
 * 路径由 kernelspec 决定，**我们的发现是唯一事实来源**——
 * K2 收尾时正是修掉了「两个事实来源」：原本用 `spawnteract.launch(名字)`，
 * 它走自己那套发现，于是「DAWN 看得见的内核」与「起得来的内核」
 * 可能不是同一批，症状是**「设置里列着，点了起不来」**。
 *
 * 想知道本机有哪些名字、各自指向哪个解释器：**设置 → 内核**。
 * 那一页把解释器路径连同名字一起列出来，就是为了不让人蒙着选
 * （作者 2026-08-10：*「否则很盲目」*）。
 *
 * ## 与前三种的区别
 *
 * `native` / `cli` 是**agent**（会自己思考），`pty` 是**终端**（字节流），
 * 而 `kernel` 是**执行器**：它不思考，只执行你给的代码，
 * 输出是**结构化条目**（图/表/报错各是一种东西）。
 */
const KernelAgentSchema = z
  .object({
    kind: z.literal("kernel"),
    /**
     * **要哪个语言。** 路径不写在这里——它在「设置 → 内核」里，
     * 由 `getInterpreters` 提供（作者 2026-08-10 定的机制：
     * *「只有配置了，我们才能调用」*）。
     *
     * 为什么不写在配置里：`providers.yaml` 是**你手写的**、且我们承诺不覆盖它，
     * 而路径是**这台机器上的事实**，换台机器就变。两者混在一起，
     * 配置文件就没法在机器之间搬。
     */
    language: z.enum(["python", "R"]).optional(),
    /**
     * kernelspec 的名字。**旧路径**，给已经在用 kernelspec 的人留着。
     *
     * 与 `language` 二选一：都给时 `language` 优先（它更可控——
     * 你指哪个解释器就跑在哪个上，而 kernelspec 的名字可能指向别的环境）。
     */
    command: z.string().min(1).optional(),
    capabilities: z.array(CapabilitySchema),
  })
  .strict()
  .refine((v) => v.language !== undefined || v.command !== undefined, {
    // **两个都不给就没法起**：与其建会话时才报，不如加载配置时就拦下
    message: "kernel agent 要么给 language（python / R），要么给 command（kernelspec 名字）",
  })

export const AgentDefSchema = z.discriminatedUnion("kind", [
  NativeAgentSchema,
  PtyAgentSchema,
  CliAgentSchema,
  KernelAgentSchema,
])
export type AgentDef = z.infer<typeof AgentDefSchema>

/**
 * 一个 provider 的**连接设置**（2026-08-10）。
 *
 * ## 为什么需要它
 *
 * pi 自带 40 个 provider 的地址，但**有 8 个不自带**——
 * `amazon-bedrock` / `azure-openai-responses` / `cloudflare-ai-gateway` /
 * `cloudflare-workers-ai` / `google-vertex` / `opencode` / `opencode-go` / `radius`。
 * 它们的地址跟账号、区域、项目走（Azure 的 deployment、Vertex 的 project、
 * Cloudflare 的 account id…），**pi 没法替你填**。
 *
 * 此前这 8 个即使填了 key 也连不上，而界面不会告诉你为什么。
 * 同一个口子还顺带解决另一类：**自建的 vLLM / Ollama / 任何 OpenAI 兼容端点**——
 * 它们根本不在那 40 个里，要的正是同一样东西。
 *
 * ## `apiKey` 不在这里
 *
 * **密钥永远在 OS 的加密存储里**，不进这个文件。这里只放「连到哪、说哪种话」——
 * 那些不是秘密，而且用户应当能直接读、直接改。
 */
const ProviderConnectionSchema = z
  .object({
    /** 端点地址。**这 8 个和自建端点的要害就是它** */
    baseUrl: z.string().min(1).optional(),
    /**
     * 协议形态，如 `openai-completions` / `anthropic-messages`。
     *
     * **不给默认值**：猜错的后果是请求发出去、对面用另一种格式回，
     * 而错误信息与「猜错了协议」毫无关系。缺省时由 pi 自己决定。
     */
    api: z.string().min(1).optional(),
    /** 额外请求头。网关类（Cloudflare AI Gateway 等）常要它 */
    headers: z.record(z.string(), z.string()).optional(),
    /**
     * 这个端点有哪些模型。
     *
     * **那 8 个内置 provider 不用写**——pi 认识它们的模型，只是不知道地址。
     * **自建端点必须写**：pi 没法凭空知道你的 vLLM 上跑着什么，
     * 而不写的话模型选择器会是空的，且没有任何一句话解释为什么。
     */
    models: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>

/**
 * `.strict()`：**多余的顶层段一律拒绝**。
 * 这条不是洁癖——旧配置里的 `endpoints` 若被静默忽略，用户会以为它还生效，
 * 而实际上凭证与 baseUrl 全都没被读。**失败必须出声（规格 7.5）。**
 */
/**
 * 一台 MCP 服务器（2026-08-15）。
 *
 * ## 为什么是「命令 + 参数」而不是一个 URL
 *
 * 第一批只做 **stdio** 传输：绝大多数 MCP 服务器是本地进程
 * （`npx -y @modelcontextprotocol/server-postgres …`）。
 * HTTP/SSE 那支要处理鉴权、重连、CORS，是另一件事——**先不假装支持**。
 *
 * ## 密钥不写在这里
 *
 * `env` 里只写**环境变量的名字**，值存在系统钥匙串里
 * （`CredentialsPort`，键是 `mcp:<服务器名>:<变量名>`）。
 * **这份 YAML 是会被分享、会被 git 追踪的**——把 key 写进去，
 * 它迟早出现在某个仓库里。这条是作者的红线。
 */
export const McpServerSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    /**
     * 要传给它的环境变量**名**（值在钥匙串里）。
     *
     * **只有名字**：`["PGURL"]` 的意思是「起它之前，
     * 从钥匙串取 `mcp:<服务器名>:PGURL` 填进去」。
     * 取不到就**不起它并说清缺哪个**——静默起一个连不上库的服务器，
     * 症状会表现成「这个工具怎么老是失败」。
     */
    env: z.array(z.string().min(1)).optional(),
    /**
     * 起它的工作目录。**不给就用会话的工作区**——
     * 不猜一个（比如家目录）：一个文件服务器起错目录，
     * 它能读到的东西就完全不是你以为的那些。
     */
    cwd: z.string().min(1).optional(),
    /**
     * ## 两个开关**不在这里**（2026-08-15 改的）
     *
     * `trusted` / `disabled` 一度写在这份配置里。**那是个漏洞**：
     * 项目级名单住在 `.dawn/mcp.yaml`，**会跟着仓库被 clone 下来**——
     * 于是别人的仓库可以声明「这台我信得过」，而那台服务器是他写的。
     *
     * 信任只能由**坐在这台机器前的人**拨。所以两个开关都落在本机的库里
     * （`settings` 的 `mcp.trusted.<名>` / `mcp.off.<名>`），
     * 而不是任何一份会被分享的文件里。**一个事实一个家**。
     */
  })
  .strict()
export type McpServer = z.infer<typeof McpServerSchema>

export const ProviderRegistrySchema = z
  .object({
    agents: z.record(z.string(), AgentDefSchema),
    /**
     * provider 的连接设置。**可选**——绝大多数 provider 的地址 pi 自带，
     * 这一段只为那 8 个不自带的、以及自建端点存在。
     */
    providers: z.record(z.string(), ProviderConnectionSchema).optional(),
    /**
     * MCP 服务器名单（2026-08-15）。**可选**——没配就一个都不起。
     *
     * 键是服务器名，**它会成为工具名的前缀**（`<服务器>__<工具>`）：
     * 两台服务器各有一个 `query` 是常事，不加前缀模型就分不清打给谁。
     */
    mcp: z.record(z.string(), McpServerSchema).optional(),
  })
  .strict()
export type ProviderRegistry = z.infer<typeof ProviderRegistrySchema>
