/**
 * Native 运行时：坐 pi 第三层 `createAgentSession()`。
 *
 * **2026-08-08 返工 R2 整体重写。**
 *
 * 旧实现坐在第二层最底下——裸 `Agent` + 手搓 `createProvider({baseUrl, api: openAICompletionsApi()})`
 * + **`tools: []`**。后果三条，每一条都是真实缺陷：
 *   1. **agent 一个工具都没有**，读不了文件也跑不了命令
 *   2. 写死 openai-completions，**anthropic / google 的原生 API 走不通**
 *   3. 模型目录要用户手写进 providers.yaml
 *
 * 现在：provider 与模型目录来自 pi-ai（39 个内置），工具、harness、压缩、skills
 * 来自 pi-agent-core，装配由 pi-coding-agent 的 `createAgentSession()` 完成。
 * 调用签名见 `spikes/FINDINGS.md` 的 Spike A-2 一节。
 *
 * **本文件的职责因此变得很窄**：把 pi 的会话事件翻译成本项目的 `AgentEvent`，
 * 以及把每个会话隔离在自己的 agentDir 里。
 */
import { 读调用策略 } from "../skills/invocation.js"
import { UserFacingError } from "../errors.js"
import { loadSubagentsFrom, AGENTS_DIR } from "../subagent/definitions.js"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, isAbsolute } from "node:path"
import {
  createAgentSession,
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createSyntheticSourceInfo,
} from "@earendil-works/pi-coding-agent"
import { StuckGuard, type GuardedCall } from "./stuck-guard.js"
import { budgetToolResult } from "./tool-output.js"

/** pi 记下的一条消息。**只声明我们真的读的那几个字段** */
type 历史消息 =
  | { role: "user"; content: string | { type: string; text?: string }[] }
  | {
      role: "assistant"
      content: ({ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: unknown } | { type: "thinking" })[]
    }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: { type: string; text?: string }[] }

/** 内容可能是一段字符串，也可能是一串块。**图片不还原成文字**，如实标一下 */
function 取文本(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content
  return content
    .map((c) => (c.type === "text" ? (c.text ?? "") : c.type === "image" ? "（图片）" : ""))
    .join("")
}
import { ProvenanceProbe, 套上溯源, 并进登记新建, isProducing, 只读工具的空事实 } from "./provenance.js"
import { createSubagentTool } from "../subagent/tool.js"
import { 挑工具后端 } from "../remote/tools.js"
import { createRunCodeTool, 内核指引 } from "../tools/run-code.js"
import { officeTools, type Office开关 } from "../tools/office/index.js"
import { browserTools, type Browser开关 } from "../tools/browser/index.js"
import { memoryTools, 技能沉淀指引, type Memory开关, type Memory依赖 } from "../tools/memory/index.js"
import { createLookAtImageTool } from "../tools/look-at-image.js"
import { 产物登记, 重定向目标 } from "../policy/artifacts.js"
import { 团队调度器 } from "../team/scheduler.js"
import { createTeamTools, 队长协议 } from "../team/tools.js"
import { 描述图片 } from "./vision.js"
import { createMcpTools } from "../tools/mcp-tool.js"
import type { 对话内核 } from "../kernel/挂载.js"
import { RUN_AS_NODE } from "../subagent/protocol.js"
import type { CredentialStore, ThinkingLevel } from "@earendil-works/pi-ai"
import type {
  AgentEvent,
  AgentRuntime,
  RemoteLike,
  ContextUsage,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
  RestoredItem,
  ImageAttachment,
  送法,
  会话开关,
} from "./types.js"

/** 工具结果正文的截断长度。完整内容留在 pi 的会话记录里，事件流只带摘要 */

/**
 * 工具授权门。返回字符串即**拒绝执行**，字符串是给模型看的理由。
 *
 * 挂在这里而不是 pi 的扩展系统，理由见 FINDINGS 的 Spike A-2 · Q5：
 * 扩展只能从 `<agentDir>/extensions/*.ts` 加载并靠 jiti 运行时转译，
 * **打包进 Electron 后是否还通无法先验断言，而授权门静默失效比没有还危险**。
 * 包装工具定义则不碰文件系统与转译器。
 */
export interface ToolGateContext {
  /** 这段会话的工作区绝对路径 */
  workspace: string
  /** 这是不是一台远端机器。**远端跑错的代价可能是别人的**（②-B 计划 §3.2） */
  remote?: boolean
  /** 哪段会话在调（2026-08-22，定时任务按会话定档） */
  sessionId?: string
  /** 这段会话自己创建的文件（2026-08-23）：删它们不算删除 */
  本会话创建?: (绝对路径: string) => boolean
}

/**
 * 门收语境（2026-08-13）。
 *
 * 此前签名只有 `(名字, 参数)`——而判据要判「写到工作区外面了没有」，
 * 就必须知道工作区在哪。**包装器本身是按会话造的**（`gatedTools(cwd, …)`），
 * 语境就在手边，往下传一层即可；让门自己去查会话，等于给它一条它不该有的依赖。
 */
export type ToolGate = (
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolGateContext,
) => import("../policy/permissions.js").门的决定

export interface NativeRuntimeOptions {
  /** Office 插件的族开关（设置里那张插件卡；不给 = 不装）。每次建会话时问一遍，改了开关下一段生效 */
  officeEnable?: () => Office开关
  /** 浏览器插件的族开关（2026-08-25，学自 dsh-reef）；同一套约定 */
  browserEnable?: () => Browser开关
  /** 记忆插件（2026-08-25，学自 dsh-memory-evolve）：族开关 + 目录依赖；同一套约定 */
  memoryEnable?: () => Memory开关
  memoryDeps?: () => Memory依赖
  /**
   * 记忆快照（规格 `2026-08-25-记忆-design.md` §三）：建会话时渲染一次拼进
   * 系统提示词——**确认的记忆下一段会话生效**，与插件开关同一条契约。
   * 空串 = 没有记忆，一个字都不注入。
   */
  memorySnapshot?: (workspace: string) => string
  /**
   * 按 provider 取凭证。**必须带缓存**——见下方 `ModelRuntime` 的注释。
   *
   * **省略时交给 pi 自己解析**：它会读 `~/.pi/auth.json`，并经 `getEnvApiKey()`
   * 认 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` 这类既有环境变量。
   * 桌面版注入自己的实现（safeStorage），CLI 走默认即可。
   */
  credentials?: CredentialStore
  /** 模型目录缓存的落点。省略则只在内存里 */
  modelsPath?: string
  /** 可选的授权门。给出时内置工具被替换为包装过的版本 */
  gate?: ToolGate
  /**
   * **按会话的权限档**（codex-polish 第二档，2026-08-22，学自 dsh-codex-ui 把权限档放在输入卡上）。
   * 门本身在 `gate` 里、档位表在壳那边（定时任务 2026-08-22 先有的）；这里只是把它**摆到输入卡的会话设置菜单里**：
   * `取` 给出这一段的覆盖值（没覆盖就 undefined），`设` 写覆盖（undefined = 跟随全局设置），`全局` 给当前全局档好写在菜单上。
   * 不给就不摆这一条。
   */
  permissionTier?: {
    取: (sessionId: SessionId) => "allow-all" | "ask-risky" | "deny-risky" | undefined
    设: (sessionId: SessionId, 档: "allow-all" | "ask-risky" | "deny-risky" | undefined) => void
    全局: () => "allow-all" | "ask-risky" | "deny-risky"
  }
  /**
   * 技能的两个位置（S20，2026-08-15）。**不给就完全是原来的样子。**
   *
   * pi 自带 Agent Skills 的全套（发现、注入系统提示、`/skill:名` 展开、诊断），
   * **这一层我们不写**（路线图 S20 的原话）。我们只负责告诉它去哪儿找——
   * 因为它默认的两个位置在我们这儿都不好使（见 `start` 里的说明）。
   */
  /**
   * 子 agent 的三层目录（2026-08-22，学自 dsh-agency-agents）。项目那一层固定是 `<工作区>/.dawn/agents`；
   * 自带的随应用发布、只读；你写的在全局目录。同名时项目 > 全局 > 自带。
   * **每一份定义同时也是一个技能**（`/skill:名` 把人设叫进主对话）——同一份文件、两处登记。
   */
  subagents?: {
    全局目录?: string
    自带目录?: string
    /** 自带的停没停（2026-08-23，设置里那把键）——与设置屏同一个闭包 */
    自带停用?: ((name: string) => boolean) | undefined
  }
  skills?: {
    /** 全局技能目录。**一个固定位置**，不跟着会话走 */
    全局目录?: string
    /** 项目里那个目录名，例如 `.dawn/skills` */
    项目目录名?: string
    /** 自带技能（随应用发布，只读）。**空目录等于没有**，所以我们带几个 */
    自带目录?: string
    /** 自带技能的档位（2026-08-23）：文件只读，档位记在设置里；没记过回 undefined = 按文件 */
    自带档?: ((name: string) => "model" | "manual" | "off" | undefined) | undefined
  }
  /**
   * MCP（2026-08-15）。**给了才有那些外部工具。**
   *
   * 与 `kernels` 同一副做法：不给就完全是原来的样子——
   * CLI、测试替身、没配 MCP 的用户一个字节都不受影响。
   *
   * `取工具` 是 **async 的**：起一台服务器要跑一个进程、说一轮协议。
   * 所以 `toolsFor` 那条同步路径拿不到它——工具在 `start()` 里备好，
   * 见下面 `起会话` 里的注释。
   */
  mcp?: {
    取工具: (工作区: string | undefined) => Promise<{
      工具: readonly import("../mcp/客户端.js").MCP工具[]
      名单: readonly { 名: string; 服务器: import("../config/schema.js").McpServer }[]
      问题: readonly string[]
    }>
    池: import("../mcp/客户端.js").MCP池
    门?: (服务器名: string, 指纹: string, sessionId?: string) => import("../policy/permissions.js").门的决定
  }
  /**
   * 对话的内核（②，2026-08-14）。**给了才有 `run_code` 这个工具。**
   *
   * 不给就完全是原来的样子——这是作者定的纪律的直接形态：
   * *「尽量在新增加功能的时候，尽可能不要更改旧功能。」*
   * 装配里不传它的地方（CLI、测试替身）一个字都不受影响。
   */
  kernels?: 对话内核
  /**
   * 记录每次工具调用改了哪些文件（不变式 5）。
   *
   * **默认开**：它是防幻觉的地基，关掉等于放弃「产出从 git 事实算」。
   * 只在明确不需要时置 false（例如纯对话的性能测试）。
   */
  provenance?: boolean
  /**
   * 视觉服务（2026-08-20）。**给了才有转述与 `look_at_image`。**
   *
   * 是个 getter 而不是一份值：设置里改了配置要立刻生效，
   * 而运行时在装配时就建好了。返回 undefined = 没勾或没配齐，
   * 两条缝都不接，一切如旧（与 `kernels` / `mcp` 同一副做法）。
   */
  vision?: () => import("./vision.js").视觉端点 | undefined
  /**
   * 子 agent 入口的可执行文件路径（`dist/electron/subagent-child.js`）。
   *
   * **给了才注册 `subagent` 工具。** 省略时模型看不到这个工具——
   * CLI 与单元测试走这一支。这不是开关，是**能力的前提**：
   * 没有那个文件就没有子进程可起，注册一个必然失败的工具比不注册更坏。
   */
  subagentChildEntry?: string
}

interface NativeSession {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"]
  /**
   * **上一条回复实际是谁答的**（`provider/model`，取自 pi 的回执）。
   * 与我们设的不一致时会出声——见 `translate` 里那段。
   */
  实际模型?: string
  /** pi 替我们记着的那份对话。**续接与「上次聊到哪儿」都从它来** */
  sessionManager: SessionManager
  /** 改「你现在跑在哪个模型上」那句话。**换模型时必须调**，否则它照旧答上一个 */
  设当前模型: (v: string) => void
  unsubscribe: () => void
  /** 关会话时收尾：中止团队调度器里还在跑的成员（2026-08-23 审查抓的：此前关会话后成员子进程照跑、向已删会话 emit） */
  收尾?: () => void
  pid: number
  /**
   * 最近一次 `prompt()` 的 promise（已挂 catch，永不 reject）。
   *
   * **`waitForIdle` 必须先等它。** pi 自己的 `session.waitForIdle()` 判的是
   * 「此刻有没有在跑」，而 `write()` 刻意不 await `prompt()`——于是在 prompt
   * 真正开始之前的那一小段时间里，pi 认为自己是空闲的，`waitForIdle()` 立刻返回。
   */
  pending: Promise<void> | undefined
  /**
   * 此刻有几轮在飞。
   *
   * **不能用 `pending` 判断「正在说话」**——它是一条只增不清的链
   * （连发两轮时等待必须覆盖两轮，所以它 resolve 之后仍然是个真值）。
   * 2026-08-09 换模型的守卫就栽在这里：第一句话之后 `pending` 永远为真，
   * 于是**任何时候都换不了模型**，而界面只表现为"点了没反应"。
   */
  inFlight: number
  /**
   * 最近一条助手消息报的 token 用量。**provider 给的真数。**
   *
   * 取自助手消息而不是工具结果——后者的 `usage` 是工具自身的，
   * pi 的文档明说它 *"Not used for main LLM context accounting"*。
   */
  lastUsage: { input?: number; output?: number; cacheRead?: number } | undefined
  /** 已经报过的那条用量在 `messages` 里的下标。**按下标判重，不按数值** */
  usageIndexReported: number | undefined
  /** 该会话的隔离目录。工具输出的全文写在它下面 */
  sessionDir: string
  /**
   * 卡死守卫。**每会话一个**——两个会话各自打转，互不相干。
   * pi 自己不管这件事，模型退化时会一路烧到迭代上限。
   */
  stuck: StuckGuard
}

/** pi 的会话事件（结构化程度足够，但类型不从包里导出，故在此收窄） */
interface PiEvent {
  type?: string
  toolCallId?: string
  toolName?: string
  args?: unknown
  input?: unknown
  result?: { isError?: boolean; content?: { type?: string; text?: string }[] }
  assistantMessageEvent?: { type?: string; delta?: string }
  /**
   * 完整的一条消息。**助手消息上带 `usage`，那是模型真实的 token 用量**。
   *
   * **不要用 `AgentToolResult.usage`**——pi 的文档明写着
   * *"Usage from the final tool execution itself… **Not used for main LLM
   * context accounting**."* 计划里原本指的就是那一个，是错的。
   */
  message?: {
    role?: string
    usage?: { input?: number; output?: number; cacheRead?: number }
    /**
     * **模型调用失败时是 `"error"`**（2026-08-10 真链路探出来的）。
     *
     * pi 的事件流里**没有 error 这一类**——一次 401 走完的是
     * `message_start / message_end / turn_end / agent_end`，
     * 全都是「正常」事件，错误只藏在这两个字段里。
     */
    stopReason?: string
    errorMessage?: string
    /**
     * **真正答这一条的是谁**（2026-08-12）。
     *
     * pi 的助手消息自带这两个字段。我们此前没读——于是「换没换过去」
     * 只能靠问模型，而**模型只会照着上下文念**（作者连问三次都答旧的）。
     * 读它，这件事就从「猜」变成「事实」。
     */
    provider?: string
    model?: string
  }
  errorMessage?: string
}

export class NativeRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, NativeSession>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /**
   * 正在启动的那一段(审查 debug E4)。`start()` 有一长串 await(解析模型、起 MCP、建 pi 会话),
   * 重复对同一 sessionId 调 start——双击、resubscribe 竞态——会各跑一遍,第二遍的 `sessions.set`
   * 覆盖第一遍,第一段 pi 会话 + 订阅 + MCP 池成孤儿(事件翻倍、账本重复计数)。记住"起中"promise:
   * 并发第二次调用等同一个,而不是再起一段。
   */
  private readonly 起中 = new Map<SessionId, Promise<SessionHandle>>()
  /**
   * 启动还没完成时就有人请求停(审查 debug E5)。此前 `stop()` 里 `sessions.get` 拿不到
   * 尚未登记的会话就直接返回,可等 `start()` 跑完把会话登记上去,那一段就永远没人停了——
   * pi 会话不 dispose、订阅常驻。记一笔,让 `start()` 收尾时把刚起来的立刻停掉。
   */
  private readonly 已请求停 = new Set<SessionId>()
  /**
   * native 会话不对应真实进程，pid 是合成的序号，只为满足 `SessionHandle` 契约
   * 与会话表的 `pid` 列。**它不可用于 `process.kill`**，与 PtyRuntime 的 pid 语义不同。
   */
  private nextPid = 1
  /**
   * **全进程共享一个 ModelRuntime。**
   *
   * Spike A-2 实测：单次会话里 pi 会调用 `credentials.read()` **202 次**——
   * 它遍历全部 39 个内置 provider 探测可用性，且不止一轮。
   * 每个会话各建一个 ModelRuntime 就会把这个代价乘以会话数。
   */
  private modelRuntime: Promise<ModelRuntime> | undefined

  constructor(private readonly opts: NativeRuntimeOptions = {}) {
    /**
     * **在构造体里赋值，不写成字段初值。** 字段初值与参数属性的赋值顺序
     * 取决于 `useDefineForClassFields`——写成 `= this.opts.modelsPath`
     * 有可能读到还没赋上的 `opts`。这种错只在某些编译设置下出现，
     * 是最难查的一类。
     */
    this.modelsPath = opts.modelsPath
  }

  /**
   * 丢掉缓存的 `ModelRuntime`，下次用时重新读 `models.json`（2026-08-10）。
   *
   * 用户在设置里改了某个 provider 的地址之后要用上新地址，
   * 而 `ModelRuntime` 在 create 那一刻就把目录读进去了。
   *
   * **已经在跑的会话不受影响**——它们手里是旧的那一份。
   * 这是诚实的：改地址不该把正在说话的会话半路改道。
   */
  resetModelCatalog(): void {
    this.modelRuntime = undefined
  }

  /**
   * 运行时**这份目录文件在哪**。**可以中途才有**（2026-08-11 修）。
   *
   * ## 这个方法是一个真实缺陷的形状
   *
   * 作者在设置里加了一个自定义端点 `kimi-k3`（moonshot 的地址 + 正确的 key），
   * 磁盘上三样全对——`providers.yaml`、`models.generated.json`、钥匙串——
   * **可对话里的模型选择器就是没有它。**
   *
   * 因为 `modelsPath` 此前是构造时钉死的：启动那一刻配置里还没有任何
   * `providers:` 覆盖，`writeModelsJson` 于是返回 undefined，
   * 运行时拿到的是 `modelsPath: null`。**后来生成的那份文件，pi 永远不会去读**，
   * 重置多少次目录都一样——它每次都从 `null` 重新读。
   * 症状因此是「配好了，重启才有」，而没有任何一句话提示要重启。
   *
   * **e2e 没抓住它，因为假服务器总会给一份基底 `models.json`**——
   * 于是那条路上 `modelsPath` 从来都不是空的。测试环境比生产环境「多一样东西」，
   * 那一样东西正好盖住了缺陷。
   */
  useModelsPath(path: string | undefined): void {
    this.modelsPath = path
    // 路径变了，缓存的目录就是按旧路径读出来的——必须一起丢
    this.resetModelCatalog()
  }

  /** 当前生效的目录文件路径。构造时取初值，之后由 `useModelsPath` 改 */
  private modelsPath: string | undefined

  private runtime(): Promise<ModelRuntime> {
    this.modelRuntime ??= ModelRuntime.create({
      ...(this.opts.credentials ? { credentials: this.opts.credentials } : {}),
      // 显式给 null 表示不落盘；给路径则由 pi 缓存远端模型目录
      modelsPath: this.modelsPath ?? null,
    })
    return this.modelRuntime
  }

  /**
   * 等当前回合跑完。
   *
   * CLI 的管道模式需要它：`echo ... | dawn run` 在 stdin EOF 时要收摊，
   * 但**不能在模型还没答完时就切断**。`write()` 刻意不 await（见其注释），
   * 所以「跑完了没有」必须另有一问。
   */
  async waitForIdle(sessionId: SessionId): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    // **顺序要紧。** 先等我们自己发出去的那一轮——见 `NativeSession.pending` 的注释：
    // prompt 还没开始时 pi 认为自己空闲，只问它会立刻拿到「已空闲」。
    // 2026-08-09 由 R5 的真链路测试抓到：`waitForIdle` 在 0 个请求、1 个事件时就返回了。
    await s.pending
    await s.session.waitForIdle()
  }

  /**
   * 上一次聊到哪儿了（会话续接，2026-08-11）。
   *
   * 作者：*「之前聊过的，也无法连续上。」*
   *
   * ## 为什么它从 pi 的记录来，而不是从我们的账本来
   *
   * 账本记的是**发生过什么**（哪一轮、花了多少、动了哪些文件），
   * 它**刻意不存每句话的原文**——那是对话，不是事实层。
   * 而 pi 为了自己能续接，本来就把消息完整存着。**各取所长，不互相冒充。**
   *
   * ## 三条取舍
   *
   * 1. **thinking 不还原**：它是模型的草稿，上一次也没显示给人看。
   * 2. **工具调用还原成「已完成」的样子**：结果就在记录里，
   *    而一条永远转圈的「执行中」会让人以为它还在跑。
   * 3. **系统注入的那些不还原**：它们不是人说的话，摆出来只会让对话变长。
   */
  async history(sessionId: SessionId): Promise<RestoredItem[]> {
    const s = this.sessions.get(sessionId)
    if (!s) return []
    const 消息 = s.sessionManager.buildSessionContext().messages as 历史消息[]
    const 出: RestoredItem[] = []
    const 待补结果 = new Map<string, RestoredItem & { kind: "tool" }>()

    for (const m of 消息) {
      if (m.role === "user") {
        const text = 取文本(m.content)
        if (text.trim()) 出.push({ kind: "text", who: "user", text })
        continue
      }
      if (m.role === "assistant") {
        const text = (m.content ?? [])
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("")
        if (text.trim()) 出.push({ kind: "text", who: "agent", text })
        for (const c of m.content ?? []) {
          if (c.type !== "toolCall") continue
          const 条: RestoredItem & { kind: "tool" } = {
            kind: "tool",
            id: c.id,
            name: c.name,
            input: c.arguments,
          }
          出.push(条)
          待补结果.set(c.id, 条)
        }
        continue
      }
      if (m.role === "toolResult") {
        const 条 = 待补结果.get(m.toolCallId)
        // **没见过对应调用的结果也照记**——宁可多一条，不可丢一条
        if (!条) {
          出.push({
            kind: "tool",
            id: m.toolCallId,
            name: m.toolName,
            input: undefined,
            result: 取文本(m.content),
          })
          continue
        }
        条.result = 取文本(m.content)
      }
    }
    return 出
  }

  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  /** 把 pi 的工具定义套上授权门。不给 gate 时返回 undefined，走 pi 的内置工具。 */
  /** 子 agent 的三层：项目 > 全局 > 自带 */
  private 子agent层(workspace: string): { dir: string; from: "builtin" | "global" | "project" }[] {
    const s = this.opts.subagents ?? {}
    return [
      { dir: join(workspace, AGENTS_DIR), from: "project" },
      ...(s.全局目录 ? [{ dir: s.全局目录, from: "global" as const }] : []),
      ...(s.自带目录 ? [{ dir: s.自带目录, from: "builtin" as const }] : []),
    ]
  }

  /**
   * 给插件工具（office/browser）的写入路径套一层门（审查 debug B1）。
   * 工具名 → 它的写路径参数名(按存在顺序取第一个非空)。加插件工具时补这张表。
   */
  private 插件门包装(spec: SessionSpec): (d: unknown) => unknown {
    const gate = this.opts.gate
    if (!gate) return (d) => d
    const 写路径参数: Record<string, string[]> = {
      xlsx_write: ["file_path"],
      xlsx_edit: ["output_path", "file_path"],
      xlsx_recalc: ["file_path"],
      pdf_create: ["destination_path"],
      pdf_merge: ["output_path"],
      pdf_split: ["output_dir"],
      pptx_create: ["destination_path"],
      pptx_edit: ["output_path"],
      docx_create: ["destination_path"],
      docx_edit: ["output_path"],
      browser_download: ["save_as"],
    }
    const 产物 = this.产物登记(spec.sessionId)
    const 语境 = {
      workspace: spec.workspace,
      sessionId: spec.sessionId,
      ...(spec.remote ? { remote: true as const } : {}),
      本会话创建: (p: string) => 产物.是本会话创建(p),
    }
    const 问 = (title: string, reason: string, signal: AbortSignal | undefined) =>
      this.问权限(spec.sessionId, title, reason, signal)
    return (d) => {
      const def = d as Record<string, unknown>
      const 写参 = 写路径参数[String(def.name)]
      if (!写参) return d
      const original = (def.execute as (...a: unknown[]) => Promise<unknown>).bind(def)
      return {
        ...def,
        async execute(toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: unknown, ctx: unknown) {
          const p = 写参.map((k) => params[k]).find((v) => typeof v === "string" && v) as string | undefined
          if (p) {
            const 决定 = gate("write", { path: p }, 语境)
            if (决定.kind === "deny") {
              return { content: [{ type: "text", text: 决定.reason }], isError: true, details: undefined }
            }
            if (决定.kind === "ask") {
              const 答 = await 问(`写入 ${p}`, 决定.reason, signal)
              if (答 !== "allow") {
                return {
                  content: [{ type: "text", text: `${决定.reason}（${答 === "timeout" ? "等了 5 分钟没人回，按拒绝处理" : "人拒绝了这一次"}）` }],
                  isError: true,
                  details: undefined,
                }
              }
            }
          }
          // **插件生成的文件也登记成本会话产物**(审查 debug B2):不登记的话「清本会话产物」删不掉它们,
          // 而系统提示词说得清清楚楚「本会话文件可清」。写路径转绝对(相对的按工作区解析,与插件内部一致),
          // 执行前记下此前在不在,成功后只登记此前不存在的(覆盖已有文件不算新建)。
          const 写的 = 写参
            .map((k) => params[k])
            .filter((v): v is string => typeof v === "string" && !!v)
            .map((rel) => (isAbsolute(rel) ? rel : spec.workspace ? join(spec.workspace, rel) : rel))
          const 之前 = 写的.map((a) => [a, 产物登记.存在(a)] as const)
          const r = await original(toolCallId, params, signal, onUpdate, ctx)
          if (!(r as { isError?: boolean } | undefined)?.isError) for (const [a, 有] of 之前) 产物.登记新建(a, 有)
          return r
        },
      }
    }
  }

  private gatedTools(cwd: string, sessionId: SessionId, remote?: SessionSpec["remote"]): unknown[] | undefined {
    const gate = this.opts.gate
    const provenance = this.opts.provenance !== false
    // 两样都不要就别包——包装本身也有成本
    if (!gate && !provenance) return undefined
    const probe = provenance ? new ProvenanceProbe(cwd) : undefined
    const emit = (e: AgentEvent) => this.emit(e)
    /** 本会话产物（2026-08-23）：删自己建的不算删除。一个会话一份 */
    const 产物 = this.产物登记(sessionId)
    const 问 = (title: string, reason: string, signal: AbortSignal | undefined) => this.问权限(sessionId, title, reason, signal)
    const wrap = (definition: Record<string, unknown>) => {
      const original = (definition.execute as (...a: unknown[]) => Promise<unknown>).bind(definition)
      const name = String(definition.name)
      return {
        ...definition,
        async execute(
          toolCallId: string,
          params: Record<string, unknown>,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) {
          if (gate) {
            const 决定 = gate(name, params, { workspace: cwd, sessionId, ...(remote ? { remote: true } : {}), 本会话创建: (p) => 产物.是本会话创建(p) })
            if (决定.kind === "deny") {
              // **回一条 isError 结果，不要抛异常**——抛异常会中断整轮，
              // 模型学不到「这条被拒了」。Spike A-2 实测确认。
              return { content: [{ type: "text", text: 决定.reason }], isError: true, details: undefined }
            }
            if (决定.kind === "ask") {
              // **问一句**（2026-08-23）：弹 ACP 那张权限卡，等人点；拒绝 / 超时都把理由回给模型让它改道
              const 答 = await 问(摘要(name, params), 决定.reason, signal)
              if (答 !== "allow") {
                return {
                  content: [{ type: "text", text: 答 === "timeout" ? `${决定.reason}（等了 5 分钟没有人回答，按拒绝处理。换一条不需要这个动作的路，或让人来做。）` : `${决定.reason}（人拒绝了这一次。换一条不需要这个动作的路。）` }],
                  isError: true,
                  details: undefined,
                }
              }
            }
          }
          // 执行前记下「要建的文件此前在不在」，成功后只登记此前不存在的（覆盖已有文件不算新建）
          const 要建的 = 要建的文件(name, params, cwd)
          const 之前 = 要建的.map((p) => [p, 产物登记.存在(p)] as const)
          // **before 快照必须在真正执行之前完成**，所以要 await。
          // 这正是 Spike A-2 选「包装工具定义」而非 pi 文件扩展的原因之一：
          // 包装器天然是同步点，而普通事件订阅不阻塞
          const handle = await probe?.begin(name, params)
          try {
            const r = await original(toolCallId, params, signal, onUpdate, ctx)
            if (!(r as { isError?: boolean } | undefined)?.isError) {
              for (const [p, 有] of 之前) 产物.登记新建(p, 有)
              /**
               * 只读工具**按设计**不写文件——这是我们自己写的工具，白名单本身就是这条声明；
               * 发空数组是「确认没写」，不是猜（不变式 5）。（2026-08-26，审查 A）
               *
               * 不发的话这次调用的 Run 上 `files_created` 是 NULL，被读成「不知道」，
               * 一段只 read 的普通对话就被标成「本轮产出未知」——主路径上的一句假话。
               * 只在**成功**时发：被拒 / 失败的那次没执行，没什么可确认的。
               * `subagent` 不经这条包装（见 `toolsFor`），不会被误发空事实。
               */
              if (probe && !isProducing(name)) emit({ kind: "tool_files", sessionId, toolCallId, ...只读工具的空事实() })
            }
            return r
          } finally {
            if (handle) {
              const facts = await handle.finish()
              // **算不出来就不发。** 发一个空的 `filesWritten` 会让那条 Run
              // 说出「确认没改任何文件」，而实情是「不知道」——两者不得混为一谈
              // （`types.ts` 的 `tool_files` 注释：只在拿得到事实时发）
              if (facts) {
                // 产物登记按 inode 记下的「此前不在、现在有」并进来（spec 2026-08-26-产物 §2）：
                // git 看不见被忽略的文件，登记看不见没声明路径的（bash 里 `cp` 出来的，
                // 看得见的是 `>` 重定向的目标）
                //
                // **这里有一处刻意的不对称**：`产物.登记新建` 只在工具调用成功
                // （`!isError`）时才真的写进登记表——上面 `try` 块里那句
                // `if (!(r as … ).isError) for (…) 产物.登记新建(...)`；
                // 而这里的 `登记到的` 看的是「此前不在、现在有」这个当下的事实，
                // 不管工具最终是否报错。于是工具炸了、但炸之前已经把文件写到了盘上，
                // 这个文件会出现在 `filesCreated` 里（与本 `finally` 块的口径一致：
                // 「炸之前写下的东西照样是事实」），但**不会**被登记表收下——
                // 「清本会话产物」删不掉它。两者互不冒充对方：账本诚实地记下发生过什么，
                // 清理动作则更保守，只清它确认安全的那部分。
                const 登记到的 = 之前.filter(([p, 有]) => !有 && 产物登记.存在(p)).map(([p]) => p)
                emit({ kind: "tool_files", sessionId, toolCallId, ...并进登记新建(facts, 登记到的, cwd) })
              }
            }
          }
        },
      }
    }
    const 原始 = [
      createReadToolDefinition(cwd),
      /**
       * **不要把 `PI_*` 塞进命令的环境**（2026-08-12）。
       *
       * 作者连着换了三次模型，每次问「你是什么模型」都答 deepseek。
       * 根因不是没换过去（Kimi 自报过「我是 Kimi，由月之暗面开发」），
       * 而是**它第一轮跑过 `env`，那份输出留在对话里**——里面写着
       * `PI_MODEL=deepseek-v4-flash`。之后每次它都照着那份快照念，
       * 而**快照是不会自己更新的**。
       *
       * 劝它「那份已经过期」试过了，压不住一份长得像证据的输出。
       * **所以让这份证据不存在**：`exposeSessionEnvironment: false`。
       * 变量没有了，模型就只能按自己的身份回答——而那正是问题的正确答案。
       *
       * 代价：脚本拿不到 `PI_SESSION_ID` / `PI_SESSION_FILE`。
       * **我们没有任何地方用它们**（全仓搜过），而这几个名字本来也是 pi 的。
       */
      createBashToolDefinition(cwd, { exposeSessionEnvironment: false }),
      createEditToolDefinition(cwd),
      createWriteToolDefinition(cwd),
    ] as unknown as (Record<string, unknown> & {
      name: string
      execute: (...a: unknown[]) => Promise<unknown>
    })[]

    /**
     * **远端会话换掉执行那一句，其余一字不动**（②-B · R2）。
     *
     * 名字、说明、参数 schema 全是 pi 的——模型因此**不知道自己的手
     * 伸到了另一台机器上**，也就不需要为远端另学一套（学到的多半还是错的）。
     *
     * 授权门与溯源探针仍然套在最外面：**远端更需要那道门**，
     * 本地跑错一条命令代价是你自己的工作区，在共享集群上跑错是别人的。
     */
    /**
     * 远端会话用**它自己的当前目录**；本地会话给一个钉死在工作区的假壳，
     * 那时 `挑工具后端` 根本不会用到它（`remote` 为空就原样返回本地那份）。
     */
    const 定义 = 挑工具后端(
      原始,
      remote?.cwd ?? { get: () => cwd, set: () => {} },
      remote?.executor,
    )
    return 定义.map((d) => wrap(d))
  }

  /**
   * 内置工具 + `subagent`（①-B″ · S1）。
   *
   * **`subagent` 刻意不套授权门的包装器。** 那个包装器做两件事：过门、拍 git 快照。
   * 两件在这里都不对——
   *   - 门是**按工具名**判的，而子 agent 真正要管的是「它自己能用哪些工具」，
   *     那一层在子进程里（`tools` 白名单）。在父侧对 `subagent` 这个名字放行或拦下，
   *     管不到子进程里发生的事，**给的是一种虚假的安全感**。
   *   - 快照更明确地错：`subagent` 期间会有多个子进程并发改文件，
   *     父侧拍一个 before/after 只能得到「这一批一共改了什么」，
   *     而账本要的是**逐个子 agent**的事实。那属于阶段 ④ 的 worktree 隔离。
   *
   * 所以子 agent 的溯源**现在是缺的，而且是知情地缺的**——账本上有它的 Run，
   * 但那条 Run 没有 `files_written`。按不变式 5 的规矩，
   * **缺省读作「不知道」，这正是此刻的实情。**
   */
  /** 一个会话一份产物登记（2026-08-23）。会话停了就丢 */
  private readonly 产物们 = new Map<SessionId, 产物登记>()
  private 产物登记(sessionId: SessionId): 产物登记 {
    let r = this.产物们.get(sessionId)
    if (!r) {
      r = new 产物登记()
      this.产物们.set(sessionId, r)
    }
    return r
  }

  /** 正在等人回答的询问：requestId → 回答它 */
  private readonly 待答 = new Map<string, { sessionId: SessionId; 答: (答: "allow" | "deny") => void }>()
  /** 每段会话的团队调度器怎么收（`toolsFor` 里登记，`stop` 时调）：关会话不能让成员子进程继续跑 */
  private readonly 团队收尾 = new Map<SessionId, () => void>()

  /**
   * **问一句**（2026-08-23，学自 dsh-auto-mode 的 ask）：发一条 `permission_request`（与 ACP 的权限卡同一形状），
   * 等界面回 `answerPermission`。最多等 5 分钟；会话中止也算拒。
   * 回答之后发 `permission_settled` 让卡消失——不发的话按钮还能按，按了什么都不会发生。
   */
  private 问权限(sessionId: SessionId, title: string, reason: string, signal: AbortSignal | undefined): Promise<"allow" | "deny" | "timeout"> {
    const requestId = `ask-${randomUUID()}`
    return new Promise((resolve) => {
      const 收 = (答: "allow" | "deny" | "timeout") => {
        this.待答.delete(requestId)
        clearTimeout(timer)
        signal?.removeEventListener("abort", onAbort)
        this.emit({ kind: "permission_settled", sessionId, requestId })
        resolve(答)
      }
      const timer = setTimeout(() => 收("timeout"), 5 * 60_000)
      const onAbort = () => 收("deny")
      signal?.addEventListener("abort", onAbort, { once: true })
      this.待答.set(requestId, { sessionId, 答: 收 })
      this.emit({
        kind: "permission_request",
        sessionId,
        requestId,
        title: `${title}\n${reason}`,
        options: [
          { optionId: "allow_once", name: "允许这一次", kind: "allow_once" },
          { optionId: "reject", name: "拒绝", kind: "reject_once" },
        ],
      })
    })
  }

  answerPermission(sessionId: SessionId, requestId: string, optionId?: string): void {
    const 等 = this.待答.get(requestId)
    // **只认那段会话自己的答**（2026-08-23 审查抓的：此前忽略 sessionId，任何会话都能替别人按「允许」）
    if (!等 || 等.sessionId !== sessionId) return
    等.答(optionId === "allow_once" ? "allow" : "deny")
  }

  /** 目录里每个 provider 的 api key（读得到的那些），递给子进程。OAuth 类的凭证不递——子进程没法刷新 */
  private async 子进程凭证(): Promise<Record<string, string> | undefined> {
    const store = this.opts.credentials
    if (!store) return undefined
    const out: Record<string, string> = {}
    const providers = [...new Set((await this.runtime()).getModels().map((m) => m.provider))]
    for (const p of providers) {
      try {
        const c = await store.read(p)
        if (c && c.type === "api_key" && c.key) out[p] = c.key
      } catch {
        // 读不到就不递；子进程会照 pi 的缺省路径再找一次
      }
    }
    return Object.keys(out).length ? out : undefined
  }

  private toolsFor(
    spec: SessionSpec,
    native: { provider: string; model: string },
    /**
     * MCP 那些工具（2026-08-15）。**从外面传进来而不是在这里取**：
     * 起一台 MCP 服务器要跑进程、说一轮协议，是异步的，
     * 而这个方法是同步的。备好的活儿在 `start()` 里干。
     */
    mcp工具: unknown[] = [],
    /**
     * 这个模型的目录里声明了收图（2026-08-20）。**从外面传进来**：
     * 判断要看 `model.input`，而解析模型是 async 的，`start()` 里已经做了。
     * 收图的模型不给 `look_at_image`——它自己能看，多一个工具只会让它绕路。
     */
    模型收图 = true,
    /** 递给子进程的 api key（provider → key）；见 `子进程凭证` */
    子进程凭证?: Record<string, string>,
  ): unknown[] | undefined {
    const base = this.gatedTools(spec.workspace, spec.sessionId, spec.remote)


    /**
     * `run_code`：让 agent 在这段对话自己的内核里跑代码（②，2026-08-14）。
     *
     * **与 `subagent` 无关，所以不能挂在它的分支里**——`toolsFor` 在没有
     * `subagentChildEntry` 时会提前返回，挂过去的话那种装配里它整个消失。
     * 这个坑本项目踩过一次（退役掉的那个数据工具就在这儿丢过）。
     *
     * **不给 `kernels` 就完全是原来的样子**：CLI 与测试替身一个字不受影响。
     */
    /**
     * **远端会话也挂**（远程内核，2026-09-03）：内核在那台服务器上起（远端 ipykernel + 五条 SSH 隧道），
     * 文件与代码在同一台机器——2026-08-27 那条「只会在本机起」的禁令随之作废。
     *
     * **远端会话只在挂载层真接了远端时才挂**：没接（`能起远端()` 为 false）等于内核只会在本机起，
     * 那正是 08-27 禁掉的那种静默错位——这时不给工具，模型看不到就不会去猜。
     */
    const 内核工具 =
      this.opts.kernels && (!spec.remote || this.opts.kernels.能起远端())
        ? [createRunCodeTool({ 对话: spec.sessionId, 内核: this.opts.kernels })]
        : []

    /**
     * `look_at_image`：视觉服务的缝二（2026-08-20）。
     * **两个条件都要**：装配给了 `vision`，且这个模型的目录里没声明收图。
     * 注册决定在建会话这一刻拿的模型——中途 `setModel` 不重算工具表
     * （pi 的 `customTools` 是建会话时装上去的），这一条如实写在设计文档里。
     */
    const 视觉工具 =
      this.opts.vision && !模型收图
        ? [
            createLookAtImageTool({
              端点: this.opts.vision,
              workspace: spec.workspace,
              remote: spec.remote,
            }),
          ]
        : []

    /**
     * **MCP 工具与 `run_code` 一样，两条 return 都要带上**——
     * 没有 `subagentChildEntry` 时这里提前返回，只挂到下面那条的话，
     * 在那种装配里它们整个消失。这个坑本仓库踩过一次（退役的那个数据工具）。
     *
     * **2026-08-15 变异测试顺带查明了一件事**：桌面版的真实装配是**给**
     * `subagentChildEntry` 的，所以**跑起来走的是下面那条**，
     * 这一条只有 CLI 与测试替身会走到。改这里的时候要知道自己在改哪一条——
     * 我第一次做变异测试就摘错了分支，结果「判据没红」，
     * 差点得出「这条 e2e 是空转」的错误结论。
     */
    /**
     * **外部工具也要进账本**（2026-08-18，作者选的丙）。
     *
     * 在这之前，这个方法的最后一句是
     * `[...(base ?? []), ...内核工具, ...mcp工具]`——`base` 在
     * `gatedTools` 里套过溯源探针，**后面两个直接拼上去**。
     * 于是模型让内核画了一张图、让 MCP 服务器写了一份表，
     * 账本上有那条 `tool_call:<工具名>` 的 Run，**却答不出它写了什么**。
     * 而「哪一次调用产出了这个文件」正是不变式 5 存在的理由。
     *
     * **只套溯源，不套授权门**：MCP 工具有自己的门
     * （`mcp-tool.ts` 的 `trusted` 判定——策略只有一个家），
     * 再套一次内置那道门就是拿错了尺子量。
     */
    /**
     * Office 文档工具（2026-08-25 插件承载体 v1，学自 dsh-office）：按设置里的族开关装。
     * 与内核/视觉/MCP 同一组「外部」——同样要过 tool_files 观察与两条 return。
     */
    // 插件工具的写入路径也过门（审查 debug B1）:office/browser 不是 pi 内置的
    // read/edit/write/bash,gate 的判据认不出它们,于是设置卡上「工作区外/原始数据/
    // 系统目录 会拦」的承诺对这 32 个工具本来全部落空。这里按工具名提取它的写路径,
    // 过同一道 write 判据补上——不存在的能力不该看起来存在。
    const 门于插件 = this.插件门包装(spec)
    const office工具组 = (this.opts.officeEnable ? officeTools(spec.workspace, this.opts.officeEnable()) : []).map(门于插件)
    const browser工具组 = (this.opts.browserEnable ? browserTools(spec.workspace, this.opts.browserEnable(), spec.sessionId) : []).map(门于插件)
    const memory工具组 =
      this.opts.memoryEnable && this.opts.memoryDeps
        ? memoryTools(spec.workspace, this.opts.memoryEnable(), this.opts.memoryDeps())
        : []
    const 外部 = [...内核工具, ...视觉工具, ...office工具组, ...browser工具组, ...memory工具组, ...mcp工具]
    const 观察过的外部 =
      this.opts.provenance === false
        ? 外部
        : 外部.map((d) =>
            套上溯源(d as Record<string, unknown>, new ProvenanceProbe(spec.workspace), (toolCallId, facts) =>
              this.emit({ kind: "tool_files", sessionId: spec.sessionId, toolCallId, ...facts }),
            ),
          )

    const entry = this.opts.subagentChildEntry
    if (!entry) return [...(base ?? []), ...观察过的外部]

    const tool = createSubagentTool({
      sessionId: spec.sessionId,
      projectRoot: spec.workspace,
      dirs: this.子agent层(spec.workspace),
      自带停用: this.opts.subagents?.自带停用,
      emit: (e) => this.emit(e),
      childOf: () => ({
        // Spike F：**不能写死 `"node"`**——打包之后用户机器上不一定有它
        command: process.execPath,
        args: [entry],
        env: { [RUN_AS_NODE]: "1" },
      }),
      context: {
        provider: native.provider,
        model: native.model,
        cwd: spec.workspace,
        // **当前生效的那一份**，不是构造时的——见 `useModelsPath`
        ...(this.modelsPath ? { modelsPath: this.modelsPath } : {}),
        // 每个子任务一个 agentDir，**关在这个会话的目录里**（不变式 #11）
        agentDirOf: (i) => join(spec.sessionDir, "subagents", String(i)),
        ...(子进程凭证 ? { credentials: 子进程凭证 } : {}),
      },
    })

    // 门只包内置工具时 base 可能是 undefined；那时也要把 subagent 带上
    /**
     * **两条 return 都要带上观察过的那一份。**
     *
     * 这个方法自己的注释里写着：*「桌面版的真实装配是给
     * `subagentChildEntry` 的，所以跑起来走的是下面那条」*——
     * 只改上面那条的话，**单测全绿而应用里一个字都没记**。
     * 同一个坑本仓库踩过一次（退役的那个数据工具）。
     */
    /**
     * 团队（team-board，2026-08-22，学自 dsh-agent-teams）：队长的 7 个工具，坐在 `subagent` 旁边。
     * 一个会话一份调度器（冷却、跑着的成员在它身上），成员各自一个子进程、各自可续的会话目录；
     * 每一轮都发 `subagent_start/end`——账本照样一条 Run，对话流照样一组 chip（toolCallId = `team:<id>`）。
     */
    const 定义 = () => {
      return loadSubagentsFrom(this.子agent层(spec.workspace), { 自带停用: this.opts.subagents?.自带停用 }).agents.filter((a) => !a.disabled)
    }
    let 团队轮序 = 0
    const 调度器 = new 团队调度器({
      sessionDir: spec.sessionDir,
      定义,
      跑: {
        childOf: () => ({ command: process.execPath, args: [entry], env: { [RUN_AS_NODE]: "1" } }),
        context: {
          provider: native.provider,
          model: native.model,
          cwd: spec.workspace,
          ...(this.modelsPath ? { modelsPath: this.modelsPath } : {}),
          ...(子进程凭证 ? { credentials: 子进程凭证 } : {}),
        },
      },
      onChange: (team) => this.emit({ kind: "team_changed", sessionId: spec.sessionId, team: team as never }),
      onTurn: (e) => {
        const toolCallId = `team:${e.team.id}`
        if (e.phase === "start") {
          this.emit({ kind: "subagent_start", sessionId: spec.sessionId, toolCallId, index: 团队轮序++, agent: `${e.member}${e.taskId ? ` · ${e.taskId}` : ""}`, task: e.taskId ?? "消息" })
        } else {
          this.emit({ kind: "subagent_end", sessionId: spec.sessionId, toolCallId, index: 团队轮序 - 1, ok: e.ok ?? false, ...(e.error ? { error: e.error } : {}) })
        }
      },
    })
    const 当前团队 = { id: 读当前团队(spec.sessionDir) }
    const 团队工具 = createTeamTools({
      sessionId: spec.sessionId,
      调度器,
      定义,
      当前: { get: () => 当前团队.id, set: (id) => { 当前团队.id = id; 记当前团队(spec.sessionDir, id) } },
      已知模型: async () => (await this.runtime()).getModels().map((m) => ({ provider: m.provider, model: m.id })),
    })
    this.团队收尾.set(spec.sessionId, () => {
      if (当前团队.id) 调度器.中止全部(当前团队.id)
    })
    // 会话重开时把团队快照推一遍：界面那一格才知道它还在
    if (当前团队.id) {
      try {
        const t = 调度器.读(当前团队.id)
        queueMicrotask(() => this.emit({ kind: "team_changed", sessionId: spec.sessionId, team: t as never }))
      } catch {
        当前团队.id = undefined
      }
    }

    return [...(base ?? []), ...观察过的外部, tool, ...团队工具]
  }

  /**
   * 起一段会话。**重入保护 + 启动期停止收尾**(审查 debug E4/E5)——真正的启动逻辑在 `启动一次`。
   */
  async start(spec: SessionSpec): Promise<SessionHandle> {
    const id = spec.sessionId
    // 已经有活着的同 id 会话:重复开是调用方的 bug,响亮拒,别静默丢掉旧的(E4)
    if (this.sessions.has(id)) {
      throw new UserFacingError(`会话 "${id}" 已经在运行了，不能重复开(先停掉它再开)`)
    }
    // 已经有人在起同一段:并发第二次调用等同一个 promise,不再起第二段(E4)
    const 在起 = this.起中.get(id)
    if (在起) return 在起
    const p = this.启动一次(spec)
    this.起中.set(id, p)
    try {
      const handle = await p
      // 启动过程中有人请求停 → 立刻把刚起来的这段停掉,别让它漏成孤儿(E5)
      if (this.已请求停.delete(id)) {
        await this.stop(id).catch(() => {})
        throw new UserFacingError(`会话 "${id}" 在启动过程中被停止了`)
      }
      return handle
    } finally {
      this.起中.delete(id)
    }
  }

  private async 启动一次(spec: SessionSpec): Promise<SessionHandle> {
    const native = spec.native
    if (!native) {
      throw new Error(`native 运行时需要 provider 与 model，会话 "${spec.sessionId}" 未提供`)
    }

    const model = await this.resolveModel(native.provider, native.model)

    // per-session agentDir：会话的设置、记录、扩展全部隔离在自己的目录里，
    /**
     * **绝不落到用户的 ~/.pi**（不变式 #11，Spike B 的教训）。
     *
     * **每会话一个 agentDir，这一点后来又多了一条理由**（Spike E，2026-08-09）：
     * pi 的 `session.setModel()` 会把选择写成 agentDir 级的默认值
     * （`agentDir/settings.json` 里的 `defaultProvider` / `defaultModel`）。
     * 两个会话共用一个 agentDir 的话，**在 A 里换模型就会改掉 B 的默认值**——
     * 正是「一个会话的东西渗进另一个」。
     *
     * 现在它被关在会话里。**要把 agentDir 提到项目级或全局之前，先想清楚这一条。**
     */
    const agentDir = join(spec.sessionDir, "pi")
    mkdirSync(agentDir, { recursive: true })

    const modelRuntime = await this.runtime()

    /**
     * **MCP 工具在这里备好**（2026-08-15）。
     *
     * 必须在建会话之前：pi 的 `customTools` 是建会话时装上去的，
     * 而列出一台服务器有哪些工具要真的把它起起来、说一轮协议——那是异步的。
     *
     * **一台起不来不该让整段会话开不了**（`备好` 从不抛异常），
     * 但**必须出声**（规格 7.5）：起不来的那几台各自留一条 notice。
     * 悄悄少几个工具的表现是「模型怎么不会查库了」，
     * 而人会去怀疑模型、怀疑提示词，唯独不会想到是一台服务器没起来。
     */
    let mcp工具: unknown[] = []
    if (this.opts.mcp) {
      const { 取工具, 池, 门 } = this.opts.mcp
      try {
        const r = await 取工具(spec.workspace)
        mcp工具 = createMcpTools({
          池,
          名单: r.名单,
          工具: r.工具,
          ...(spec.workspace ? { 工作区: spec.workspace } : {}),
          // 把这段会话的 id 绑进门(审查 debug A8):好让会话级/定时级权限档也对 MCP 工具生效
          ...(门 ? { 门: (名: string, 指纹: string) => 门(名, 指纹, spec.sessionId) } : {}),
          问: (title, reason) => this.问权限(spec.sessionId, title, reason, undefined),
        })
        for (const 问题 of r.问题) {
          this.emit({ kind: "notice", sessionId: spec.sessionId, text: `MCP：${问题}` })
        }
      } catch (e) {
        // 整个装配塌了也要出声——**静默的结果是「工具凭空少了」**
        this.emit({
          kind: "notice",
          sessionId: spec.sessionId,
          text: `MCP：这一段没能装上任何外部工具（${e instanceof Error ? e.message : String(e)}）`,
        })
      }
    }

    /**
     * **子进程要带上 key**（2026-08-22 作者实测抓的：团队成员报「No API key found for deepseek」）。
     * 父会话的凭证在钥匙串里，子进程是新进程，pi 只会去找 `~/.pi/auth.json` 与环境变量——
     * 这条通道（`spec.credentials`）一直在，只是从来没人填。`subagent` 工具同样受益。
     * e2e 的假模型不要 key，所以它没抓到。
     */
    const 子进程凭证 = await this.子进程凭证()
    const customTools = this.toolsFor(
      spec,
      native,
      mcp工具,
      // **缺失不等于不收**：目录没写 `input` 时当它收图，宁可少给一个工具
      // 也不给收图的模型塞一个绕路的（`writeWithImages` 的「明确不收」同一口径）
      !(Array.isArray(model.input) && !model.input.includes("image")),
      子进程凭证,
    )

    /**
     * **这段对话的记录住在它自己的目录里**（会话续接，2026-08-11）。
     *
     * 不用 pi 的默认位置（那是按 cwd 编码出来的、多个会话共用一个目录），
     * 而是每个会话一个——于是「接着上一次聊」就是
     * **「把这个目录里最近那段读回来」**，不必在一堆会话里猜是哪一段。
     *
     * `continueRecent` 在目录为空时会新建一段，所以它对
     * 「记录丢了」这种情况是安全的：**退化成一段新对话，而不是报错**。
     * 代价是那时上下文真的没了——这一点由界面说清楚，不在这里假装。
     */
    const 记录目录 = join(agentDir, "sessions")
    const sessionManager = spec.resume
      ? SessionManager.continueRecent(spec.workspace, 记录目录)
      : SessionManager.create(spec.workspace, 记录目录)

    /**
     * **直接告诉它它现在跑在哪个模型上，并且这句话跟着换模型更新**（2026-08-12）。
     *
     * 前两次我做的都是绕：先劝它「旧快照过期了」（压不住一份长得像证据的
     * 命令输出），再把 `PI_*` 环境变量关掉——**它于是失去唯一的事实依据，
     * 开始编**：作者收到「我是 pi，基于 Anthropic 的 Claude 模型」，
     * 一个字都不真。**拿掉一份事实，就必须补上一份。**
     *
     * 这句补的是真的，而且是活的：闭包读 `当前模型`，`setModel` 每次都会改它，
     * 于是每一轮重建提示词时它都是当下的答案。
     *
     * 用 `appendSystemPromptOverride`（**只补一句**）而不是覆盖整份——
     * pi 那些踩出来的操作指导原样留着，扔掉它们 agent 会当场变笨。
     */
    let 当前模型 = `${native.model}（provider：${native.provider}）`
    /**
     * 记忆快照(2026-08-25):渲染失败不许拦会话——记忆是增益不是准入条件,
     * 坏一个记忆文件不该让人开不了对话;失败出声(notice),不静默。
     */
    let 记忆快照 = ""
    try {
      记忆快照 = this.opts.memorySnapshot?.(spec.workspace) ?? ""
    } catch (e) {
      this.emit({
        kind: "notice",
        sessionId: spec.sessionId,
        text: `记忆快照没渲染出来(本段会话不带记忆):${e instanceof Error ? e.message : String(e)}`,
      })
    }
    const settingsManager = SettingsManager.create(spec.workspace, agentDir)
    const resourceLoader = new DefaultResourceLoader({
      cwd: spec.workspace,
      agentDir,
      settingsManager,
      /**
       * **「关」了的技能从清单里剔掉**（skills-manage，2026-08-21）。
       * pi 认 `disable-model-invocation`（模型看不见、`/skill:` 还能调），但不认 `user-invocable: false`；
       * 三档里的「关」= 谁都不给，只能在这儿过滤——读的是文件上那两行，与技能屏同一份真相。
       */
      skillsOverride: (base) => {
        // 自带的档位记在设置里（文件只读）——先问它，没记过再看文件
        const 自带根 = this.opts.skills?.自带目录
        const 档 = (sk: { name: string; filePath: string }): "model" | "manual" | "off" => {
          const 记的 = 自带根 && sk.filePath.startsWith(自带根) ? this.opts.skills?.自带档?.(sk.name) : undefined
          if (记的) return 记的
          try {
            return 读调用策略(readFileSync(sk.filePath, "utf8"))
          } catch {
            return "model"
          }
        }
        const 留下 = base.skills
          .map((sk) => {
            const m = 档(sk)
            return m === "off" ? undefined : m === "manual" ? { ...sk, disableModelInvocation: true } : sk
          })
          .filter((sk): sk is NonNullable<typeof sk> => sk !== undefined)
        /**
         * **子 agent 的人设同时也是技能**（2026-08-22，作者定的「一份两用」）：`/skill:名` 把那套规矩叫进主对话，
         * `subagent` 工具把它派出去。同一份文件——pi 读技能时剥掉 frontmatter，正文正好就是人设。
         * 技能名撞了的让技能赢（那是人专门写的）。停用的不登记。
         */
        const 已有 = new Set(留下.map((sk) => sk.name))
        const 来自子agent = loadSubagentsFrom(this.子agent层(spec.workspace), { 自带停用: this.opts.subagents?.自带停用 }).agents
          .filter((a) => !a.disabled && !已有.has(a.name))
          .map((a) => ({
            name: a.name,
            description: a.description,
            filePath: a.filePath,
            baseDir: dirname(a.filePath),
            sourceInfo: createSyntheticSourceInfo(a.filePath, { source: "dawn-subagent", scope: a.from === "project" ? "project" : "user", origin: "top-level", baseDir: dirname(a.filePath) }),
            disableModelInvocation: false,
          }))
        return { ...base, skills: [...留下, ...来自子agent] }
      },
      appendSystemPromptOverride: (base) => [
        ...base,
        // 记忆快照（2026-08-25）：建会话时渲染一次——确认的记忆下一段会话生效
        ...(记忆快照 ? [记忆快照] : []),
        // 队长协议（team-board）：模型不知道该怎么分工，就不会分工
        ...(this.opts.subagentChildEntry ? [队长协议] : []),
        // 删除指引（2026-08-23，学自 dsh-auto-mode）：帮规划的，不是安全边界——边界在门上
        删除指引,
        // 内核指引（2026-08-27）：有 run_code 才说；不给 kernels 的装配（CLI、测试替身）一个字不受影响
        ...(this.opts.kernels ? [内核指引] : []),
        // 技能沉淀指引（2026-08-27，作者点的）：装了 skill_propose 才说——收尾问一句要不要沉淀成技能
        ...(this.opts.memoryEnable?.().skill && !this.opts.memoryEnable().off ? [技能沉淀指引] : []),
        `You are currently running on the model "${当前模型}". ` +
          `If the user asks which model you are, answer with exactly this. ` +
          `Do not guess from environment variables or from earlier turns — ` +
          `the model can be switched mid-conversation and this line is always current.`,
      ],
    })
    await resourceLoader.reload()

    /**
     * **技能的两个位置，显式指给 pi**（S20，2026-08-15）。
     *
     * pi 自己认 `<agentDir>/skills` 与 `<cwd>/.pi/skills`，而这两条在我们这儿
     * 都不好使：
     *
     * - `agentDir` 是**每会话一个**（见上面那段注释：换模型会写进去，
     *   共用会让一个会话的默认值渗进另一个）。所以「全局技能」放那儿
     *   等于每段会话各要放一份——**等于不存在**。
     * - 项目级那条指向 `.pi/`，而我们自己的约定是 `.dawn/`
     *   （`.dawn/agents/`、`.dawn/mcp.yaml` 都在那儿）。
     *
     * 所以两处都由装配显式给（`skills` 选项）。**不给就完全是原来的样子**——
     * CLI 与测试替身一个字节不受影响。
     *
     * ## 必须在 `reload()` **之后**扩展
     *
     * 第一版写在前面，结果**一个自带技能都没进来，反倒进来 14 个不相干的**
     * （开发机上 `~/.claude` 里那套）。实测三种顺序：
     *
     * | 顺序 | 结果 |
     * |---|---|
     * | 先扩展 → `reload()` | ✗ 扩展被洗掉 |
     * | `reload()` → 扩展 | ✓ |
     * | 扩展 → `reload()` → 扩展 | ✓ |
     *
     * `reload()` 会按设置重算一遍资源路径，把之前扩展进去的丢掉。
     * **这条只有真跑一次才看得见**——类型对、编译过、单元测试全绿。
     */
    if (this.opts.skills) {
      const { 全局目录, 项目目录名, 自带目录 } = this.opts.skills
      /**
       * **顺序即优先级：越具体的越靠前。**
       *
       * pi 按名字去重，**先到先得**（2026-08-15 实测：把同名的两份分别放前放后，
       * 赢的都是靠前那个）。所以顺序不是随手排的：
       *
       *   ① 项目级 —— 这个课题特有的做法，最具体
       *   ② 全局   —— 你自己攒的那些
       *   ③ 自带   —— 我们发的，**排最后**：同名时你写的那份赢，
       *              否则「我改了却不生效」会变成一个查不出来的谜
       */
      const 加 = [
        ...(spec.workspace && 项目目录名
          ? [{ path: join(spec.workspace, 项目目录名), meta: "project" as const }]
          : []),
        ...(全局目录 ? [{ path: 全局目录, meta: "user" as const }] : []),
        ...(自带目录 ? [{ path: 自带目录, meta: "user" as const }] : []),
      ]
      if (加.length > 0) {
        resourceLoader.extendResources({
          skillPaths: 加.map((x) => ({
            path: x.path,
            metadata: { source: "dawn", scope: x.meta, origin: "top-level" as const },
          })),
        })
      }
    }


    /**
     * **读不进来的技能要出声**（规格 7.5）。
     *
     * pi 的诊断里装着「frontmatter 少了 description」「名字含非法字符」这类。
     * 静静跳过的话，人写完一个技能发现它没生效，**而屏幕上什么都没有**——
     * 与「我写的技能怎么没用」是同一种困惑（`.dawn/agents/` 那一屏为此
     * 专门端出过 `problems`）。
     */
    for (const d of resourceLoader.getSkills().diagnostics) {
      this.emit({
        kind: "notice",
        sessionId: spec.sessionId,
        text: `技能：${d.message}${d.path ? `（${d.path}）` : ""}`,
      })
    }

    const { session } = await createAgentSession({
      cwd: spec.workspace,
      agentDir,
      model,
      modelRuntime,
      sessionManager,
      settingsManager,
      resourceLoader,
      // 有门时必须关掉内置工具，**否则模型会绕过门去用原始的 bash**（Spike A-2 实测）
      ...(customTools ? { noTools: "builtin" as const, customTools: customTools as never } : {}),
    })

    const unsubscribe = session.subscribe((raw) => this.translate(spec.sessionId, raw as PiEvent))

    const pid = this.nextPid++
    this.sessions.set(spec.sessionId, {
      session,
      sessionManager,
      // 换模型时改它，系统提示词里那句「你现在是谁」就跟着变（见上面那段）
      设当前模型: (v: string) => {
        当前模型 = v
      },
      /**
       * **起会话时就记下当前是谁**（2026-08-12 修）。
       *
       * 不记的话，第一条回复的回执必然与「不知道」对不上，
       * 于是**每个会话的第一句都会平白多一条「已换到 …」**——
       * 那条通知的意思是「有变化」，而这里根本没有变化。
       * `model-error` 那条 e2e 当场抓到：`.caveat` 从一条变成两条。
       */
      实际模型: `${native.provider}/${native.model}`,
      unsubscribe,
      收尾: () => {
        this.团队收尾.get(spec.sessionId)?.()
        this.团队收尾.delete(spec.sessionId)
      },
      pid,
      pending: undefined,
      inFlight: 0,
      lastUsage: undefined,
      usageIndexReported: undefined,
      sessionDir: spec.sessionDir,
      stuck: new StuckGuard(),
    })
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    this.发会话开关(spec.sessionId)
    return { sessionId: spec.sessionId, pid }
  }

  /**
   * **原生会话也有「会话设置」菜单**（codex-polish 第二档，2026-08-22）。
   * 走 ACP 那套 `config_options`——界面早就会画，不用另起一个组件：
   * - `dawn.permission`（category `mode`）：跟随设置 / 全放行 / 拦下危险操作；
   * - `dawn.thinking`（category `thought_level`）：**只在模型支持推理强度时才有这一条**。
   *   pi 的 `setThinkingLevel` 对不支持的模型会被静默忽略，摆一个没作用的开关就是在骗人。
   */
  private 发会话开关(sessionId: SessionId): void {
    const 开关 = this.configOptions(sessionId)
    if (开关 && 开关.length > 0) this.emit({ kind: "config_options", sessionId, options: 开关 })
  }

  configOptions(sessionId: SessionId): readonly 会话开关[] | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) return undefined
    const 开关: 会话开关[] = []
    const 档 = this.opts.permissionTier
    if (档) {
      const 全局 = 档.全局()
      const 名 = (x: "allow-all" | "ask-risky" | "deny-risky") => (x === "allow-all" ? "完全访问权限" : x === "ask-risky" ? "请求批准" : "自动拦截")
      开关.push({
        id: "dawn.permission",
        name: "权限",
        description: "只管这一段对话；设置里那个是全局默认",
        category: "mode",
        kind: "select",
        current: 档.取(sessionId) ?? "inherit",
        options: [
          { value: "inherit", name: `${名(全局)} · 跟随设置`, description: "设置里改了，这段跟着变" },
          { value: "deny-risky", name: "自动拦截", description: "改 data/raw/、写到工作区外、删除、装包、联网、git push 直接拒绝" },
          { value: "ask-risky", name: "请求批准", description: "危险操作弹一张卡让你点「允许这一次」；拒绝 / 5 分钟没答都按拒，理由回给模型" },
          { value: "allow-all", name: "完全访问权限", description: "只拦硬拒清单（sudo、删到主目录 / 系统目录、凭据外传、强推）" },
        ],
      })
    }
    if (s.session.supportsThinking()) {
      const 级: { value: ThinkingLevel; name: string }[] = [
        { value: "minimal", name: "最少" },
        { value: "low", name: "低" },
        { value: "medium", name: "中" },
        { value: "high", name: "高" },
        { value: "xhigh", name: "更高" },
        { value: "max", name: "最高" },
      ]
      开关.push({
        id: "dawn.thinking",
        name: "推理强度",
        description: "模型先想多久再答。越高越慢、越贵",
        category: "thought_level",
        kind: "select",
        current: s.session.thinkingLevel,
        options: 级,
      })
    }
    return 开关
  }

  async setConfigOption(sessionId: SessionId, configId: string, value: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    if (configId === "dawn.permission") {
      const 档 = this.opts.permissionTier
      if (!档) throw new Error("这一版没有接按会话的权限档")
      if (value !== "inherit" && value !== "allow-all" && value !== "ask-risky" && value !== "deny-risky") throw new Error(`不认识的权限档：${value}`)
      档.设(sessionId, value === "inherit" ? undefined : value)
    } else if (configId === "dawn.thinking") {
      const 级 = ["minimal", "low", "medium", "high", "xhigh", "max"]
      if (!级.includes(value)) throw new Error(`不认识的推理强度：${value}`)
      s.session.setThinkingLevel(value as ThinkingLevel)
    } else {
      throw new Error(`原生会话没有这个开关：${configId}`)
    }
    this.发会话开关(sessionId)
  }

  /**
   * 从 pi 的**会话状态**里取最近一条带用量的条目（2026-08-10）。
   *
   * ## 为什么不是从事件里拿
   *
   * 这段代码此前写的是「助手消息事件上带 `usage`」——**那个形状不存在**。
   * 于是 `lastUsage` 一直是空的，上下文面板一直显示「已用尚未采集」，
   * 而覆盖它的那条 e2e 断言的是 `toContainText("12")`，
   * **匹配到的其实是上下文窗口 `128,000` 里的 `12`**，绿了将近一天。
   *
   * 真正的来源是 `session.state.messages[*].usage`（真链路探出来的，形如
   * `{input, output, cacheRead, cacheWrite, reasoning, totalTokens, cost}`）。
   *
   * @returns 最后一条带用量的条目的下标与值。**一条都没有就 undefined**
   */
  private latestUsage(
    sessionId: SessionId,
  ): { index: number; usage: { input?: number; output?: number; cacheRead?: number } } | undefined {
    const s = this.sessions.get(sessionId)
    /**
     * **一路都要防空。** 这里在每条事件上都会被调到，而事件可能早于
     * `session` 就位——`s?.session.state` 在 `session` 还没有时会直接抛，
     * 而这一抛会**打断整条事件流**，症状是回复再也不出现。
     * （2026-08-10 就是这么把「切会话不丢历史」弄红的。）
     */
    const state = s?.session?.state as { messages?: unknown[] } | undefined
    const msgs = (state?.messages ?? []) as Record<string, unknown>[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const u = msgs[i]?.["usage"] as
        | { input?: number; output?: number; cacheRead?: number }
        | undefined
      if (!u || typeof u !== "object") continue
      /**
       * **跳过全零的那些。** pi 的条目里有一部分是记账用的空壳
       * （`{input:0,output:0,…}`），取到它就会把「这一轮花了多少」
       * 报成 0——而 0 与「不知道」在界面上说的话完全不同，
       * 更何况这里真实答案并不是 0。
       */
      if ((u.input ?? 0) + (u.output ?? 0) === 0) continue
      return { index: i, usage: u }
    }
    return undefined
  }

  /**
   * 这一段用了多少 token，发一条事件。
   *
   * **按条目下标判重**：同一条用量不该在两次 `turn_end` 上各报一次
   * （pi 每次模型响应都发 `turn_end`，而没有新模型调用的那些不该重复计数）。
   * 数值判重不行——两次调用花一样多是完全可能的。
   */
  private emitUsageIfNew(sessionId: SessionId): void {
    const latest = this.latestUsage(sessionId)
    if (!latest) return
    const s = this.sessions.get(sessionId)
    if (!s || s.usageIndexReported === latest.index) return
    s.usageIndexReported = latest.index
    s.lastUsage = latest.usage
    /**
     * **只发我们声明过的那三个字段。**
     *
     * pi 给的对象还带着 `cacheWrite` / `reasoning` / `totalTokens` / `cost`，
     * 而协议里 `usage` 是 `.strict()` 的——原样转发会让中枢那边
     * `SessionUpdateSchema.parse` 抛出，**而那一抛会顺着 emit 窜回 pi 的
     * 事件循环，把后面的文本增量全掐掉**（2026-08-10 的回归就是这么来的：
     * 症状是「回复再也不出现」，看起来与用量毫无关系）。
     *
     * 挑字段而不是放宽 schema：**我们只声明我们真的理解的东西。**
     */
    const u = latest.usage
    this.emit({
      kind: "turn_usage",
      // **谁答的就记谁**：`实际模型` 是 pi 回执里那个，不是我们设的那个
      ...(s.实际模型 ? { model: s.实际模型 } : {}),
      sessionId,
      usage: {
        ...(u.input !== undefined ? { input: u.input } : {}),
        ...(u.output !== undefined ? { output: u.output } : {}),
        ...(u.cacheRead !== undefined ? { cacheRead: u.cacheRead } : {}),
      },
    })
  }

  /** pi 的会话事件 → 本项目的 AgentEvent。**只翻译，不解释。** */
  private translate(sessionId: SessionId, e: PiEvent): void {
    /**
     * **每条事件都试着冲一次用量。**
     *
     * 用量落进 `session.state.messages` 的时机与 `turn_end` 的先后不固定
     * （实测：`turn_end` 先到，用量条目后落）。只在 `turn_end` 冲就会永远差一步。
     * 判重靠条目下标，所以重复调用的代价近似为零。
     */
    this.emitUsageIfNew(sessionId)

    /**
     * **模型调用失败要出声**（规格 7.5，2026-08-10）。
     *
     * 此前一次 401（key 写错、过期、额度用完）在界面上**什么都不显示**：
     * 你自己那句话孤零零挂着，没有回复也没有报错。
     * 而 `prompt()` 的 `catch` 从来没被触发过——**pi 不 reject**，
     * 它把失败写进 `message_end` 的 `stopReason` / `errorMessage` 就走了。
     *
     * 走 `notice` 而不是 `output`：**它不是模型说的话**，
     * 混进回复里会让人以为模型在讲这段错误。
     */
    if (e.type === "message_end" && e.message?.stopReason === "error") {
      const 原因 = e.message.errorMessage?.trim()
      this.emit({
        kind: "notice",
        sessionId,
        text: 原因 ? `模型调用失败：${原因}` : "模型调用失败，但对方没有给出原因",
      })
    }

    /**
     * **谁答的这一条，以 pi 的回执为准**（2026-08-12）。
     *
     * 作者换到 kimi 之后连问三次，答的都是 deepseek。我先前判断
     * 「路由换了，只是模型在念旧话」——**那是读代码得出的，不是验出来的**，
     * 而他手上的证据比我硬。
     *
     * 所以改成不再自证：每条助手消息回执里写着真正答话的那家，
     * **与我们以为的不一致时就出声**。一致时一个字都不多说。
     * 这样「换没换」变成一个可查的事实，不必再靠问模型。
     */
    if (e.type === "message_end" && e.message?.provider && e.message.model) {
      const 实际 = `${e.message.provider}/${e.message.model}`
      const s2 = this.sessions.get(sessionId)
      if (s2 && s2.实际模型 !== 实际) {
        s2.实际模型 = 实际
        this.emit({
          kind: "model",
          sessionId,
          provider: e.message.provider,
          model: e.message.model,
        })
      }
    }

    switch (e.type) {
      case "message_update":
        if (e.assistantMessageEvent?.type === "text_delta") {
          this.emit({ kind: "output", sessionId, data: e.assistantMessageEvent.delta ?? "" })
        }
        /**
         * **思考是另一路，不能混进 `output`**（2026-08-12）。
         *
         * 此前我们只接了 `text_delta`，`thinking_delta` 整个丢掉——
         * 于是「它在想什么」「想了多久」在界面上完全不存在，
         * 一段长思考看起来就是**卡住了**。
         */
        if (e.assistantMessageEvent?.type === "thinking_delta") {
          this.emit({ kind: "thinking", sessionId, delta: e.assistantMessageEvent.delta ?? "" })
        }
        return
      case "tool_execution_start": {
        const toolName = String(e.toolName ?? "?")
        const input = e.args ?? e.input
        this.emit({
          kind: "tool_start",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName,
          input,
        })
        // **先发事件再判定**：这次调用真的发生了，界面上就该看得见它，
        // 哪怕它正是压垮骆驼的那一根
        this.guardAgainstStuckLoop(sessionId, [{ name: toolName, input }])
        return
      }
      case "tool_execution_end": {
        const content = e.result?.content ?? []
        const toolName = String(e.toolName ?? "?")
        const full = content.map((c) => c.text ?? "").join("")
        // **此前这里是 `.slice(0, 2000)`：硬砍、不出声、不留路径。**
        // 现在全文写盘、摘要进事件流、字节数如实上报（规格 7.5）
        const sessionDir = this.sessions.get(sessionId)?.sessionDir
        const out = sessionDir
          ? budgetToolResult(full, { sessionDir, toolName })
          : { text: full, truncated: false, bytes: Buffer.byteLength(full, "utf8") }
        this.emit({
          kind: "tool_end",
          sessionId,
          toolCallId: String(e.toolCallId ?? ""),
          toolName,
          isError: Boolean(e.result?.isError),
          text: out.text,
          truncated: out.truncated,
          bytes: out.bytes,
          ...(out.fullOutputPath ? { fullOutputPath: out.fullOutputPath } : {}),
        })
        return
      }
      case "turn_end":
        // **不在这里重置守卫。** pi 每次模型响应后都发一次 turn_end，
        // 在这里重置等于每次工具调用后清零——守卫永远数不到阈值。
        // 实测：877 次工具调用 = 877 次 turn_end，守卫一次都没触发
        this.emitUsageIfNew(sessionId)
        this.emit({ kind: "turn_end", sessionId })
        return
      case "error":
        // 失败必须出声：转成一条 output 送到界面，而不是静默吞掉（规格 7.5）
        if (e.errorMessage) {
          this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${e.errorMessage}\n` })
        }
        return
      default:
        return
    }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) {
      set = new Set()
      this.sinks.set(sessionId, set)
    }
    const target = set
    target.add(sink)
    return () => {
      target.delete(sink)
    }
  }

  /**
   * 送一轮 prompt。
   *
   * **不 await**：`prompt()` 要跑完一整轮才 resolve，而本方法的契约（`AgentRuntime.write`）
   * 是同步的——调用方是租约守卫，它只负责「准不准写」，不该被一轮对话阻塞。
   * 失败经事件流出声，不静默吞。
   */
  write(sessionId: SessionId, data: string, behavior?: 送法): void {
    this.送一轮(sessionId, data, undefined, behavior)
  }

  /**
   * 带图片的一轮（协议 4.12，2026-08-13）。
   *
   * pi 的 `prompt(text, { images })` 本来就收——`ImageContent` 是
   * `{ type: "image", data, mimeType }`，而 `processImage` 吐的正是这个形状。
   * **所以这一层几乎没有逻辑**：把已经处理好的字节转成 pi 要的样子，其余照旧。
   */
  writeWithImages(
    sessionId: SessionId,
    data: string,
    images: readonly ImageAttachment[],
    behavior?: 送法,
  ): void {
    /**
     * **模型收不了图就当场说，不许让 pi 把它悄悄丢掉**（协议 4.12，2026-08-13）。
     *
     * pi-ai 在拼请求时有一句 `if (hasImages && model.input.includes("image"))`
     * ——**模型没声明收图，那几张图就原地消失**，请求照发、回复照回。
     * 症状是「我明明附了图，它却说没看见」，而人会去换模型、去怀疑自己的 key，
     * 唯独不会怀疑这一行。这是本项目见过最典型的一种「静默丢弃」。
     *
     * 拦在这里而不是更上层：**只有这一层知道这一刻真正在用哪个模型**
     * （会话中途换过服务之后，配置里那个值已经不算数了）。
     */
    const s = this.sessions.get(sessionId)
    const model = s?.session.model
    /**
     * **不因为「模型可能不收图」就拦住这一轮**（2026-08-13 撤掉那道防线，
     * 作者定的）。
     *
     * 他的原话：*「你不能解析就回复不能解析图片就好了，**但是对话是要有的**。」*
     *
     * 我上一版在这里抛错，理由是「不能让图被静默丢掉」。**方向搞反了**：
     * 静默丢掉一张图，人还能接着聊；而拦住整轮，人连对话都没有——
     * 他看见的是一个空会话写着「还没有对话」，那比丢一张图坏得多。
     *
     * **判断能不能看图是模型的事**（作者早先就说过这句）。我们要做的只是
     * **如实说出发生了什么**：pi-ai 在 `model.input` 不含 `image` 时会把图丢掉，
     * 那就在对话里留一句话，然后**照常把这一轮发出去**。
     */
    const 明确不收 = Array.isArray(model?.input) && !model.input.includes("image")
    if (!明确不收) {
      this.送一轮(sessionId, data, images, behavior)
      return
    }

    /**
     * **视觉服务的缝一：贴图转述**（2026-08-20，做法 A；设计定案见
     * `specs/2026-08-20-视觉服务-design.md`）。
     *
     * 视觉可用 → 先把图交给视觉端点要一份描述，把描述并进这一轮文字发出去；
     * 没配 → 上面那句原话照说；**调用失败 → 说清原因，这一轮照发**
     * （作者 2026-08-13 定过：对话是要有的）。
     *
     * 这个方法是同步签名（`void`），转述是异步的——所以走「先收下、后送出」：
     * pi 的 `prompt()` 本来就允许晚一拍。失败经 notice 出声，不静默吞。
     */
    const 端点 = this.opts.vision?.()
    if (!端点) {
      this.emit({
        kind: "notice",
        sessionId,
        text: `模型 ${model.id} 的目录里没有声明支持图片，这 ${images.length} 张可能不会被它看到。`,
      })
      this.送一轮(sessionId, data, images, behavior)
      return
    }
    void 描述图片(端点, images)
      .then((描述) => {
        this.emit({
          kind: "notice",
          sessionId,
          text: `模型 ${model.id} 收不了图，这 ${images.length} 张已由 ${端点.model} 转述给它。`,
        })
        const 并入 = `${data}

[以下是随消息附上的 ${images.length} 张图片，由视觉模型 ${端点.model} 转述]
${描述}`
        // **图仍然带着**：转录里人要看得见原图；pi 那边不收就丢，无所谓
        this.送一轮(sessionId, 并入, images, behavior)
      })
      .catch((e: unknown) => {
        this.emit({
          kind: "notice",
          sessionId,
          text: `视觉转述失败（${e instanceof Error ? e.message : String(e)}），这一轮按原样发出，模型 ${model.id} 可能看不到那 ${images.length} 张图。`,
        })
        this.送一轮(sessionId, data, images, behavior)
      })
  }

  private 送一轮(
    sessionId: SessionId,
    data: string,
    images?: readonly ImageAttachment[],
    behavior?: 送法,
  ): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    const 图 =
      images && images.length > 0
        ? images.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType }))
        : undefined

    /**
     * **上一轮还在跑：交给 pi 的插队 / 排队**（2026-08-15 作者要的）。
     *
     * pi 两条都是原生的（`AgentSession.prompt` 的 `streamingBehavior`）：
     * `steer` 在当前轮跑完工具、下一次调模型之前送进去；
     * `followUp` 等这一轮再没有工具调用和插队消息了才送。
     * **所以我们不自己造队列**——那是「学会了，自己写一个」。
     *
     * **不能走下面那套收尾。** 排队时 `prompt()` 收下就返回，
     * 而下面 `.finally` 里发的是 `turn_end` + `cost` + `idle`——
     * 那会让界面以为这一轮已经完了：等待记号消失、停止按钮变回发送，
     * 而模型其实还在跑。所以这里**不碰 `inFlight`、不挂 `pending`**，
     * 只把失败说出来。
     *
     * 缺席读作 `followUp`：**排队不会丢消息**，而 pi 在流式中没有 behavior
     * 会直接抛错——那时人打的那句话就没了。
     */
    if (s.inFlight > 0) {
      void s.session
        .prompt(data, { ...(图 ? { images: 图 } : {}), streamingBehavior: behavior ?? "followUp" })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
        })
      return
    }
    // 新的一轮开始：上一轮的重复不该算到这一轮头上
    s.stuck.reset()
    s.inFlight += 1
    // 记下这一轮，供 `waitForIdle` 等待。catch 就地挂上，所以它永不 reject
    const run = s.session
      .prompt(data, 图 ? { images: 图 } : undefined)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
      })
      .finally(() => {
        s.inFlight -= 1
        /**
         * **这一轮到此为止——不管是好是坏**（2026-08-11 修）。
         *
         * pi 正常跑完时会自己发 `turn_end`；**但 `prompt()` 直接 reject 的那条路
         * 上一个都没有**（例如 `No API key found for <provider>`——它在发请求之前
         * 就抛了）。于是那一轮**永远开着**，症状有三层，一层比一层难猜：
         *   1. 「正在思考」的动图一直转
         *   2. 界面据「有没有开着的 agent 轮次」算 `busy`，于是它永远为真
         *   3. **`busy` 为真时模型菜单整个是禁用的**——
         *      作者报的「对话过程中，依旧不能切换模型」就是这一层。
         *      而它表现为「点了没反应」，与真正的原因（上一轮没收尾）毫无关系。
         *
         * 重复发一次是安全的：`turn_end` 在中枢那边是幂等的（关一个已经关上的轮次
         * 什么都不做），而漏发一次的代价是上面那三层。
         */
        this.emit({ kind: "turn_end", sessionId })
        /**
         * **成本：我们知道 token，不知道钱。**
         *
         * provider 报的是 token（`s.lastUsage`，上下文栏用的就是它），
         * **金额一处都没有**——要得到金额只能自己维护一张价目表再乘一遍，
         * 那是估算，而账本上的估算会被当成事实（不变式 5 禁止编造）。
         *
         * 所以如实说「不可见 + 为什么」，而不是让成本栏永远停在
         * 「尚未记录」——那句话是错的：**我们记了，只是记不到钱。**
         */
        this.emit({
          kind: "cost",
          sessionId,
          cost: { visible: false, reason: "该 provider 只报 token，不报金额；token 用量见上下文栏" },
        })
        // **一整轮真正结束。** 这是唯一可靠的边界——见 AgentEvent.idle 的说明
        this.emit({ kind: "idle", sessionId })
      })
    // 串起来而不是覆盖：连发两轮时，等待必须覆盖两轮，不能只等最后一轮
    s.pending = s.pending ? s.pending.then(() => run) : run
    void s.pending
  }

  /**
   * 卡死判定。触发则**先出声再中止**。
   *
   * 顺序要紧：静默中止会让用户看到一个突然停下的会话且不知道为什么——
   * 那比继续烧钱更难排查（规格 7.5）。
   */
  private guardAgainstStuckLoop(sessionId: SessionId, calls: GuardedCall[]): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    const reason = s.stuck.check(calls)
    if (!reason) return
    s.stuck.reset()
    this.emit({ kind: "notice", sessionId, text: reason })
    void this.abort(sessionId).catch(() => {
      // 中止失败也不能再吞——但此刻原因已经发出去了，用户至少知道发生了什么
    })
  }

  /** 中止当前回合。会话仍然活着，可以继续对话 */
  /**
   * 把 provider + model 名解析成 pi 的 Model 对象。
   *
   * **无静默回退**：不在 pi 的目录里就立即失败，并说清该 provider 有哪些。
   * `start()` 与 `setModel()` 共用它——两处各写一份错误信息，
   * 迟早会有一处说得比另一处含糊。
   */
  private async resolveModel(provider: string, modelId: string) {
    const modelRuntime = await this.runtime()
    const model = modelRuntime.getModel(provider, modelId)
    if (model) return model

    const all = modelRuntime.getModels()
    const known = all.filter((m) => m.provider === provider)
    if (known.length === 0) {
      const providers = [...new Set(all.map((m) => m.provider))]
      throw new Error(
        `没有 provider "${provider}"。已知的：${providers.join(", ") || "(空——模型目录尚未同步)"}`,
      )
    }
    throw new Error(
      `provider "${provider}" 没有模型 "${modelId}"。` +
        `该 provider 可用的模型：${known.map((m) => m.id).join(", ")}`,
    )
  }

  /**
   * 上下文用量（①-B″ · U3）。
   *
   * ## 只报能精确量的，不估算
   *
   * `pi-ai` 里**没有 tokenizer**。字节数可以精确量，token 不能——
   * 把字节占比乘上一个 token 总数假装成分解，就是编造，
   * 而**分解不准比不分解更坏：它会让人据此做错决定**。
   *
   * 所以这里回两样各自为真的东西：
   *   - `contextWindow`：模型自带的上限，**真数**
   *   - `bytes`：系统提示词 / 工具 schema / 对话历史三档的**字节数，不是 token**
   *
   * `usedTokens` 来自 provider 报的真 usage（`s.lastUsage`，见 `translate`）。
   * **拿不到就不给这个字段**，界面显示「尚未采集」，不拿字节去凑。
   *
   * （这段注释一度写着「usage 目前一处都没采集」，而同一个文件下面就在采——
   * 那是接线之前留下的，2026-08-10 随成本接线一并更正。）
   */
  contextUsage(sessionId: SessionId): ContextUsage | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) return undefined
    const st = s.session.state as {
      systemPrompt?: string
      tools?: unknown[]
      messages?: unknown[]
      model?: { contextWindow?: number; id?: string }
    }
    const size = (v: unknown): number =>
      v === undefined ? 0 : Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v), "utf8")
    return {
      // `exactOptionalPropertyTypes`：**缺省与「值为 undefined」不是一回事**，
      // 所以拿不到就不给这个字段，而不是给一个 undefined
      ...(st.model?.id ? { model: st.model.id } : {}),
      ...(st.model?.contextWindow ? { contextWindow: st.model.contextWindow } : {}),
      // **真 token，来自 provider。** 缺就不给这个字段——
      // 界面据此显示「尚未采集」，而不是显示 0
      // **从会话状态取**，不读那个从来没被填上的 `lastUsage` 缓存
      ...(( ) => {
        const u = this.latestUsage(sessionId)?.usage
        return u?.input !== undefined ? { usedTokens: u.input + (u.cacheRead ?? 0) } : {}
      })(),
      bytes: {
        system: size(st.systemPrompt),
        tools: size(st.tools),
        history: size(st.messages),
      },
    }
  }

  /**
   * 该 provider 在 pi 的模型目录里**真正有哪些模型**（①-B″ · U2）。
   *
   * **与 `getProviders` 的 `providers[].models` 不是一回事**：那一份是
   * 「providers.yaml 里声明过的 agent 各自用了哪个模型」，为凭证界面设计的。
   * 模型选择器要问的是这一份——**两者语义不同，合并会让两边都说不清**。
   *
   * 认不出 provider 时返回空数组：**「不知道」由调用方决定怎么表达**，
   * 这一层不该替它编一个默认值。
   */
  async availableModels(provider: string): Promise<string[]> {
    const rt = await this.runtime()
    return rt
      .getModels()
      .filter((m) => m.provider === provider)
      .map((m) => m.id)
  }

  /**
   * pi 认识的全部 provider（2026-08-10）。
   *
   * 作者：*「配置里面目前只有一个 deepseek，pi-ai 里面不是可以兼容很多吗？
   * 应该都加进去。」* 此前凭证界面只列 `providers.yaml` 里声明过的那几个——
   * **那是「我配过谁」，不是「我能配谁」**，两者差着 38 个。
   *
   * **来源是 pi 的模型目录，不是一份我手打的清单。**
   * 手打的清单会在 pi 更新目录的第二天就开始撒谎，而且没有人会发现——
   * 界面上少一个 provider 不报错，它只是**不存在**。
   */
  async knownProviders(): Promise<string[]> {
    const rt = await this.runtime()
    return [...new Set(rt.getModels().map((m) => m.provider))].sort()
  }

  /**
   * 地址 pi 不自带的那几个 provider（2026-08-10）。
   *
   * 实测 40 个里有 8 个：Bedrock / Azure / Vertex / Cloudflare×2 /
   * opencode×2 / radius——它们跟账号、区域、项目走，pi 没法替你填。
   * **界面据此给输入框**；不给的话，填了 key 也连不上而没人知道为什么。
   */
  async providersNeedingBaseUrl(): Promise<string[]> {
    return (await this.providerList())
      .filter((p) => !p["baseUrl"])
      .map((p) => String(p["id"] ?? ""))
      .filter(Boolean)
      .sort()
  }

  /**
   * provider 的**显示名**：`deepseek` → `DeepSeek`（2026-08-11）。
   *
   * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」* 他是对的——
   * `ds-chat` 是配置里的一个键，是我们的内部标识，不是这家服务的名字。
   *
   * **名字来自 pi 的 provider 表，不是一份我手打的对照表。**
   * 手打的那天起就开始撒谎：pi 新增一家、或改了写法，我们这边不会有任何迹象。
   * 实测 pi 自己带着 `name`：`deepseek → DeepSeek`、
   * `kimi-coding → Kimi For Coding`、`moonshotai-cn → Moonshot AI CN`。
   *
   * **认不出的不给键**——缺省由界面决定怎么表达（它会退回用 id），
   * 而不是在这里编一个。
   */
  async providerNames(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const p of await this.providerList()) {
      const id = String(p["id"] ?? "")
      const name = p["name"]
      if (id && typeof name === "string" && name) out[id] = name
    }
    return out
  }

  /**
   * pi 的 provider 表，**统一成数组**。
   *
   * pi 在不同版本里给的是数组还是以 id 为键的对象并不确定，
   * 两处调用各写一遍归一化，迟早只改对一处。
   */
  private async providerList(): Promise<Record<string, unknown>[]> {
    const rt = await this.runtime()
    const provs = (rt as unknown as { getProviders?: () => unknown }).getProviders?.()
    if (!provs) return []
    return Array.isArray(provs)
      ? (provs as Record<string, unknown>[])
      : Object.entries(provs as Record<string, Record<string, unknown>>).map(([id, v]) => ({
          id,
          ...v,
        }))
  }

  /**
   * 会话中途换模型（①-B″ · U2）。
   *
   * **能力由 Spike E 在真链路上验过**：`flash → deep`，且下一次请求确实打到新模型
   * （从假后端记下的请求体证明，不是"调用没抛异常"）。
   *
   * ## 「正在说话时不许换」这道门为什么在这一层
   *
   * Spike E 查出 `session.isStreaming` **在 prompt 真正开始之前是 `false`**——
   * 与本项目早先在 `waitForIdle` 上栽的是同一件事。所以判断依据是
   * **运行时自己跟踪的 `pending`**，不是问 pi。
   *
   * 而且门开在这里，界面、CLI、命令面板三个入口共用同一道——
   * 放到界面里就意味着每加一个入口要记得补一次。
   *
   * ## 没配凭证时的错误要翻成人话
   *
   * pi 抛的是 `No API key for <provider>/<model>`（Spike E 实测）。
   * 原样丢给用户等于让他自己猜下一步该干什么。
   */
  /**
   * 用这段会话**此刻的模型与凭证**问一句、拿整段回答（提示词增强，2026-08-21）。
   *
   * 不经过会话：不进转录、不进账本、不占回合。`ModelRuntime.completeSimple` 自己解析凭证，
   * 所以这里不碰钥匙串。没有会话时给 `provider` + `model`（空态屏用配置里第一个 native）。
   *
   * **失败如实抛**：模型说 `stopReason: "error"` 就把它的话原样给出去，不吞成空串。
   */
  async 问一句(
    目标: { sessionId: SessionId } | { provider: string; model: string },
    req: { system?: string; user: string; maxTokens: number; temperature?: number; signal?: AbortSignal },
  ): Promise<{ text: string; model: string }> {
    const runtime = await this.runtime()
    const model =
      "sessionId" in 目标
        ? (() => {
            const s = this.sessions.get(目标.sessionId)
            if (!s) throw new Error(`会话 "${目标.sessionId}" 未启动`)
            const m = s.session.model
            if (!m) throw new Error(`会话 "${目标.sessionId}" 还没选定模型`)
            return m
          })()
        : await this.resolveModel(目标.provider, 目标.model)
    const msg = await runtime.completeSimple(
      model,
      {
        ...(req.system ? { systemPrompt: req.system } : {}),
        messages: [{ role: "user", content: req.user, timestamp: Date.now() }],
      },
      {
        maxTokens: req.maxTokens,
        temperature: req.temperature ?? 0.3,
        ...(req.signal ? { signal: req.signal } : {}),
      },
    )
    if (msg.stopReason === "error") throw new Error(msg.errorMessage ?? "模型报错但没说原因")
    if (msg.stopReason === "aborted") throw Object.assign(new Error("已取消"), { name: "AbortError" })
    const text = msg.content
      .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
      .map((c) => c.text)
      .join("")
    return { text, model: `${model.provider}/${model.id}` }
  }

  async setModel(sessionId: SessionId, provider: string, modelId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动，无法换模型`)
    if (s.inFlight > 0) {
      throw new Error("这一轮还没说完。等它结束或先中止，再换模型")
    }

    const model = await this.resolveModel(provider, modelId)
    try {
      await s.session.setModel(model)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/no api key/i.test(msg)) {
        throw new Error(`provider "${provider}" 还没有配置 API key——在「设置」里填好之后再换`)
      }
      throw e
    }
    /**
     * **把「换人了」这件事写进模型的上下文**（2026-08-12）。
     *
     * 作者：换到 kimi 之后再问「你是什么模型」，它仍然答 deepseek-v4-flash。
     *
     * 那不是没换过去——路由换了。**是模型根本不知道自己是谁**：
     * 它只能读上下文，而上下文里有两处旧身份——会话开头那份系统提示词，
     * 以及**它自己上一轮说过的话**（作者那次输入 2.6k token，
     * 「我是 deepseek-v4-flash」就在里面）。于是它照着念。
     *
     * 最能说明问题的是它第一次的动作：先跑 `env | grep -i "^PI_"`
     * **去环境变量里找自己是谁**——手上没有可靠答案，只好翻。
     *
     * 所以补一句事实进去。**`display: false`**：它是给模型读的，
     * 不是给人看的——人那一侧界面上已经有「已换到 …」那条了，
     * 摆两遍等于同一件事说两回。
     */
    try {
      s.sessionManager.appendCustomMessageEntry(
        "dawn-model-change",
        /**
         * **必须直说「前面那些是旧的」。**
         *
         * 第一版只写了「从此由 X 回答」，压不住实际发生的事：
         * 模型在更早一轮跑过 `env | grep PI_`，那份输出**留在对话里**，
         * 于是它照着念「模型：deepseek-v4-flash」——而那两轮它根本没再跑 env。
         * **一份长得像证据的旧快照，比一句一般性的通知有力得多**，
         * 所以这句话要点名它。
         */
        `[system] The active model for this conversation has changed. ` +
          `You are now "${modelId}" (provider "${provider}"). ` +
          `IMPORTANT: earlier turns in this conversation — including any output of ` +
          `\`env\`, PI_MODEL / PI_PROVIDER values, and any statement you made about ` +
          `which model you are — describe the PREVIOUS model and are now out of date. ` +
          `Do not quote them. If asked which model you are, answer "${modelId}".`,
        false,
      )
    } catch (e) {
      /**
       * **写不进去不该让换模型失败**：路由已经换成功了，这一句只是让它
       * 说得对。但**不能静默**——不说的话，「它还报旧名字」就永远查不出原因。
       */
      console.error(
        `[runtime] 换模型的那条上下文没写进去（${sessionId}）：`,
        e instanceof Error ? e.message : String(e),
        "——模型可能仍会报上一个名字",
      )
    }
    /**
     * **先按我们请求的记下**（2026-08-12）。
     *
     * 不记的话，下一条回执必然与「不知道」不一致，于是同一件事会被说两遍——
     * 作者截图里那两行一模一样的「已换到 kimi-k3 · kimi-k3」就是它。
     *
     * 记下之后，回执只在**真的对不上**时才出声。而它真出过声：
     * 作者请求 `kimi-k3`，服务端实际给的是 `kimi-k2.7-code-highspeed`——
     * **那是那个端点自己在路由**，不是我们的问题，但以前它是隐形的。
     */
    s.实际模型 = `${provider}/${modelId}`
    /**
     * **写完读回来，以读到的为准**（2026-08-12，作者提）。
     *
     * 作者：*「每一次点击切换模型的时候，你就真实地去识别一下当前模型是什么，
     * 不就好了？」* 他是对的，而我先前偏偏没做——一直在**报告自己的意图**
     * （「我请求换到 X」），而不是**报告事实**（「现在真的是 X」）。
     * 这两者一旦不一致，界面就会很自信地说错话，
     * 而人只能靠反复问模型来发现——他确实问了三次。
     *
     * `session.model` 是 pi 自己认的那一个。读不到时退回我们请求的那个，
     * **并且照实说不出「已核对」**：那时它仍然只是一个意图。
     */
    const 读回 = s.session.model
    const 真provider = 读回?.provider ?? provider
    const 真model = 读回?.id ?? modelId
    s.实际模型 = `${真provider}/${真model}`
    // **提示词里那句「你现在是谁」也要跟着改**——不改的话它照旧答上一个
    s.设当前模型(`${真model}（provider：${真provider}）`)

    if (读回 && (真provider !== provider || 真model !== modelId)) {
      /**
       * **请求的与实到的不一样，要说。**
       *
       * 作者那台机器上真的出现过：请求 `kimi-k3`，回执里是
       * `kimi-k2.7-code-highspeed`——**那是端点自己在路由**，不是我们的错，
       * 但它以前是隐形的，而隐形的替换正是「我以为我在用 A」的来源。
       */
      this.emit({
        kind: "notice",
        sessionId,
        text: `请求的是 ${provider} · ${modelId}，实际生效的是 ${真provider} · ${真model}`,
      })
    }
    this.emit({ kind: "model", sessionId, provider: 真provider, model: 真model })
    // 换了模型，「支持不支持推理强度」可能变了——整份重发
    this.发会话开关(sessionId)
  }

  async abort(sessionId: SessionId): Promise<void> {
    await this.sessions.get(sessionId)?.session.abort()
  }

  /**
   * 插一句引导，不打断整轮。
   *
   * 与 `write` 的区别：后者是「说完了，该你了」，前者是「你继续，但注意这个」。
   */
  async steer(sessionId: SessionId, text: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    await s.session.steer(text)
  }

  async stop(sessionId: SessionId): Promise<void> {
    // 启动还没完成就被停(E5):会话还没登记进 sessions,直接返回会让它「起完就漏」。
    // 记一笔并等启动结束——start() 的收尾会据此把刚起来的立刻停掉。
    if (this.起中.has(sessionId) && !this.sessions.has(sessionId)) {
      this.已请求停.add(sessionId)
      await this.起中.get(sessionId)!.catch(() => {})
      // 到这里 start() 的收尾要么已经把它停干净(下面 get 拿不到直接返回),要么启动失败了
    }
    const s = this.sessions.get(sessionId)
    if (!s) return
    // **同步认领**:先从表里摘掉,一个并发的 stop() 就 get 不到、直接返回——避免两条路都 dispose
    // 同一段(start 启动期收尾的那次 stop 与外部那次 stop 会撞在一起)导致 double-dispose(E5 连带)。
    this.sessions.delete(sessionId)
    // 先中止在跑的一轮，再退订，最后释放——顺序反了会在 dispose 之后收到事件
    await s.session.abort().catch(() => {})
    s.收尾?.()
    this.产物们.delete(sessionId)
    // 还在等人答的权限卡一律按拒——会话都没了，5 分钟后再向它发 settled 没有意义
    for (const [id, 等] of [...this.待答]) if (等.sessionId === sessionId) { this.待答.delete(id); 等.答("deny") }
    s.unsubscribe()
    s.session.dispose()
    // **这段对话用过的 run_code 内核也回收**(审查 debug H1):它们挂在 `对话内核` 里、不在 SessionManager,
    // 会话停了不收的话,python/R 进程与它的 zeromq socket 一直留着——端口泄漏,退出时还会 SIGABRT。
    // 收全部只在退出时兜底;按会话收才让长时间跑不积压一堆死内核。
    void this.opts.kernels?.收(sessionId).catch(() => {})
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
  }
}

/** 当前活着的团队 id 记在会话目录里的一行文件——重开会话还接得上 */
function 读当前团队(sessionDir: string): string | undefined {
  try {
    const v = readFileSync(join(sessionDir, "teams", "current"), "utf8").trim()
    return v || undefined
  } catch {
    return undefined
  }
}
function 记当前团队(sessionDir: string, id: string | undefined): void {
  try {
    mkdirSync(join(sessionDir, "teams"), { recursive: true })
    writeFileSync(join(sessionDir, "teams", "current"), id ?? "", "utf8")
  } catch (e) {
    console.error("[团队] 记不住当前团队：", e instanceof Error ? e.message : String(e))
  }
}

/** 给权限卡看的一句：工具名 + 主参数 */
function 摘要(name: string, params: Record<string, unknown>): string {
  const 主 = typeof params.command === "string" ? params.command : typeof params.path === "string" ? params.path : ""
  return 主 ? `${name}：${主.length > 160 ? `${主.slice(0, 160)}…` : 主}` : name
}

/** 这次调用会创建哪些文件（写 / 编辑的目标，shell 重定向的目标）——给产物登记用 */
function 要建的文件(name: string, params: Record<string, unknown>, cwd: string): string[] {
  if ((name === "write" || name === "edit") && typeof params.path === "string") return [isAbsolute(params.path) ? params.path : join(cwd, params.path)]
  if (name === "bash" && typeof params.command === "string") return 重定向目标(params.command).map((t) => (isAbsolute(t) ? t : join(cwd, t)))
  return []
}

/** 给模型的删除指引（学自 dsh-auto-mode 的 Auto 动态提示）。它帮规划，不是安全边界；门才是 */
const 删除指引 = `## 动文件的规矩
- 删除是最高风险的操作。能移动到 .dawn/trash/、能 git rm、能改名留底，就别直接 rm。
- 一次只删一个可见的字面目标；不要用通配符、变量、管道或 find -delete 去删——那种删除会被直接拒。
- 这段会话自己生成的文件可以清；会话之前就有的文件、data/raw/ 里的东西，删之前先问人。
- 不要 sudo，不要碰主目录顶层与系统目录，不要把凭据发到网上——这些任何档都会被拒，别反复试。
- 被拒了就换一条不需要那个动作的路，或把需要人做的那一步说清楚交给人。`
