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
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  calculateContextTokens,
  createSyntheticSourceInfo,
} from "@earendil-works/pi-coding-agent"
import { StuckGuard, type GuardedCall } from "./stuck-guard.js"
import { budgetToolResult } from "./tool-output.js"
import { 还原历史, 取文本, 分支转消息, 换上方案卡 } from "./history.js"
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises"

/**
 * 回退时界面那句与 pi 那句核对原文（2026-09-27，Task 4 复审收紧；Task 5 复审改成按真名认）。
 * pi 那句要**包含**界面那句：视觉转述会追加描述、图片会变成「（图片）」。**只有 pi 真展开过的斜杠调用才免核**——
 * 按 pi 的两条展开路（`agent-session.js` 的 `_expandSkillCommand` 与 `expandPromptTemplate`）认，不按长相猜：
 * - `/skill:名 参数`：pi 只在名字是已加载的技能时展开，展开结果以 `<skill name="名"` 开头——**看记录里那句是不是这个开头**
 *   （技能后来删了也认得出；中文名也认得出——旧的 `\w` 认不出 `/skill:画图`）；
 * - `/名 参数`：pi 只在名字是提示模板时展开——**查此刻的模板名单**。
 * 其余斜杠开头的话（`/data.csv 看一下`、`/Users/…`）pi 原样收下，照常核对。
 * **空文不许凭 `includes("")` 蒙过去**：只有 pi 那句去掉图片记号之后也是空的（只附了图）才算对上。
 */
export function 原文对得上(界面: string, pi那句: string, 名单: { 模板: ReadonlySet<string> }): boolean {
  const 斜杠 = /^\/(\S+)(?:\s|$)/.exec(界面)?.[1]
  if (斜杠?.startsWith("skill:") && pi那句.startsWith(`<skill name="${斜杠.slice(6)}"`)) return true
  if (斜杠 && 名单.模板.has(斜杠)) return true
  if (!界面.trim()) return !pi那句.replace(/（图片）|（见附图）/g, "").trim()
  return pi那句.includes(界面)
}

import { ProvenanceProbe, 套上溯源, 并进登记新建, isProducing, 只读工具的空事实 } from "./provenance.js"
import { createSubagentTool, createSubagentFollowUp } from "../subagent/tool.js"
import { 子运行目录 } from "../subagent/run-dir.js"
import { 子目录段 } from "../protocol/subagent-id.js"
import { 挑工具后端 } from "../remote/tools.js"
import { createRunCodeTool, 内核指引 } from "../tools/run-code.js"
import { officeTools, type Office开关 } from "../tools/office/index.js"
import { browserTools, type Browser开关 } from "../tools/browser/index.js"
import { memoryTools, 技能沉淀指引, type Memory开关, type Memory依赖 } from "../tools/memory/index.js"
import { createLookAtImageTool } from "../tools/look-at-image.js"
import { createReadMainSessionTool, READ_MAIN_SESSION } from "../tools/read-main-session.js"
import { 产物登记, 重定向目标 } from "../policy/artifacts.js"
import { 团队调度器 } from "../team/scheduler.js"
import { createTeamTools, 队长协议 } from "../team/tools.js"
import { 描述图片 } from "./vision.js"
import { createMcpTools, MCP只读标记 } from "../tools/mcp-tool.js"
import { createProposePlanTool } from "../tools/propose-plan.js"
import { createInspectDataTool } from "../tools/inspect-data.js"
import { 关掉pi自己下载, 不自己下载 } from "./no-tool-download.js"
import { 方案期判, 方案指纹, 方案存档名, 存档方案, 核对方案, 核对并恢复, type 已批准存档 } from "../policy/plan-mode.js"
import { 方案簿, 方案簿文件名, 写方案文件, 删方案文件, 方案存档正文 } from "./plan-book.js"
import { 出方案工具名, 看数据工具名, 方案文件名 } from "../protocol/plan.js"
import type { 对话内核 } from "../kernel/挂载.js"
import { RUN_AS_NODE } from "../subagent/protocol.js"
import type { CredentialStore, ThinkingLevel } from "@earendil-works/pi-ai"
import { completeSimple as 直接问 } from "@earendil-works/pi-ai/compat"
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
  调整的那句,
  会话开关,
  压缩原因,
  回退的那句,
  回退做法,
  回退回执,
} from "./types.js"
import { 检查点存档, 回退不了 } from "../project/checkpoints.js"
import { 给模型的回退话 } from "./rewind-note.js"
import { 续接或新建 } from "./pi-resume.js"

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
  /**
   * 压缩参数的覆盖（2026-09-27）。**只在内存里改**（pi 的 `SettingsManager.applyOverrides`），不写 pi 的 `settings.json`
   * （`setCompactionEnabled` 那一类会 `save()`，设计契约扫描拦着）。缺省 = 照 pi 的默认（留 16384 给摘要、保留最近 2 万 token）。
   * e2e 与 `dev:mock` 把 `keepRecentTokens` 设成 1——不然短对话「没有可压缩的」，手动压缩在那两处永远演不出来。
   */
  compaction?: { keepRecentTokens?: number; reserveTokens?: number }
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
   * 回退这一轮的影子存档（2026-09-27）。**默认开**；远端会话一律不开（服务器上不放任何文件）。
   * 只在明确不需要时置 false（例如纯对话的性能测试）。
   */
  checkpoints?: boolean
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
  /**
   * 侧边对话读主对话（2026-09-24）。给了才装 `read_main_session`；**晚绑定**——
   * wiring 里转录表建在运行时之后，所以这里收的是回调，调用时才去找。
   */
  读主对话?: (sideId: SessionId) => string | undefined
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
  /**
   * 已经报过的那条回复的时间戳（2026-09-27）。**有时间戳时按它判重**：pi 压缩时把 `messages` 换成「摘要 + 最近几条」，
   * 下标全变了——只按下标认，最后那条老回复会被当成新的再报一次，而账本对 `turn_usage` 是累加的。
   */
  usageTsReported: number | undefined
  /**
   * 手动压缩发出去了、还没见到 `compaction_end`（2026-09-27）。`compact()` 发出时立起、`translate` 见到 end 放下、
   * `compact()` 收尾时再放下一次。pi 在发 start 之前就失败时没有 end 可等——`compact()` 的失败分支见它还立着就补一句。
   * 自动压缩不碰它（那条路 pi 必发 end）。
   */
  压缩待出声: boolean
  /** 该会话的隔离目录。工具输出的全文写在它下面 */
  sessionDir: string
  /**
   * 卡死守卫。**每会话一个**——两个会话各自打转，互不相干。
   * pi 自己不管这件事，模型退化时会一路烧到迭代上限。
   */
  stuck: StuckGuard
  /**
   * **待发单的镜像**（2026-09-23，学自 Codex）。
   *
   * 真正的队列在 pi 那儿（模型读的是那份），镜像只记 pi 没记的：我们的 id、原图、送进去时的原文——
   * 撤回与调整方向要 `clearQueue()` 之后按原样重送，而 pi 的单子里只剩展开过的文字、没有图。
   * **先后与「送到了没有」一律以 pi 的 `queue_update` 为准**（见 `对账待发`）。
   */
  待发: 待发条目[]
  /** pi 上一次报的排队单有几条。**只认变短**——变短才是「送走了」 */
  pi待发: number
  /** 我们自己在 `clearQueue()`：那次变短不是送到，别当成送到 */
  清队中: boolean
  /**
   * 正在中止（停止 / 调整方向，2026-09-25）。这期间结束的工具一律标 `interrupted`——
   * bash 与 `run_code` 同一个判据，不靠认结果文字（pi 的 bash 回 `Command aborted`，`run_code` 回「已中断」，各说各的）。
   * 这期间 pi 报的「模型调用失败：This operation was aborted」也不出声（那是中止本身，不是失败）。
   *
   * **是计数不是开关**（审查 09-25 I-2）：调整方向停着的时候又按了停止，两边各进各出——
   * 开关的话停止先做完、它的 `finally` 会把调整方向那一段一并放下，此后结束的工具就漏标了。
   */
  中止中: number
  /**
   * 按过几次「停止」（`abort()` 每次加一；2026-09-25 审查 I-2）。调整方向在按下时记一个数，
   * 停下那一步、等新一轮起跑之后各对一次：变了就是人在这期间按了停止——**停止赢**，不再起新一轮、不再重排。
   */
  停止代: number
  /** 调整方向正在重排其余几条：这期间不逐条发 `queue`，排完发一次整份（审查 09-25 M-4：不先发半份） */
  重排中: boolean
  /** 调整方向一个接一个做（2026-09-25）：两次挨得太近时，后一次等前一次停稳再动 */
  调整链: Promise<void> | undefined
  /**
   * 正在回退（2026-09-27，Task 4 复审）。`rewind()` 从头到尾立着：检查一次「不在跑」之后要等很久的 `存档.回退()`，
   * 这期间人发一句 → pi 开始流式 → 后面的 `navigateTree` 在文件已经退了之后才失败；连按两次回退，两次都按旧分支定位，
   * 第二次会把第一次撤掉的几轮接回来。立着的时候：发话、压缩、预览、再回退一律拒（「正在回退」）。
   */
  回退中: boolean
  /**
   * 正在转述图片的有几张单（2026-09-27，Task 5 复审）。空闲时发带图的一句：人那句**现在**就进了转录，`送一轮` 要等转述回来才开跑，
   * 这几秒 `inFlight` 还是 0——回退、压缩会从这条缝过去（转录撤了那句，pi 随后又收到它）。所以它也算「在忙」（`不许在跑`、`compact`）。
   * 在 `转述()` 里进出：转述完到 `送一轮` 之间只隔几个微任务，没有别的请求插得进来。
   */
  转述中: number
  /** 正在回退的那一次（2026-09-27，Task 5 复审）：`stop()` 等它做完再拆会话——不然 `navigateTree` 做到一半会话就没了 */
  回退: Promise<unknown> | undefined
}

/**
 * 待发镜像里的一条（2026-09-23；审查后 09-24 改）。
 *
 * - `id` **可缺**：飞书 / 微信 / 定时这些不经界面的写没有待发单上的身份，但它们照样进了 pi 的单子——
 *   **镜像不收它们，数数就对不上**（pi 送走一条不认识的，镜像会把一条认识的错当成送到了），
 *   撤回重送时 `clearQueue()` 也会把它们一并清掉、再也回不来。所以一律进镜像，只是不上待发条。
 * - `在`：这条此刻在哪儿。
 *   - `"pi"`：交给了 pi，在它的 followUp 单子上；
 *   - `"缝"`：撞上「我们以为在跑、pi 说没在跑」的缝（`送一轮` 的 #5 分支），挂在这一轮的 `pending` 上、等收尾按新一轮送；
 *   - `"转述"`：在等视觉模型转述图片，转述完才交给 pi。
 *   后两种 pi 的单子里没有：对账时跳过，撤单（`clearQueue()`）拿不回它们。
 *   **两种要分开**（审查 09-25 I-1）：转述中的那条文字还没定（要并进转述），不能拿去起新一轮；
 *   缝里的那条文字是定的，调整方向可以把它摘下来（它挂着的回调摘不到就不送了）当这句、或算进其余。
 */
interface 待发条目 {
  id: string | undefined
  文: string
  图: readonly ImageAttachment[] | undefined
  在: "pi" | "缝" | "转述"
}

/** pi 的会话事件（结构化程度足够，但类型不从包里导出，故在此收窄） */
interface PiEvent {
  type?: string
  /** `queue_update` 的两张单子（展开过的文字，按 pi 送出的先后） */
  steering?: readonly string[]
  followUp?: readonly string[]
  toolCallId?: string
  toolName?: string
  args?: unknown
  input?: unknown
  /**
   * `tool_execution_end` 的工具结果；`compaction_end` 压成了时也叫 `result`（pi 的 `CompactionResult`，2026-09-27）——
   * 同名不同物，按 `type` 分开读。
   */
  result?: {
    isError?: boolean
    content?: { type?: string; text?: string }[]
    summary?: string
    tokensBefore?: number
    estimatedTokensAfter?: number
    usage?: { input?: number; output?: number; cacheRead?: number }
  }
  /** `compaction_start` / `compaction_end` 的起因：`manual` / `threshold` / `overflow`（2026-09-27） */
  reason?: string
  /** `compaction_end`：被停下了（停止 / 调整方向会 `abortCompaction()`） */
  aborted?: boolean
  /** `compaction_end`：超上限那种，压完 pi 会重试刚才那一轮 */
  willRetry?: boolean
  /**
   * **pi 把「这次失败了」放在事件顶层**（`tool_execution_end.isError`，`pi-agent-core/dist/agent-loop.js`）。
   * 它自带的工具失败时是**抛异常**，pi 接住后造的结果对象里根本没有 `isError`——
   * 只读 `result.isError` 的话，本机 bash 非零退出、read 读不到文件都显示成「成功」（2026-09-15 查到）。
   */
  isError?: boolean
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

/** pi 只有这三种起因；认不出的当作过线——多出来的值不许让事件变形（2026-09-27） */
export function 认原因(r: string | undefined): 压缩原因 {
  return r === "manual" || r === "overflow" ? r : "threshold"
}

/**
 * pi 的压缩失败原因 → 人话（2026-09-27）。认得的几句翻；**认不出的原样透传**（规格 7.5：不吞、不改写别人的话），
 * 只剥掉 pi 自己加的那层前缀。
 */
export function 压缩原因人话(msg: string | undefined): string {
  const 原 = msg?.trim()
  if (!原) return "pi 没有给出原因"
  if (/Nothing to compact/i.test(原)) return "对话还太短，没有可压缩的"
  if (/Already compacted/i.test(原)) return "刚压缩过，还没有新内容"
  if (/after one compact-and-retry attempt/i.test(原)) {
    return "超过上限后压缩重试了一次，还是放不下——换一个上限更大的模型，或者开一段新对话"
  }
  const m = /^(?:Compaction failed|Auto-compaction failed|Context overflow recovery failed):\s*([\s\S]+)$/.exec(原)
  return m ? m[1]!.trim() : 原
}

/**
 * pi 的 `compaction_end` → 我们事件的字段（2026-09-27）。**纯函数**，单测直接打它。
 * 有 `result.summary` = 压完；`aborted` = 停下了（不说失败）；其余 = 没压成，原因翻成人话。
 */
export function 压缩收尾字段(
  e: Pick<PiEvent, "reason" | "result" | "aborted" | "willRetry" | "errorMessage">,
): Omit<Extract<AgentEvent, { kind: "compaction_end" }>, "kind" | "sessionId"> {
  const reason = 认原因(e.reason)
  const r = e.result
  if (r && typeof r.summary === "string") {
    const u = r.usage
    return {
      reason,
      status: "done",
      ...(typeof r.tokensBefore === "number" ? { tokensBefore: Math.round(r.tokensBefore) } : {}),
      ...(typeof r.estimatedTokensAfter === "number" ? { tokensAfter: Math.round(r.estimatedTokensAfter) } : {}),
      ...(r.summary.trim() ? { summary: r.summary } : {}),
      ...(e.willRetry ? { retried: true as const } : {}),
      // **只发我们声明过的三个字段**——与 `emitUsageIfNew` 同一个理由（协议那边是 `.strict()`）
      ...(u && (u.input ?? 0) + (u.output ?? 0) > 0
        ? {
            usage: {
              ...(u.input !== undefined ? { input: u.input } : {}),
              ...(u.output !== undefined ? { output: u.output } : {}),
              ...(u.cacheRead !== undefined ? { cacheRead: u.cacheRead } : {}),
            },
          }
        : {}),
    }
  }
  if (e.aborted) return { reason, status: "cancelled" }
  return { reason, status: "failed", error: 压缩原因人话(e.errorMessage) }
}

/**
 * 最近一次**真回复**报的上下文大小（2026-09-27）：倒着找第一条没中止、没出错、用量不为零的助手消息，
 * 用 pi 判线的那个函数（`calculateContextTokens`：`totalTokens`，没有就四项相加）算。
 * 拿它与 pi 的数一比，就知道 pi 那个数里有没有「按字数估」的一截。
 */
function 最后一次真回复(messages: readonly unknown[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; stopReason?: string; usage?: Parameters<typeof calculateContextTokens>[0] } | undefined
    if (m?.role !== "assistant" || !m.usage || m.stopReason === "aborted" || m.stopReason === "error") continue
    const n = calculateContextTokens(m.usage)
    if (n > 0) return n
  }
  return undefined
}

export class NativeRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, NativeSession>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /**
   * 此刻挂在坞里的那几段（2026-09-24，侧边对话）：`read_main_session` 只对它们启用。
   * **按会话 id 记，不跟着 pi 会话走**——重启后界面先配对、会话后起；停了再起（仍在坞里）也照样开着。
   * 所以 `stop` 不摘它：配对的生死归后端对照表，拿下 / 归档 / 删除时由后端 `setSideTool(id, false)`。
   */
  private readonly 侧边工具开 = new Set<SessionId>()
  /**
   * 每段会话一本方案簿（先出方案，2026-09-27）。**按会话 id 记，`stop` 不摘**：它落盘在会话目录，
   * 续接时 `start` 重新读一遍；摘了的话停止与重开之间那一拍，已批准文件的保护就不在了。
   */
  private readonly 方案簿们 = new Map<SessionId, { 簿: 方案簿; workspace: string; sessionDir: string; 远端?: RemoteLike | undefined }>()
  private 方案簿(sessionId: SessionId): 方案簿 {
    return this.方案簿们.get(sessionId)?.簿 ?? new 方案簿(undefined)
  }
  /**
   * 这一轮开头已批准方案的样子（2026-09-28，D3 定案：**人改的不恢复，agent 这一轮改的恢复**）。
   * 这一轮第一件工具执行前拍（方案期门里，和 `开轮` 同一个时机），一轮收尾时核对、用完就扔。
   * 指纹分不出是谁改的，**时间分得出**：两轮之间只有人在动；一轮里面动了的，算 agent 的。
   */
  /**
   * 这段会话**我们自己装了**的方案期工具名（`propose_plan` / `inspect_data` / `ls` / `grep` / `find` 里有的那几个）。
   * **不能用 `getToolDefinition(名)` 判「装了没有」**：pi 的注册表里内置工具一直都在（`noTools: "builtin"` 只是不启用它们），
   * 远端会话没装我们的 `ls`，一查却查得到 pi 自己那件——启用了就是一件没套任何门、在本机跑的 `ls`（2026-09-28 测出来的）。
   */
  private readonly 方案工具名们 = new Map<SessionId, string[]>()
  private readonly 轮基线 = new Map<SessionId, Promise<(已批准存档 & { planId: string })[]>>()
  /**
   * 正在答方案的会话（2026-09-28 审查）：`answerPlan` 里有好几道 await，双击批准、批准与「不做了」挤在一起时，
   * 第二次会在第一次写完文件、改簿之前通过 `可答`——留下一份簿里不认的 `…-2.md` 和存档。一段会话同时只答一次。
   */
  private readonly 方案答中 = new Set<SessionId>()
  /** 每段本地会话一份影子存档（2026-09-27）。远端与关掉的不在表里——表里没有 = 「没有存档」 */
  private readonly 存档们 = new Map<SessionId, 检查点存档>()
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
    /**
     * pi 的 grep / find 缺 rg / fd 时会悄悄去 GitHub 下（2026-09-28）。**建运行时的地方就是闸口**：
     * Electron、CLI、测试、冒烟脚本都经过这里；之后派出的子 agent 进程继承这个 env。见 `no-tool-download.ts`
     */
    关掉pi自己下载()
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
   * ## 走完整的那条路径，不走「模型读的那一份」（2026-09-27）
   *
   * 此前用 `buildSessionContext().messages`——那是给模型的：压缩过的会话里以一条摘要开头、压缩前的来往全不在，
   * 而这里又不认 `compactionSummary` 这个 role，于是**续接之后前面几十轮凭空没了，没有任何记号**。
   * 现在用 `getBranch()`（从根到当前叶子的全部条目）：消息照旧还原，`compaction` 条目还原成一条压缩标记，落在它发生的位置。
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
    // 翻法在 `history.ts`（2026-09-27 搬出去）：子 agent 的会话文件读回、全文搜索用同一份
    const 条 = 还原历史(s.sessionManager.getBranch())
    /**
     * 先出方案（2026-09-27）：簿里记着的 `propose_plan` 调用**原位**换成卡片（状态取簿里的，含「你改过」——先核对一遍）；
     * 簿里没有的（簿读坏了、老记录）照旧当工具行，不编一个状态。一换一，条数不变。
     */
    const 簿 = this.方案簿(sessionId)
    if (!条.some((x) => x.kind === "tool" && x.name === 出方案工具名)) return 条
    await this.刷新文件改过(sessionId, false).catch(() => {})
    // 换法在 `history.ts`（2026-09-28）：全文搜索读旧记录时用同一个，搜到的 id / 第几处才与点开的一致
    return 换上方案卡(条, (id) => 簿.找(id))
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
      /**
       * 先出方案（2026-09-28）：方案期整件拒 bash，看目录、搜文件只剩这三件——参数是类型化的，`rg` / `fd` 用 `--` 隔开、不过 shell。
       * 走同一条授权 / 溯源包装。**默认停用、方案期才启用**（`按标记设方案工具`）：出了方案期模型照旧用 bash，
       * 不多三件它没用过的工具去改变它平时的习惯。
       *
       * **远端会话不装**：pi 的 `grep` 只能在本机跑 `rg`（`GrepOperations` 管不到搜索本身）、`find` 要本机的 `fd`，
       * 装上就是在本机的同名路径上搜——静默错位。远端的方案期因此只有 `read` 与 `inspect_data`（spec §0 2026-09-28 那条注）。
       */
      // grep / find 没有 rg / fd 时不让 pi 自己去 GitHub 下（2026-09-28，见 `no-tool-download.ts`）
      ...(remote ? [] : [createLsToolDefinition(cwd), 不自己下载(createGrepToolDefinition(cwd), "rg"), 不自己下载(createFindToolDefinition(cwd), "fd")]),
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
  /** 每段会话一份「接着问子 agent」（2026-09-27）：与 `subagent` 工具同一份 childOf / context，建会话时一起装 */
  private readonly 子agent续问 = new Map<SessionId, ReturnType<typeof createSubagentFollowUp>>()
  /** 正在答的那几轮：关会话时整组杀（中止信号 → 执行器 `杀掉后代`，与主 agent 派的那一轮同一条收尾） */
  private readonly 续问中 = new Map<SessionId, Set<{ c: AbortController; toolCallId: string; index: number }>>()

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
    /**
     * `read_main_session`（2026-09-24，侧边对话）：**每段都装、默认停用**，挂进坞才启用（`setSideTool`）。
     * 只在建会话时装得上（pi 的 `customTools`），所以不能「挂进坞时再装」——那样已有的会话得重建。
     * 同属「外部」：两条 return 都经过 `观察过的外部`。
     */
    const 侧边工具 = this.opts.读主对话
      ? [createReadMainSessionTool({ 对话: spec.sessionId, 读: this.opts.读主对话 })]
      : []
    const 外部 = [...内核工具, ...视觉工具, ...侧边工具, ...office工具组, ...browser工具组, ...memory工具组, ...mcp工具]
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

    const 子agent选项: Parameters<typeof createSubagentTool>[0] = {
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
        // 每个子任务一个 agentDir，**关在这个会话的目录里**（不变式 #11）。2026-09-27 起实际用的是下面按调用分的 `运行目录`
        agentDirOf: (i) => join(spec.sessionDir, "subagents", String(i)),
        ...(子进程凭证 ? { credentials: 子进程凭证 } : {}),
      },
      // 按调用分（2026-09-27，spec §1.1）：`<会话目录>/subagents/<toolCallId>/<序号>/`——meta.json、会话文件都在里面，
      // 重开后补 chip 组（后端 `补子agent组`）与接着问都按这个找
      运行目录: (toolCallId: string, i: number) => 子运行目录(spec.sessionDir, toolCallId, i),
    }
    const tool = createSubagentTool(子agent选项)
    // 接着问（2026-09-27）：同一份选项——同一个模型、凭证、运行目录；答复不回主 agent，只进那段子转录
    this.子agent续问.set(spec.sessionId, createSubagentFollowUp(子agent选项))

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
    /**
     * 方案簿（先出方案，2026-09-27）：**建工具之前**读好——方案期门在 execute 时查它，`history()` 靠它还原卡片。
     * 读坏了不拦会话，出声。
     */
    const 簿 = new 方案簿(join(spec.sessionDir, 方案簿文件名))
    this.方案簿们.set(spec.sessionId, { 簿, workspace: spec.workspace, sessionDir: spec.sessionDir, 远端: spec.remote?.executor })
    if (簿.读坏了) this.emit({ kind: "notice", sessionId: spec.sessionId, text: 簿.读坏了 })
    const 原工具 = this.toolsFor(
      spec,
      native,
      mcp工具,
      // **缺失不等于不收**：目录没写 `input` 时当它收图，宁可少给一个工具
      // 也不给收图的模型塞一个绕路的（`writeWithImages` 的「明确不收」同一口径）
      !(Array.isArray(model.input) && !model.input.includes("image")),
      子进程凭证,
    )
    /**
     * **回退这一轮：每一件工具执行前，先等这一句的「开头」拍完**（2026-09-27，spec §4.1）。
     * 包在 `toolsFor()` 的返回值外面而不是它里面那两条 return 上——内置、内核、MCP、插件、`subagent`、团队一件不漏，
     * 也不必记得「两条 return 都要带上」。同一句后面的工具不再拍（`开轮` 自己判重）；并行的几件排在存档那条链上，等同一张。
     * `toolsFor()` 回 undefined（既无授权门也关了溯源）时 pi 走自己的内置工具、套不上——那种装配只在测试里有，照实不拍。
     */
    const 存档开 = !spec.remote && this.opts.checkpoints !== false
    const customTools = 存档开 && 原工具 ? 原工具.map((d) => this.套上存档(spec.sessionId, d)) : 原工具

    /**
     * **先出方案（2026-09-27，spec §4.1）：交给 pi 的每一件工具都再套一层方案期门，套在最外面、先判。**
     *
     * 顺序是 `方案期门 → 开轮（回退存档）→ 权限门 → 溯源 → 工具`：被方案期拒的那次**什么都没发生**——
     * 不拍存档、不问权限、不记溯源（`tests/runtime/plan-mode.test.ts`「门的顺序」盯着）。
     * 两件方案期工具也在这里装：`propose_plan` 每段都装；`inspect_data` 与 `run_code` 同一个条件（有内核、远端要真接了远端）。
     * 它们建会话时就得在（pi 的 `customTools` 只在建会话时装），默认停用、方案期才启用（`按标记设方案工具`）。
     * 设计契约扫描盯着：`customTools` 只能是 `方案期包过的` 这一份——换回没包的，门就只剩提示词了。
     */
    const 方案工具 = [
      createProposePlanTool({ 交: (toolCallId, p) => this.收方案(spec.sessionId, toolCallId, p) }),
      ...(this.opts.kernels && (!spec.remote || this.opts.kernels.能起远端())
        ? [createInspectDataTool({ 对话: spec.sessionId, 内核: this.opts.kernels })]
        : []),
    ]
    const 方案期包过的 = [...(customTools ?? []), ...方案工具].map((d) => this.套方案期门(d as Record<string, unknown>, spec))
    this.方案工具名们.set(
      spec.sessionId,
      方案期工具.filter((n) => 方案期包过的.some((d) => d.name === n)),
    )

    /**
     * **这段对话的记录住在它自己的目录里**（会话续接，2026-08-11）。
     *
     * 不用 pi 的默认位置（那是按 cwd 编码出来的、多个会话共用一个目录），
     * 而是每个会话一个——于是「接着上一次聊」就是
     * **「把这个目录里最近那段读回来」**，不必在一堆会话里猜是哪一段。
     *
     * 续接读哪份见 `pi-resume.ts`（不走 pi 的 `continueRecent`：它按 cwd 过滤，搬过家的对话会续不上）。
     * 目录为空时新建一段，所以它对
     * 「记录丢了」这种情况是安全的：**退化成一段新对话，而不是报错**。
     * 代价是那时上下文真的没了——这一点由界面说清楚，不在这里假装。
     */
    const 记录目录 = join(agentDir, "sessions")
    const sessionManager = spec.resume
      ? 续接或新建(spec.workspace, 记录目录)
      : SessionManager.create(spec.workspace, 记录目录)
    if (存档开) {
      const 存档 = new 检查点存档(spec.workspace, join(spec.sessionDir, "checkpoints"), {
        喊: (话) => this.emit({ kind: "notice", sessionId: spec.sessionId, text: 话 }),
      })
      // 续上的旧会话：此刻之前那几句「在开始存档之前」（spec §0.7）。新会话是 null（一句都还没有）。
      // 存档目录早就在（上次开着存档）时 `记起点` 不改它——那几句照样退得回
      存档.记起点(sessionManager.getLeafId())
      this.存档们.set(spec.sessionId, 存档)
    }

    /**
     * **直接告诉它它现在跑在哪个模型上，并且这句话跟着换模型更新**（2026-08-12）。
     *
     * 前两次我做的都是绕：先劝它「旧快照过期了」（压不住一份长得像证据的
     * 命令输出），再把 `PI_*` 环境变量关掉——**它于是失去唯一的事实依据，
     * 开始编**：作者收到「我是 pi，基于 Anthropic 的 Claude 模型」，
     * 一个字都不真。**拿掉一份事实，就必须补上一份。**
     *
     * 这句补的是真的，而且**必须是活的**。2026-09-28 作者撞的：flash 下问答 flash，同一段换到 v4-pro 再问还答 flash——
     * 那一轮确实是 v4-pro 答的，是这句没跟着变。`appendSystemPromptOverride` pi 只在 `resourceLoader.reload()` 里调一次、
     * 存成定稿字符串；我们此前在闭包里改 `当前模型`，**再没人去读它**（注释却写着「每一轮都是当下的答案」）。
     * 现在这句不进 override，挂在 `getAppendSystemPrompt()` 上现算；换模型时 `设当前模型` 再让 pi 重建一次
     * （`setActiveToolsByName`，pi 文档：*Also rebuilds the system prompt*）。pi 0.86 按段比对系统提示词，
     * 下一轮请求自己会补一条只含这一段的系统消息。
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
       * **pi 扩展一律不加载**（2026-09-28 审查，安全）：否则 `<工作区>/.pi/extensions` 与 `<会话目录>/pi/extensions` 里的代码
       * 建会话时被原样 import——它注册的工具不经过方案期门与权限门，还能 `setActiveTools` 启用 pi 没套门的内置工具。
       * 我们自己的工具全走 `customTools`，一件扩展都不用（子 agent 那边 `src/subagent/child.ts` 同一条）。
       * 设计契约里有扫描：每个 `DefaultResourceLoader(` / `createAgentSession(` 都得带它。
       */
      noExtensions: true,
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
      ],
    })
    await resourceLoader.reload()
    // 「你现在是哪个模型」那句现算，不进 reload 时定稿的那份（见上面 `当前模型` 那段）
    const 定稿补充 = resourceLoader.getAppendSystemPrompt.bind(resourceLoader)
    resourceLoader.getAppendSystemPrompt = () => [
      ...定稿补充(),
      `You are currently running on the model "${当前模型}". ` +
        `If the user asks which model you are, answer with exactly this. ` +
        `Do not guess from environment variables or from earlier turns — ` +
        `the model can be switched mid-conversation and this line is always current.`,
    ]
    /**
     * 压缩覆盖**必须在 `resourceLoader.reload()` 之后**（2026-09-27 实测）：那一步里 pi 调 `settingsManager.reload()`，
     * 从磁盘重新合并全局与项目设置，此前 `applyOverrides` 的东西一并冲掉——放在 `SettingsManager.create` 之后等于没设。
     * 以后谁接 pi 的 `session.reload()`（它也调 `settingsManager.reload()`），之后要再设一次。
     */
    if (this.opts.compaction) settingsManager.applyOverrides({ compaction: { ...this.opts.compaction } })

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
      noTools: "builtin" as const,
      customTools: 方案期包过的 as never,
    })

    /**
     * 默认停用：只有挂进坞的那段才启用（`setSideTool`）。启动前就配好对的（`侧边工具开` 里有）直接开着。
     * **按标记明着设一次**，开与关都不靠 pi 的缺省（它建会话时把 `customTools` 全部启用，那是它的事，不是我们的约定）。
     *
     * 注意：pi 的 `session.reload()`（`includeAllExtensionTools: true`）与 `navigateTree`（`_restoreToolsFromTranscript`）
     * 都会重建工具集——以后谁接这两条，之后必须按 `侧边工具开` 再设一次。
     */
    this.按标记设侧边工具(session, this.侧边工具开.has(spec.sessionId))
    // 方案期那几件：与侧边工具同一个做法，按簿里记的阶段明着设一次（续接回来的方案期也在这里恢复）
    this.按标记设方案工具(spec.sessionId, session, 簿.阶段 === "planning")

    const unsubscribe = session.subscribe((raw) => this.translate(spec.sessionId, raw as PiEvent))

    const pid = this.nextPid++
    this.sessions.set(spec.sessionId, {
      session,
      sessionManager,
      // 换模型时改它，并让 pi 重建系统提示词——只改变量没人读（2026-09-28 的 bug，见上面 `当前模型` 那段）
      设当前模型: (v: string) => {
        当前模型 = v
        session.setActiveToolsByName(session.getActiveToolNames())
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
        // 正在答的接着问整组杀（2026-09-27）：会话都关了，旁边那一问没人看了，别让它继续烧钱
        for (const x of this.续问中.get(spec.sessionId) ?? []) x.c.abort()
        this.续问中.delete(spec.sessionId)
        this.子agent续问.delete(spec.sessionId)
      },
      pid,
      pending: undefined,
      inFlight: 0,
      lastUsage: undefined,
      usageIndexReported: undefined,
      usageTsReported: undefined,
      压缩待出声: false,
      sessionDir: spec.sessionDir,
      stuck: new StuckGuard(),
      待发: [],
      pi待发: 0,
      清队中: false,
      中止中: 0,
      停止代: 0,
      重排中: false,
      调整链: undefined,
      回退中: false,
      转述中: 0,
      回退: undefined,
    })
    /**
     * **续接回来的老回复已经记过账了**（2026-09-27，Task 3 审查抓的）：判重标记从记录里最后那条真回复起步。
     * 不起步的话续接后的第一条事件就把它当成新用量再报一次——`run-recorder.ts` 对 `turn_usage` 是累加的，账本重复计。
     */
    const 已记过 = this.latestUsage(spec.sessionId)
    const 本段 = this.sessions.get(spec.sessionId)!
    if (已记过) {
      本段.usageIndexReported = 已记过.index
      if (已记过.ts !== undefined) 本段.usageTsReported = 已记过.ts
      本段.lastUsage = 已记过.usage
    }
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
    /**
     * 先出方案（2026-09-27）：**装了 `propose_plan` 就有这一条**（每段 native 都装）。输入卡那颗开关读它、写它——
     * 与权限那颗走 `dawn.permission` 同一个做法，不另开协议操作。category `plan`：底部那颗通用菜单不收它（`views.tsx` 的过滤单）。
     */
    if (s.session.getToolDefinition(出方案工具名)) {
      开关.push({
        id: "dawn.plan",
        name: "生成方案",
        description: "开着时只看不改：先交分析方案，你批了再动手",
        category: "plan",
        kind: "boolean",
        current: this.方案簿(sessionId).阶段 === "planning" ? "1" : "",
        options: [],
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
    } else if (configId === "dawn.plan") {
      if (value !== "1" && value !== "") throw new Error(`生成方案只收 "1" 或 ""，收到的是：${value}`)
      this.设方案期(sessionId, value === "1")
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
  ): { index: number; ts?: number; usage: { input?: number; output?: number; cacheRead?: number } } | undefined {
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
      const ts = msgs[i]?.["timestamp"]
      return { index: i, ...(typeof ts === "number" ? { ts } : {}), usage: u }
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
    if (!s) return
    /**
     * **同一条回复不报第二次**（2026-09-27 改）。有时间戳按时间戳认：pi 压缩时把 `messages` 换成「摘要 + 最近几条」，
     * 下标全变了，只按下标认的话最后那条老回复会被当成新的再报一次——`run-recorder.ts` 对 `turn_usage` 是累加的，账本就重复计了。
     * 没有时间戳（老记录、测试替身）才退回按下标。
     */
    const 报过了 =
      latest.ts !== undefined && s.usageTsReported !== undefined
        ? latest.ts <= s.usageTsReported
        : s.usageIndexReported === latest.index
    if (报过了) return
    s.usageIndexReported = latest.index
    if (latest.ts !== undefined) s.usageTsReported = latest.ts
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

    if (e.type === "queue_update") {
      // 只看排队单：插队（steering）2026-09-25 起我们不再用
      this.对账待发(sessionId, e.followUp?.length ?? 0)
      return
    }

    /**
     * **pi 压缩上下文要出声**（2026-09-27，spec §1 a）。建会话用的是 `SettingsManager.create(…)`、没有任何覆盖，
     * pi 的默认 `compaction.enabled` 是 true——它一直在自己压，而这两条此前落进下面的 `default: return`，转录里一个字都没有。
     * 手动（`compact()`）与自动（过线、超上限）走同一对事件；后端把它们收成转录里的一条 `compaction` 项。
     * **start 一到就发**（作者 2026-09-27：「压缩的时候，最起码要说一下，要压缩上下文了」）——不等压完。
     */
    if (e.type === "compaction_start") {
      this.emit({ kind: "compaction_start", sessionId, reason: 认原因(e.reason) })
      return
    }
    if (e.type === "compaction_end") {
      const s = this.sessions.get(sessionId)
      if (s) s.压缩待出声 = false
      this.emit({ kind: "compaction_end", sessionId, ...压缩收尾字段(e) })
      return
    }

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
    /**
     * **中止时那一声不算**（审查 09-25 M-1）：bash 被停下之后 pi 的循环还会拿着已中止的信号再调一次模型，
     * pi-ai 的 `lazyStream` 在建流时就失败、写死 `stopReason: "error"`——于是每按一次停止 / 调整方向，
     * 转录里就多一条「模型调用失败：This operation was aborted」。人是故意停的，那不是失败。
     */
    if (e.type === "message_end" && e.message?.stopReason === "error" && !((this.sessions.get(sessionId)?.中止中 ?? 0) > 0)) {
      const 原因 = e.message.errorMessage?.trim()
      this.emit({
        kind: "notice",
        sessionId,
        text: 原因 ? `模型调用失败：${原因}` : "模型调用失败，但对方没有给出原因",
        failed: true,
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
          /**
           * **两处任一说失败就是失败。** 顶层是 pi 的判定（它自带的工具抛异常时只有这里是 true）；
           * 结果对象上的是我们自己的工具写的（远端 bash、权限拒绝、硬拒、建队失败）——那时 pi 的顶层是**明确的 false**。
           * 第一版写成 `??`，false 不是空值、不往后看，那四类失败全变回「成功」（全套 e2e 红了 4 条才抓到）。
           */
          isError: Boolean(e.isError || e.result?.isError),
          text: out.text,
          truncated: out.truncated,
          bytes: out.bytes,
          ...(out.fullOutputPath ? { fullOutputPath: out.fullOutputPath } : {}),
          // 停止 / 调整方向期间结束的：它是被停下的，不是自己做完或自己出错（2026-09-25）
          ...((this.sessions.get(sessionId)?.中止中 ?? 0) > 0 ? { interrupted: true as const } : {}),
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
  write(sessionId: SessionId, data: string, behavior?: 送法, queueId?: string): void {
    this.送一轮(sessionId, data, undefined, behavior, queueId)
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
    queueId?: string,
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
     * 那就在对话里留一句话，然后**照常把这一轮发出去**。（判定与那句话在 `转述端点`。）
     *
     * 这个方法是同步签名（`void`），转述是异步的——所以走「先收下、后送出」：
     * pi 的 `prompt()` 本来就允许晚一拍。失败经 notice 出声，不静默吞。
     */
    // 回退期间当场拒：下面转述那条路先报「送到了」、几秒后才进 `送一轮`——那时再拒，人那句已经进了转录
    if (s) this.不许在回退(s)
    const 端点 = this.转述端点(sessionId, images)
    if (!端点) {
      this.送一轮(sessionId, data, images, behavior, queueId)
      return
    }
    /**
     * **转述要几秒，这几秒里这句话不能凭空消失**（审查 09-24 #3）。
     * 忙着：先进镜像、上待发条（标着「转述」），转述完还在单上才交给 pi——被撤回或被停止拿走了就不发。
     * 不忙：人那句话现在就进转录（送到了、开新一轮），转述完再开跑。
     */
    const s忙 = (s?.inFlight ?? 0) > 0
    const 条: 待发条目 | undefined = s && s忙
      ? { id: queueId, 文: data, 图: images, 在: "转述" }
      : undefined
    if (条) {
      s!.待发.push(条)
      if (queueId) this.发待发单(sessionId)
    } else if (queueId) {
      this.emit({ kind: "queue_delivered", sessionId, id: queueId, newTurn: true })
    }
    const 发 = (文: string) => {
      if (!条) return void this.送一轮(sessionId, 文, images, behavior)
      if (!this.摘条(s!, 条)) return
      if (条.id) this.发待发单(sessionId)
      this.送一轮(sessionId, 文, images, "followUp", 条.id)
    }
    void this.转述(sessionId, 端点, data, images).then((文) => {
      /**
       * 转述期间会话被关了：`送一轮` 抛「未启动」。这是 `void` 的链——不接住就是未处理的 rejection、
       * 这句也无声无息没了（审查 09-25 M-2）。忙着那条还在待发单上 → `queue_failed`；不忙那条已经报过「送到」→ 就地出声。
       */
      try {
        发(文)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (条?.id) this.emit({ kind: "queue_failed", sessionId, id: 条.id, message: msg })
        else this.emit({ kind: "notice", sessionId, text: `这句没能送出去（${msg}）：${data}` })
      }
    })
  }

  /**
   * 这几张图要不要先转述（从 `writeWithImages` 拆出来，调整方向也用，2026-09-25）。
   * 模型收图 → 不用；模型明确不收、没配视觉 → 当场说一句（图照带，pi 会丢）、不用；明确不收、配了视觉 → 返回端点。
   */
  private 转述端点(sessionId: SessionId, images: readonly ImageAttachment[]): import("./vision.js").视觉端点 | undefined {
    const model = this.sessions.get(sessionId)?.session.model
    const 明确不收 = Array.isArray(model?.input) && !model.input.includes("image")
    if (!明确不收) return undefined
    /**
     * **视觉服务的缝一：贴图转述**（2026-08-20，做法 A；设计定案见
     * `specs/2026-08-20-视觉服务-design.md`）。
     *
     * 视觉可用 → 先把图交给视觉端点要一份描述，把描述并进这一轮文字发出去；
     * 没配 → 上面那句原话照说；**调用失败 → 说清原因，这一轮照发**
     * （作者 2026-08-13 定过：对话是要有的）。
     */
    const 端点 = this.opts.vision?.()
    if (!端点) {
      this.emit({
        kind: "notice",
        sessionId,
        text: `模型 ${model.id} 的目录里没有声明支持图片，这 ${images.length} 张可能不会被它看到。`,
      })
    }
    return 端点
  }

  /**
   * 交给视觉端点要一份描述，并进文字返回。**永不 reject**：失败就出声、返回原文（这一轮照发）。
   * 这个过程是异步的（几秒）——调用方要么「先收下、后送出」（`writeWithImages`），要么等它（调整方向）。
   */
  private async 转述(
    sessionId: SessionId,
    端点: import("./vision.js").视觉端点,
    data: string,
    images: readonly ImageAttachment[],
  ): Promise<string> {
    const s = this.sessions.get(sessionId)
    const 模型 = s?.session.model?.id ?? "当前模型"
    if (s) s.转述中 += 1
    try {
      const 描述 = await 描述图片(端点, images)
      this.emit({
        kind: "notice",
        sessionId,
        text: `模型 ${模型} 收不了图，这 ${images.length} 张已由 ${端点.model} 转述给它。`,
      })
      // **图仍然带着**：转录里人要看得见原图；pi 那边不收就丢，无所谓
      return `${data}

[以下是随消息附上的 ${images.length} 张图片，由视觉模型 ${端点.model} 转述]
${描述}`
    } catch (e: unknown) {
      this.emit({
        kind: "notice",
        sessionId,
        text: `视觉转述失败（${e instanceof Error ? e.message : String(e)}），这一轮按原样发出，模型 ${模型} 可能看不到那 ${images.length} 张图。`,
      })
      return data
    } finally {
      if (s) s.转述中 -= 1
    }
  }

  private 送一轮(
    sessionId: SessionId,
    data: string,
    images?: readonly ImageAttachment[],
    behavior?: 送法,
    /** 有它才进待发单（2026-09-23）：后端据此把这句话的转录推迟到真送到的那一刻 */
    queueId?: string,
  ): Promise<void> | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    this.不许在回退(s)
    const 图 =
      images && images.length > 0
        ? images.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType }))
        : undefined

    /**
     * **上一轮还在跑：交给 pi 排队**（2026-08-15 作者要的；2026-09-25 只剩排队）。
     *
     * pi 原生的 `followUp`：等这一轮再没有工具调用了才送。**所以我们不自己造队列**——那是「学会了，自己写一个」。
     * 想马上改做走 `redirect()`（停掉这一步、这句起新一轮）。
     *
     * **不能走下面那套收尾。** 排队时 `prompt()` 收下就返回，
     * 而下面 `.finally` 里发的是 `turn_end` + `cost` + `idle`——
     * 那会让界面以为这一轮已经完了：等待记号消失、停止按钮变回发送，
     * 而模型其实还在跑。所以这里**不碰 `inFlight`、不挂 `pending`**，
     * 只把失败说出来。
     */
    if (s.inFlight > 0) {
      /**
       * **我们以为在跑、pi 说没在跑**（审查 09-24 #5）：pi 看的是它自己的 `isStreaming`，
       * 它在 `prompt()` 开头要先过几道 await 才立起来、收尾时又比我们的 `.finally` 先放下。
       * 落在这两条缝里的话 pi 会当成新的一轮直接跑——不进单子、对账永远等不到它。
       * 那就先挂在镜像上（未进 pi），等这一轮收尾再按新一轮送。
       */
      if (!s.session.isStreaming) {
        const 条: 待发条目 = { id: queueId, 文: data, 图: images, 在: "缝" }
        s.待发.push(条)
        if (queueId) this.发待发单(sessionId)
        void (s.pending ?? Promise.resolve()).then(() => {
          if (!this.摘条(s, 条)) return // 撤回或停止已经把它拿走了
          if (条.id) this.发待发单(sessionId)
          /**
           * 收尾前会话被关了（`stop()` 不清镜像）：`送一轮` 会抛「未启动」——这里是 `void` 的链，
           * 不接住就是一个未处理的 rejection、这句也无声无息没了。调整方向之后重排的几条都走这条缝（2026-09-25）。
           */
          try {
            this.送一轮(sessionId, 条.文, 条.图, "followUp", 条.id)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (条.id) this.emit({ kind: "queue_failed", sessionId, id: 条.id, message: msg })
            else this.emit({ kind: "notice", sessionId, text: `这句没能送出去（${msg}）：${条.文}` })
          }
        })
        return
      }
      /**
       * **只有图、没有字的一条要补一句字**（审查 09-24 #2）：pi 在送到时按文字去单子里摘，
       * 文字为空它就不摘——那条永远挂在它的单子上，此后每一次数数都差一。
       */
      const 文 = data.trim() || !图 ? data : "（见附图）"
      const 条: 待发条目 = { id: queueId, 文: data, 图: images, 在: "pi" }
      // **不带 id 的也进镜像**（飞书 / 微信 / 定时的写）：pi 的单子里有它，镜像里就得有它
      s.待发.push(条)
      if (queueId) this.发待发单(sessionId)
      void s.session
        .prompt(文, { ...(图 ? { images: 图 } : {}), streamingBehavior: "followUp" })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          this.emit({ kind: "output", sessionId, data: `\n[native runtime 错误] ${msg}\n` })
          // 没排进去：从镜像拿掉并出声，**不许让它在待发单上挂一辈子**
          if (this.摘条(s, 条) && 条.id) {
            this.emit({ kind: "queue_failed", sessionId, id: 条.id, message: msg })
            this.发待发单(sessionId)
          }
        })
      return
    }
    /**
     * **以为在忙、其实刚跑完**（人按下时还在跑，到这儿那一轮收了尾；或撤回重送时已经空闲）：
     * 它就是新一轮的开头。先报「送到了」再开跑——转录里人那句话要排在回复前面。
     */
    if (queueId) this.emit({ kind: "queue_delivered", sessionId, id: queueId, newTurn: true })
    // 新的一轮开始：上一轮的重复不该算到这一轮头上
    s.stuck.reset()
    s.inFlight += 1
    /**
     * **起跑**：pi 真立起 `isStreaming` 的那一刻（审查 09-25 I-1）。返回给调用方——调整方向要等它，
     * 再把其余几条交给 pi：早一步交，它们会落进 #5 那条缝、这一整轮都挂在镜像上（调整不了、还会抢在下一句前面）。
     *
     * 坐在 pi 的 `PromptOptions.preflightResult`（`agent-session.d.ts`）：`prompt()` 过完输入处理、查 key、查压缩那几道 await，
     * 调 `preflightResult(true)` 之后**同步**进 `_runAgentPrompt` 立起 `_isAgentRunActive`——所以我们的回调一拍之后看到的一定是「在跑」。
     * 预检失败（`false`）或 `prompt()` 直接 reject 也算「起跑结束」（`.finally` 兜底），调用方不会一直等。
     */
    let 起跑了!: () => void
    const 起跑 = new Promise<void>((r) => (起跑了 = r))
    /** 一轮的同步收尾（`inFlight`、`turn_end`、`cost`、存档收尾、`idle`）。先出方案要核对时排在核对之后 */
    const 收尾 = (): void => {
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
      // 回退这一轮：这一轮收尾拍一张结尾（只 stat）。不等它——`开轮` / `回退` 排在同一条链上，自然在它之后（2026-09-27）
      void this.存档们.get(sessionId)?.收尾()
      // **一整轮真正结束。** 这是唯一可靠的边界——见 AgentEvent.idle 的说明
      this.emit({ kind: "idle", sessionId })
    }
    // 记下这一轮，供 `waitForIdle` 等待。catch 就地挂上，所以它永不 reject
    const run = s.session
      .prompt(data, { ...(图 ? { images: 图 } : {}), preflightResult: () => 起跑了() })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        /**
         * **这一轮没做成**（2026-09-28 审查）：走带 `failed` 的 notice，不走 `output`——
         * `output` 会被当成模型的回复（桌面通知报成「做完了」、正文是这句报错），还会把这一轮先前记下的失败当「往前走了」清掉。
         * 话照旧是那句，只是换成系统提示那一格（它本来就不是模型说的）。
         */
        this.emit({ kind: "notice", sessionId, text: `[native runtime 错误] ${msg}`, failed: true })
      })
      .finally(() => {
        起跑了()
        /**
         * 先出方案（2026-09-28，D3）：这一轮动过已批准的方案就恢复、说出来。**在 `inFlight` 放下之前做完**——
         * 做完之前下一句走排队那条缝（`s.pending` 等的就是这里）：新的一轮若抢在恢复之前拍了底，会把 agent 改坏的那份当成底。
         * 没有要核对的（绝大多数会话）照旧同步收尾，时序一丝不变。
         */
        const 核 = this.收轮核对(sessionId)
        return 核 ? 核.then(收尾) : 收尾()
      })
    // 串起来而不是覆盖：连发两轮时，等待必须覆盖两轮，不能只等最后一轮
    s.pending = s.pending ? s.pending.then(() => run) : run
    void s.pending
    return 起跑
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
    // 自动中止**算出错**（2026-09-28 定案）：不是人按的停止，是它绕圈被我们停下的——桌面通知报「出错了」，正文就是这句原因
    this.emit({ kind: "notice", sessionId, text: reason, failed: true })
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
   * `usedTokens` **只从 pi 的 `getContextUsage()` 取**（2026-09-27 改）：最近一次真回复的 `totalTokens`，加上那之后新加的
   * 内容按字数估的一截（有这一截就标 `estimated`）。与 pi 判自动压缩线用的是同一族函数——此前我们报 `input + cacheRead`，
   * 漏了上一次的输出与缓存写入，人看着 80%、pi 按 90% 压了。刚压缩过 pi 给 `tokens: null`，我们给 `afterCompaction`、不给数。
   * 还没有过回复时不给：pi 那时只数对话，系统提示词与工具说明不在里面，会少算。
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
      ...this.已用(s),
      ...(() => {
        // 自动压缩线：上限 − 留给摘要的那份（pi 的 `shouldCompact`：`contextTokens > contextWindow - reserveTokens`）
        if (!st.model?.contextWindow) return {}
        const 设 = s.session.settingsManager.getCompactionSettings(s.session.model)
        return 设.enabled ? { compactAt: Math.max(0, st.model.contextWindow - 设.reserveTokens) } : {}
      })(),
      bytes: {
        system: size(st.systemPrompt),
        tools: size(st.tools),
        history: size(st.messages),
      },
    }
  }

  /**
   * 手动压缩（2026-09-27，spec §2.2）。坐在 pi 的 `AgentSession.compact(customInstructions)`。
   *
   * - **这一轮还在跑就拒**（spec D8）：pi 的 `compact()` 会先 `abort()` 当前这一轮——一次点击做了两件事，第二件人没要求。
   *   pi 正在自己压（`isCompacting`）同样拒。
   * - **压的期间算「在忙」**：`inFlight` 加一、`pending` 串上。这期间人发的话走「以为在跑、pi 说没在跑」那条缝（`送一轮`），
   *   压完按新一轮送——pi 在手动压缩时收到 `prompt()` 会直接抛（"Cannot submit a prompt while compaction is in progress"）。
   *   「停止」照常：pi 的 `abort()` 里有 `abortCompaction()`，那时 `compaction_end` 带 `aborted`，标记写「停下了」。
   * - **不 await**：与 `write()` 同一个契约。成败都由 `translate` 的 `compaction_end` 那一支出声；
   *   万一 pi 在发 `compaction_start` 之前就失败了（那时没有 end 可等），这里补一句，不静默。
   *   连同步抛（还没拿到 promise）也收进同一条路——不然 `inFlight` 会永远多一，这段会话从此「一直在忙」。
   */
  compact(sessionId: SessionId, instructions?: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动，无法压缩`)
    this.不许在回退(s)
    if (s.inFlight > 0 || s.转述中 > 0 || s.session.isCompacting) throw new Error("这一轮还没说完，等它做完或先停止，再压缩上下文")
    s.inFlight += 1
    s.压缩待出声 = true
    const 要求 = instructions?.trim()
    let 压: Promise<unknown>
    try {
      压 = s.session.compact(要求 || undefined)
    } catch (err) {
      压 = Promise.reject(err)
    }
    const run = 压
      .then(
        () => undefined,
        (err: unknown) => {
          if (!s.压缩待出声) return // `compaction_end` 已经说过了
          const msg = err instanceof Error ? err.message : String(err)
          this.emit({ kind: "notice", sessionId, text: `上下文没压缩成：${压缩原因人话(msg)}` })
        },
      )
      .finally(() => {
        s.压缩待出声 = false
        s.inFlight -= 1
      })
    s.pending = s.pending ? s.pending.then(() => run) : run
    void s.pending
  }

  /** 已用多少（2026-09-27）。见 `contextUsage` 的头注 */
  private 已用(s: NativeSession): Pick<ContextUsage, "usedTokens" | "estimated" | "afterCompaction"> {
    const pi = s.session.getContextUsage()
    if (pi && pi.tokens === null) return { afterCompaction: true }
    const 真 = 最后一次真回复(s.session.messages as readonly unknown[])
    if (真 === undefined) return {}
    if (!pi || pi.tokens === null) return { usedTokens: 真 }
    const 数 = Math.round(pi.tokens)
    return 数 === 真 ? { usedTokens: 数 } : { usedTokens: 数, estimated: true }
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
   * **整家都走 Anthropic 协议**的 provider（2026-09-21）。
   *
   * pi 0.86 起这条协议由 `@anthropic-ai/sdk` 自己拼 `/v1/messages`，
   * 所以地址填成 `https://x/v1` 会打到 `/v1/v1/messages`、404。设置页据此提醒。
   *
   * **只收「每个模型都走它」的那几家**（实测 anthropic / kimi-coding / minimax×2 /
   * vercel-ai-gateway）：openrouter、opencode 这类混着走的，大半模型走 OpenAI 协议，
   * 地址本来就该带 `/v1`——对它们喊一句是假警报。
   */
  async providersSpeakingAnthropic(): Promise<string[]> {
    const 协议 = new Map<string, Set<string>>()
    for (const m of (await this.runtime()).getModels()) {
      const s = 协议.get(m.provider) ?? new Set<string>()
      s.add(m.api)
      协议.set(m.provider, s)
    }
    return [...协议]
      .filter(([, s]) => s.size === 1 && s.has("anthropic-messages"))
      .map(([id]) => id)
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
    /** `temperature: null` = 不带这个参数、用服务商自己的默认（验 key 用；有的模型只收一个值，2026-09-28）；不给 = 0.3 */
    req: { system?: string; user: string; maxTokens: number; temperature?: number | null; signal?: AbortSignal },
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
        ...(req.temperature === null ? {} : { temperature: req.temperature ?? 0.3 }),
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

  /**
   * **用给定的 key 问一句，不落盘**（「测试」按钮，协议 8.7，2026-09-28）。
   *
   * 依赖坐在哪一层（CLAUDE.md 规则）：
   * - ① pi 认识的那家：`ModelRuntime.completeSimple(model, ctx, { apiKey })`——pi 的 `resolveProviderAuth` 见到 `apiKey` 覆盖就直接用它，
   *   不读、也不写凭证存储（读源码核实，`pi-ai/dist/auth/resolve.js`）。
   *   自定义端点：还没保存就不在运行时里，改用 `@earendil-works/pi-ai/compat` 的 `completeSimple`，照表单现拼一个 `Model`。
   * - ② 放弃了：自己 `fetch` 一个 `/chat/completions`——那测的是「我们以为的请求」，不是 pi 日后真发的那条
   *   （头、`anthropic-messages` 这类协议差异都会漏）；也放弃了 `setRuntimeApiKey`——它是运行时全局的，会串进正在跑的会话。
   * - ③ 不变式挂在哪：归类（401 是 key 不对、其余没能判定）不在这里，在后端 `验一次key` / `归类key错误`——与保存后那次自动验证同一处。
   */
  async 试一次key(
    目标: { provider: string; model: string; apiKey: string; baseUrl?: string; api?: string },
    req: { user: string; maxTokens: number; temperature?: number | null; signal?: AbortSignal },
  ): Promise<{ text: string; model: string }> {
    const 上下文 = { messages: [{ role: "user" as const, content: req.user, timestamp: Date.now() }] }
    const 选项 = {
      apiKey: 目标.apiKey,
      maxTokens: req.maxTokens,
      ...(req.temperature === null || req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...(req.signal ? { signal: req.signal } : {}),
    }
    const msg =
      目标.baseUrl === undefined
        ? await (await this.runtime()).completeSimple(await this.resolveModel(目标.provider, 目标.model), 上下文, 选项)
        : await 直接问(
            {
              id: 目标.model,
              name: 目标.model,
              api: (目标.api ?? "openai-completions") as never,
              provider: 目标.provider as never,
              baseUrl: 目标.baseUrl,
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128_000,
              maxTokens: 4_096,
            },
            上下文,
            选项,
          )
    if (msg.stopReason === "error") throw new Error(msg.errorMessage ?? "模型报错但没说原因")
    if (msg.stopReason === "aborted") throw Object.assign(new Error("已取消"), { name: "AbortError" })
    const text = msg.content
      .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
      .map((c) => c.text)
      .join("")
    return { text, model: `${目标.provider}/${目标.model}` }
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
    /**
     * **走 `session.sendCustomMessage`，不走 `sessionManager.appendCustomMessageEntry`**（2026-09-28）。
     * 后者只写会话文件、不进 `agent.state.messages`——模型要到重开或压缩、从文件重建上下文之后才看得到，
     * 当下这段对话里这句等于没说。前者两边都进（与「回退这一轮」的 `dawn-rewind` 同一条路）。
     * 这里一定不在流式中（上面 `inFlight` 已拦），所以它是立即追加、不触发新一轮。
     */
    try {
      await s.session.sendCustomMessage({
        customType: "dawn-model-change",
        content:
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
        display: false,
      })
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
    /**
     * **先撤待发单，再中止**（2026-09-23）。反过来的话，中止与撤单之间 pi 可能把一条送进去、
     * 又开一段；而且 pi 中止之后不再续跑，排着的那几条就永远卡在它的队列里。
     * 界面的「停止」会先走 `clearQueue` 把原文要回去；走到这里还剩的（卡死守卫的自动中止）要出声。
     */
    const s = this.sessions.get(sessionId)
    // 记一笔「按过停止」：正在停下那一步的调整方向据此让路（见 `停止代`）。同步记——在任何 await 之前
    if (s) s.停止代 += 1
    for (const id of this.clearQueue(sessionId)) {
      this.emit({ kind: "queue_failed", sessionId, id, message: "这一轮被中止了，这句还排着、没有送出去" })
    }
    if (!s) return
    // 中止期间结束的工具标「已中断」（2026-09-25）；`run_code` 收到中止信号会给内核发中断
    s.中止中 += 1
    try {
      await s.session.abort()
    } finally {
      s.中止中 -= 1
    }
  }

  /**
   * pi 报了一次待发单（`queue_update`）。**变短了才是送走了**：
   * pi 从头送、按文字摘第一条，所以从镜像头上摘掉相应条数。
   * 变长不管——镜像先进、pi 的输入处理异步后到，那一瞬 pi 比镜像短不代表送到了。
   */
  private 对账待发(sessionId: SessionId, followUp: number): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    const 少了 = s.pi待发 - followUp
    s.pi待发 = followUp
    if (s.清队中) return
    let 变了 = false
    for (let k = 0; k < 少了; k++) {
      // pi 的单子里只有交给了它的那些：还在等转述 / 等收尾的不算
      const i = s.待发.findIndex((x) => x.在 === "pi")
      if (i < 0) break
      const [送走的] = s.待发.splice(i, 1)
      if (!送走的!.id) continue // 没身份的（飞书之类）：转录早在写的时候就进了
      this.emit({ kind: "queue_delivered", sessionId, id: 送走的!.id, newTurn: false })
      变了 = true
      // 人的话进了这一轮：方案的底挪到此刻（先出方案 D3，见 `刷新轮基线`）
      void this.刷新轮基线(sessionId)
    }
    if (变了) this.发待发单(sessionId)
  }

  private 发待发单(sessionId: SessionId): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    // 镜像的先后就是 pi 送出的先后（只剩一张单子）
    if (s.重排中) return // 调整方向重排完发一次整份
    const 有身份 = s.待发.filter((x): x is 待发条目 & { id: string } => x.id !== undefined)
    this.emit({ kind: "queue", sessionId, items: 有身份.map((x) => ({ id: x.id, behavior: "followUp" as const })) })
  }

  /** 按引用摘（同一句话可能没有 id）。摘到了才返回 true——摘不到说明撤回或停止先拿走了 */
  private 摘条(s: NativeSession, 条: 待发条目): boolean {
    const i = s.待发.indexOf(条)
    if (i < 0) return false
    s.待发.splice(i, 1)
    return true
  }

  /**
   * 清掉 pi 那份，返回镜像里**交给了 pi 的**那些（原先后）；还没交给 pi 的留在镜像上——它们自己会去。
   * `清队中` 挡住这次变短被当成「送到」。
   */
  private 清空待发(s: NativeSession): 待发条目[] {
    const 原来 = s.待发.filter((x) => x.在 === "pi")
    s.待发 = s.待发.filter((x) => x.在 !== "pi")
    s.清队中 = true
    try {
      s.session.clearQueue()
    } finally {
      s.清队中 = false
    }
    s.pi待发 = 0
    return 原来
  }

  /**
   * 撤回一条（2026-09-23；2026-09-25 改插队删了，调整方向走 `redirect`）。
   *
   * pi 只有「全部清掉」，没有「动其中一条」——所以清掉之后**按原先后重送一遍**。
   * 重送走 `送一轮` 同一条路：此刻已经空闲的话，第一条开新一轮、其余排在它后面。
   */
  editQueue(sessionId: SessionId, id: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    const 它 = s.待发.find((x) => x.id === id)
    if (!它) throw new Error("这条已经不在待发单上了——多半刚好送出去了")
    // 还没交给 pi 的（等转述 / 等收尾）：就地摘，不碰 pi 的单子
    if (它.在 !== "pi") {
      this.摘条(s, 它)
      this.发待发单(sessionId)
      return
    }
    const 留下 = this.清空待发(s).filter((x) => x.id !== id)
    this.发待发单(sessionId)
    for (const x of 留下) this.送一轮(sessionId, x.文, x.图, "followUp", x.id)
  }

  /**
   * **调整方向**（2026-09-25，学自 Codex；spec `2026-09-25-调整方向-design.md` §4.2）：停掉当前这一步，按这句接着做。
   *
   * 四步按顺序做完，**不由界面串三次请求**（作者定的做法一）：
   *   ① 不忙 → 当普通一句发出去；
   *   ② `clearQueue()` 拿回 pi 单上所有待发，把这句从中去掉（Cmd/Ctrl+回车来的本来就不在单上）；
   *   ③ `abort()` 并等 pi 真停下——中止信号传到工具，`run_code` 据此给内核发中断（`tools/run-code.ts`）；
   *   ④ 这句起新的一轮；其余几条按原先后重排到它后面（id 不变，界面上那几条不闪）。
   * 先撤单、再中止，与 `abort()` 同一个理由：中止与撤单之间 pi 可能把一条送进去又开一段。
   *
   * **哪一步失败都不许丢话**：停不下来 → 这句改排在最前、出声；重排时会话没了 → 那几条的 id 交回调用方，
   * 后端据此放回输入框。返回的就是这份「没排回」。
   *
   * **一个接一个**：两次 Cmd/Ctrl+回车挨得太近时，后一次等前一次停稳再动——并发地各清一次单、各中止一次，
   * 第二次会把第一次刚重排的那几条当成「其余」再清一遍，而第一句的新一轮也会被它当成「这一步」停掉；
   * 排成一个接一个，这就是「又改了一次主意」，结果是对的。
   */
  redirect(sessionId: SessionId, 那句: 调整的那句): Promise<string[]> {
    const s = this.sessions.get(sessionId)
    if (!s) return Promise.reject(new Error(`会话 "${sessionId}" 未启动`))
    // 按下这一刻的「停止」计数：排在前一次调整方向后面等的时候按了停止，也算停止赢
    const 按下时 = s.停止代
    const 这次 = (s.调整链 ?? Promise.resolve()).then(() => this.真调整(sessionId, 那句, 按下时))
    s.调整链 = 这次.then(
      () => undefined,
      () => undefined,
    )
    return 这次
  }

  private async 真调整(sessionId: SessionId, 那句: 调整的那句, 按下时: number): Promise<string[]> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    /** 单上那条（按 id）；Cmd/Ctrl+回车来的不在单上，带着原文 */
    const 单上的 = 那句.data === undefined ? s.待发.find((x) => x.id === 那句.queueId) : undefined
    /**
     * **停止赢**（审查 09-25 I-2）。人按了调整方向、没看见动静、又按了停止：停止的 `clearQueue` 只拿得回镜像里的，
     * 这句和其余几条此刻在我们手里——不交回去，停止之后它们会自己冒出来、agent 又开始干活。所以交回 id（后端放回输入框，与普通停止一样）。
     * **先于「不在单上」查**（09-25 复审 m-B）：排在前一次后面等的时候按了停止，单上那条已被停止的 `clearQueue` 放回输入框——
     * 那时再抛「多半刚好送出去了」是错的理由。单上的交回空（停止已经交过了），Cmd/Ctrl+回车带原文来的交回它的 id。
     */
    const 停了 = () => s.停止代 !== 按下时
    if (停了()) return 那句.data === undefined ? [] : [那句.queueId]
    if (那句.data === undefined) {
      if (!单上的) throw new Error("这条已经不在待发单上了——多半刚好送出去了")
      // 等转述的那条文字还没定（转述要并进来），现在拿去起新一轮会丢掉转述。**缝里那条可以**（审查 09-25 I-1）
      if (单上的.在 === "转述") throw new Error("这句还在转述图片，稍等再调整方向")
    }
    const 这句 = {
      id: 那句.queueId as string | undefined,
      文: 单上的 ? 单上的.文 : (那句.data ?? ""),
      图: 单上的 ? 单上的.图 : 那句.images,
    }
    // ① 不忙：就是新的一句（没有其余要排，带图的照普通一句走 `writeWithImages`）
    if (s.inFlight === 0) {
      if (单上的) {
        this.摘条(s, 单上的)
        this.发待发单(sessionId)
      }
      try {
        if (!单上的 && 这句.图?.length) this.writeWithImages(sessionId, 这句.文, 这句.图, "followUp", 这句.id)
        else this.送一轮(sessionId, 这句.文, 这句.图, "followUp", 这句.id)
      } catch (e) {
        if (这句.id) return [这句.id]
        this.emit({ kind: "notice", sessionId, text: `这句没能发出去（${e instanceof Error ? e.message : String(e)}）：${这句.文}` })
      }
      return []
    }
    /**
     * 新来的带图、模型要转述（审查 09-25 M-2）：**现在就开始转述，与停下那一步同时进行**，到 ④ 等它回来再起新一轮。
     * 不能交给 `writeWithImages` 的「先收下、后送出」——那样其余第一条会先起新一轮、这句反倒排在它后面，
     * 转述期间会话关了它也只能在 `void` 的链上出声；在这里等，失败就能交回 id。`转述` 永不 reject。
     */
    const 端点 = !单上的 && 这句.图?.length ? this.转述端点(sessionId, 这句.图) : undefined
    const 转述好 = 端点 && 这句.图 ? this.转述(sessionId, 端点, 这句.文, 这句.图) : undefined
    // ② 撤单。**先不发 `queue`**：界面上的待发条这时不该闪空，重排完再发一次整份
    const 其余 = this.收回其余(s, 单上的)
    /**
     * 停之前先把方案的底挪到此刻（先出方案 D3，2026-09-28 审查）：被停下的那一轮收尾会核对它——
     * 人在这一轮里改了方案、按 Cmd/Ctrl+回车说「照我改的做」，不挪的话人改的会被当成 agent 改的恢复掉。
     */
    await this.刷新轮基线(sessionId)
    // ③ 停下这一步
    let 没停住: string | undefined
    s.中止中 += 1
    try {
      await s.session.abort()
      // 我们自己那一轮的收尾（inFlight 归零、idle 发出）挂在 `pending` 上：等它走完，④ 才是「新的一轮」
      await s.pending
    } catch (e) {
      没停住 = e instanceof Error ? e.message : String(e)
    } finally {
      s.中止中 -= 1
    }
    if (转述好) 这句.文 = await 转述好
    if (停了()) return this.交回(sessionId, [这句, ...其余])
    if (没停住 !== undefined) {
      this.emit({ kind: "notice", sessionId, text: `没能停下这一步（${没停住}），这句改为排队，排在最前` })
    }
    // ④ 这句起新的一轮（没停住就排在最前）
    let 起跑: Promise<void> | undefined
    try {
      起跑 = this.送一轮(sessionId, 这句.文, 这句.图, "followUp", 这句.id)
    } catch {
      // 会话在这期间没了：这句与其余全部交回，不许丢
      return this.交回(sessionId, [这句, ...其余])
    }
    /**
     * **等 pi 真起跑，再排其余**（审查 09-25 I-1(b)）。`prompt()` 开头有几道 await，这期间 pi 的 `isStreaming` 还是假的——
     * 这时交出去的会落进 #5 那条缝：这一整轮挂在镜像上，pi 不数它们、调整不了它们；
     * 下一次 Cmd/Ctrl+回车停下这一轮时，它们挂在旧 `pending` 上的回调还会**抢在那句前面**起新一轮。
     * 等到起跑，它们就进了 pi 真正的 followUp 单子。上一次调整方向刚起的一轮还没起跑时（M-3），
     * 这里也保证了：锁放开时那一轮已经在跑，下一次 `abort()` 停得住它。
     */
    if (起跑) await 起跑
    /**
     * 等起跑的这一拍里按了停止（09-25 复审 m-A）：停止落在 pi `prompt()` 开头那几道 await 里时，pi 的 `_isAgentRunActive` 还是假的——
     * 那次 `abort()` 什么都没停下（自动压缩那种长的 await 会被它停下，然后 prompt 照样往下走、起跑时还把中止标记复位），
     * 这句的新一轮照样跑起来了。**现在它真在跑，再停一次**，停止才算赢；其余还在我们手里，交回。
     */
    if (停了()) {
      s.中止中 += 1
      try {
        await s.session.abort()
      } catch {
        // 停不下来也要把其余交回，不许丢；卡死守卫兜底
      } finally {
        s.中止中 -= 1
      }
      return this.交回(sessionId, 其余)
    }
    const 没排回: string[] = []
    s.重排中 = true
    try {
      for (const x of 其余) {
        try {
          this.送一轮(sessionId, x.文, x.图, "followUp", x.id)
        } catch (e) {
          if (x.id) 没排回.push(x.id)
          else this.emit({ kind: "notice", sessionId, text: `这句没能重新排上（${e instanceof Error ? e.message : String(e)}）：${x.文}` })
        }
      }
    } finally {
      s.重排中 = false
    }
    this.发待发单(sessionId)
    return 没排回
  }

  /**
   * 调整方向的 ②：拿回**文字已定**的全部待发——交给 pi 的（`clearQueue()`）与缝里挂着的（就地摘，它们挂着的回调摘不到就不送了），
   * 按镜像里的原先后；去掉这句本身。等转述的留在镜像上，转述完它们自己会去（审查 09-25 I-1(a)）。
   */
  private 收回其余(s: NativeSession, 单上的: 待发条目 | undefined): 待发条目[] {
    const 其余 = s.待发.filter((x) => x.在 !== "转述" && x !== 单上的)
    for (const x of s.待发.filter((x) => x.在 === "缝")) this.摘条(s, x)
    this.清空待发(s) // 交给 pi 的：从镜像与 pi 那份一并清掉（就是上面挑出来的那些）
    if (单上的) this.摘条(s, 单上的) // 缝里的已摘过、pi 的已清过——转述的不会走到这里
    return 其余
  }

  /** 交回：有身份的返回 id（后端放回输入框）；没身份的（飞书 / 微信 / 定时）后端没有存根，就地出声（与 `clearQueue` 同一口径） */
  private 交回(sessionId: SessionId, 这些: { id: string | undefined; 文: string }[]): string[] {
    for (const x of 这些) {
      if (!x.id) this.emit({ kind: "notice", sessionId, text: `这句还排着、没有送出去：${x.文}` })
    }
    return 这些.flatMap((x) => (x.id ? [x.id] : []))
  }

  /**
   * 侧边对话的工具启停（2026-09-24）。**会话还没起也要记下**：重启后界面先配对、会话后起，
   * 起的时候按这张表决定开不开（见建会话处）。
   *
   * pi 的 `setActiveToolsByName` 当场重建系统提示词；pi 每次调模型前都重读一遍启用的工具
   * （`prepareNextTurnWithContext`），所以**从下一次调模型起生效，同一轮 run 里也是**——只有正在流式的那一次回复不受影响。
   */
  /**
   * 接着问一个跑完的子 agent（2026-09-27，spec §2.3）。**起一轮就返回**：过程与结果经 `subagent_event` 进中枢，
   * 与主 agent 派的那一轮同一条路。答复不回主 agent。「一次一句」由中枢的 `asking` 管（后端在调这里之前就标上了）。
   * 那一轮若没走到 `settled` 就抛了，这里补一条失败的 settled——不补的话那一格永远「正在答」、再也问不了。
   */
  async askSubagent(sessionId: SessionId, toolCallId: string, index: number, agent: string, text: string): Promise<void> {
    const 续 = this.子agent续问.get(sessionId)
    if (!续) throw new UserFacingError("这段对话没有装子 agent（没有子进程入口），不能接着问")
    const c = new AbortController()
    const 这一问 = { c, toolCallId, index }
    const 集 = this.续问中.get(sessionId) ?? new Set<typeof 这一问>()
    集.add(这一问)
    this.续问中.set(sessionId, 集)
    void 续(toolCallId, index, agent, text, c.signal)
      .catch((e: unknown) => {
        this.emit({
          kind: "subagent_event",
          sessionId,
          toolCallId,
          index,
          event: { kind: "settled", ok: false, followUp: true, error: e instanceof Error ? e.message : String(e) },
        })
      })
      .finally(() => 集.delete(这一问))
  }

  /**
   * 停掉正在答的那一问（2026-09-27 审查）：回退把它的 chip 撤掉了，答完也没处放、还在烧钱。
   * toolCallId 按盘上那一段比（与中枢判「同一个子转录」同一个判据）。停到了回 true
   */
  abortSubagentFollowUp(sessionId: SessionId, toolCallId: string, index: number): boolean {
    let 停了 = false
    for (const x of this.续问中.get(sessionId) ?? []) {
      if (x.index === index && 子目录段(x.toolCallId) === 子目录段(toolCallId)) {
        x.c.abort()
        停了 = true
      }
    }
    return 停了
  }

  setSideTool(sessionId: SessionId, on: boolean): void {
    if (on) this.侧边工具开.add(sessionId)
    else this.侧边工具开.delete(sessionId)
    const s = this.sessions.get(sessionId)?.session
    if (s) this.按标记设侧边工具(s, on)
  }

  /**
   * 回答一版方案（先出方案，2026-09-27，spec §4.4）。
   * **写成功才改状态**：存不下来原样抛，卡片不变、开关不动——人看到原因，还能再按一次。
   * 本机会话批准时还要在会话目录留一份存档、记指纹（D3 第二道，2026-09-28）：**存档失败 = 批准失败**，
   * 刚写的方案文件删掉（不留一份簿里不认的「已批准」文件），原样抛。远端会话没有这一道（spec §0 的限制）。
   */
  async answerPlan(sessionId: SessionId, planId: string, action: "approve" | "discard", text?: string): Promise<{ savedPath?: string }> {
    const s = this.sessions.get(sessionId)
    const 处 = this.方案簿们.get(sessionId)
    if (!s || !处) throw new Error(`会话 "${sessionId}" 未启动`)
    // 字眼以「这一版方案已经」开头：后端据它分成 conflict（与「已经批过」同一类）
    if (this.方案答中.has(sessionId)) throw new Error("这一版方案已经在处理了，稍等")
    /**
     * **在跑、正在回退时不答**（2026-09-28 交叉审查）：一轮跑着的时候批准，方案文件落在这一轮的回退存档窗口里——
     * 之后「回退文件」会把它当 agent 新建的挪进废纸篓（存档那边另有一道：`在方案目录里`）。回退途中批准，簿与分支各说各的。
     * 措辞固定：后端按「还在跑」「正在回退」分成 conflict、译成英文。
     */
    if (s.回退中) throw new UserFacingError("正在回退，等它做完")
    if (s.inFlight > 0 || s.转述中 > 0) throw new UserFacingError("agent 还在跑，这一轮做完再批方案")
    this.方案答中.add(sessionId)
    try {
      return await this.真答方案(sessionId, s, 处, planId, action, text)
    } finally {
      this.方案答中.delete(sessionId)
    }
  }

  private async 真答方案(
    sessionId: SessionId,
    s: NativeSession,
    处: { 簿: 方案簿; workspace: string; sessionDir: string; 远端?: RemoteLike | undefined },
    planId: string,
    action: "approve" | "discard",
    text: string | undefined,
  ): Promise<{ savedPath?: string }> {
    const p = 处.簿.可答(planId)
    if (action === "discard") {
      const x = 处.簿.作废(planId)
      this.设方案期(sessionId, false)
      this.emit({ kind: "plan", sessionId, plan: x })
      this.发会话开关(sessionId)
      return {}
    }
    const 正文 = (text?.trim() || p.markdown).trim()
    // 两头的空白不算改过（2026-09-28 审查）：模型交的原稿常带首尾换行，编辑框一 trim 就成了「你改过」
    const 改过 = 正文 !== p.markdown.trim()
    const 时刻 = new Date()
    const savedPath = await 写方案文件({
      workspace: 处.workspace,
      远端: 处.远端,
      名: 方案文件名(p.title, 时刻),
      正文: 方案存档正文({ title: p.title, version: p.version, 正文, 改过, 时刻, sessionId, 模型: s.实际模型 ?? "" }),
    })
    /**
     * **写下文件之后哪一步抛，都把写下的收拾掉**（2026-09-28 审查）：存档失败、簿存不下……
     * 不留一份簿里不认的「已批准」文件，也不留一份没有主人的存档。原样抛。
     */
    let 指纹: { sha256: string; 存档: string } | undefined
    try {
      if (!处.远端) 指纹 = await 存档方案({ workspace: 处.workspace, 相对: savedPath, 会话目录: 处.sessionDir, planId })
      const x = 处.簿.批准(planId, { 正文, savedPath, 时刻: 时刻.getTime(), 改过, ...(指纹 ?? {}) })
      this.设方案期(sessionId, false)
      this.emit({ kind: "plan", sessionId, plan: x })
    } catch (e) {
      await 删方案文件({ workspace: 处.workspace, 远端: 处.远端, 相对: savedPath })
      if (指纹) await rm(指纹.存档, { force: true }).catch(() => {})
      throw e
    }
    this.发会话开关(sessionId)
    return { savedPath }
  }

  /** 给一件工具套上「先拍开头」。执行时才按 id 取存档与 pi 的记录——装工具那一刻它们还没建出来 */
  private 套上存档(sessionId: SessionId, 定义: unknown): unknown {
    const d = 定义 as Record<string, unknown>
    const original = (d.execute as (...a: unknown[]) => Promise<unknown>).bind(d)
    return {
      ...d,
      execute: async (...a: unknown[]) => {
        const 存档 = this.存档们.get(sessionId)
        const s = this.sessions.get(sessionId)
        const 这句 = s ? this.用户消息们(s).at(-1)?.id : undefined
        // 永不 reject（拍不上它自己记断档并喊）；这里再兜一层——工具必须照常执行
        if (存档 && 这句) await 存档.开轮(这句).catch(() => {})
        return original(...a)
      },
    }
  }

  /** 当前对话分支上每一次 `propose_plan` 的 toolCallId（= planId） */
  private 分支上的方案调用(s: NativeSession): Set<string> {
    const 有 = new Set<string>()
    for (const m of 分支转消息(s.sessionManager.getBranch() as unknown[])) {
      if (m.role !== "assistant") continue
      for (const c of m.content ?? []) if (c.type === "toolCall" && c.name === 出方案工具名) 有.add(c.id)
    }
    return 有
  }

  /**
   * 当前对话分支上的用户消息，按先后（根 → 叶）。
   * 与 `history()` 同一个来源 `getBranch()`（2026-09-27 起）：**压缩线之前的那几句也在**——压缩只是往分支上追加一条
   * `compaction`，前面的条目原样留着；`buildSessionContext()` 才把它们换成摘要。
   */
  private 用户消息们(s: NativeSession): { id: string; 文: string }[] {
    const 分支 = s.sessionManager.getBranch() as unknown as { type?: string; id: string; message?: { role?: string; content?: unknown } }[]
    return 分支
      .filter((e) => e.type === "message" && e.message?.role === "user")
      .map((e) => ({ id: e.id, 文: 取文本((e.message!.content ?? "") as Parameters<typeof 取文本>[0]) }))
  }

  /**
   * 把界面那句对到 pi 那句（spec §4.3）：**从后往前数**，再核对原文（pi 那句要包含它——视觉转述会追加描述、图片会变成「（图片）」；
   * `/` 开头的技能调用会被展开，不核对）。对不上就抛——不猜。
   *
   * **压缩线之前那句也照常定位、照常回退**（2026-09-27 查实 pi，与「上下文用量与压缩」交叉）：`navigateTree` 把叶子挪到那句的父条目，
   * 新路径上没有那条 `compaction`，`buildSessionContext()` 还原的是那之前的**原文**而不是摘要——对话真的回到了那一刻，
   * 不是「只剩摘要、回不去」。原文可能又长到要压，那是下一轮 pi 自己的过线压缩，照常出声。见 `tests/integration/rewind.test.ts`。
   */
  private 定位(sessionId: SessionId, s: NativeSession, 那句: 回退的那句): { entry: string; 之后: string[]; 在存档之前: boolean } {
    const 们 = this.用户消息们(s)
    const k = 们.length - 那句.倒数第几句
    const 它 = 们[k]
    const 模板 = new Set(s.session.promptTemplates.map((t) => t.name))
    if (!Number.isInteger(那句.倒数第几句) || 那句.倒数第几句 < 1 || !它 || !原文对得上(那句.文, 它.文, { 模板 })) {
      throw new UserFacingError("这句在 agent 的记录里对不上，回退不了（对话可能被改写过）")
    }
    const 起点 = this.存档们.get(sessionId)?.起点()
    const 存档之前 = new Set(起点 ? (s.sessionManager.getBranch(起点) as unknown as { id: string }[]).map((e) => e.id) : [])
    return { entry: 它.id, 之后: 们.slice(k).map((x) => x.id), 在存档之前: 存档之前.has(它.id) }
  }

  private 不许在跑(sessionId: SessionId, s: NativeSession): void {
    this.不许在回退(s)
    // 答方案做到一半（写文件、存档、记簿之间有好几道 await）不回退（2026-09-28）：回退会按那一刻的分支摘簿，两边交错就对不上
    if (this.方案答中.has(sessionId)) throw new UserFacingError("正在处理方案，处理完再回退")
    if (s.inFlight > 0 || s.转述中 > 0 || s.session.isStreaming || s.session.isCompacting) throw new UserFacingError("agent 还在跑，停下之后才能回退")
  }

  /** 回退期间：发话、压缩、预览、再回退都拒（`回退中` 那条注释）。措辞固定——后端按「正在回退」分码、译成英文 */
  private 不许在回退(s: NativeSession): void {
    if (s.回退中) throw new UserFacingError("正在回退，回退完再发")
  }

  async previewRewind(sessionId: SessionId, 那句: 回退的那句) {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    this.不许在跑(sessionId, s)
    const 位 = this.定位(sessionId, s, 那句)
    const 存档 = this.存档们.get(sessionId)
    if (!存档) return { ok: false as const, reason: "no_archive" as const }
    return 存档.计划({ 之后的用户: 位.之后, 在存档之前: 位.在存档之前 })
  }

  /**
   * 回退（spec §4.2–4.4）。**先文件、后对话**：文件那一半逐个文件报失败、不整体失败（`failed` 带缘故，做了一半也照列）；
   * 对话那一半（`navigateTree`）没有流式时基本不会失败，真失败了文件已经退了——不抛，回 `conversationError`，让后端如实说「文件退了、对话没撤掉」。
   * @throws 还在跑 / 对不上 / `回退不了`（在存档之前、断档、扫不动——这时一个文件都还没动，对话也不撤）
   */
  async rewind(sessionId: SessionId, 那句: 回退的那句, 做法: 回退做法, 内核们: readonly string[]): Promise<回退回执> {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    this.不许在跑(sessionId, s)
    // **从查完「不在跑」到留完话，整段立着**（Task 4 复审）：检查与置位之间没有 await，不会有第二个人插进来
    s.回退中 = true
    const 这次 = this.真回退(sessionId, s, 那句, 做法, 内核们)
    s.回退 = 这次
    try {
      return await 这次
    } finally {
      s.回退中 = false
      s.回退 = undefined
    }
  }

  private async 真回退(sessionId: SessionId, s: NativeSession, 那句: 回退的那句, 做法: 回退做法, 内核们: readonly string[]): Promise<回退回执> {
    const 位 = this.定位(sessionId, s, 那句)
    let 回执: 回退回执 = { restored: [], removed: [], keep: [], cannot: [], failed: [] }
    if (做法 !== "conversation") {
      const 存档 = this.存档们.get(sessionId)
      // 与 `previewRewind` 同一个缘故（Task 4 复审）：没有存档就是没有存档，不是「断档」
      if (!存档) throw new 回退不了("no_archive")
      回执 = await 存档.回退({ 之后的用户: 位.之后, 在存档之前: 位.在存档之前 })
    }
    let 对话撤了 = false
    if (做法 !== "files") {
      try {
        const r = await s.session.navigateTree(位.entry)
        if (r.cancelled) throw new Error("pi 取消了这次跳转")
        对话撤了 = true
        if (r.editorText !== undefined) 回执 = { ...回执, editorText: r.editorText }
        // `navigateTree` 经 `_restoreToolsFromTranscript` 重建了工具集：侧边工具、方案期那几件按标记再设一次
        this.按标记设侧边工具(s.session, this.侧边工具开.has(sessionId))
        this.按标记设方案工具(sessionId, s.session, this.方案簿(sessionId).阶段 === "planning")
        /**
         * 方案簿跟着对话走（2026-09-28）：撤掉的那几轮里交的方案，卡片随转录一起没了——簿里也摘掉，
         * 不然一张看不见的卡还「能答」、下一版的版本号也接不上。批准过的留着、记成「离枝」（2026-09-28）：文件在项目里，
         * 但门不再保护、D3 不再拍底 / 恢复、不再发卡片事件——卡片已经不在转录里了（见 `方案簿.只留`）。
         */
        const 留 = this.方案簿(sessionId).只留(this.分支上的方案调用(s))
        if (留.复原) this.emit({ kind: "plan", sessionId, plan: 留.复原 })
      } catch (e) {
        回执 = { ...回执, conversationError: e instanceof Error ? e.message : String(e) }
      }
    }
    // 对话没撤掉时，模型眼里就是「只退了文件」——照那一种留话
    const 实际 = 回执.conversationError ? (做法 === "conversation" ? undefined : "files") : 做法
    const 话 = 实际 ? 给模型的回退话(实际, 那句.文, 回执, 内核们) : undefined
    /**
     * **留话要落盘**（2026-09-27，控制者定案）。原先走 `deliverAs: "nextTurn"`——pi 只把它放在内存里（`_pendingNextTurnMessages`），
     * 下一句之前重启就没了，模型会以为它改过的文件都还在。现在不带 `deliverAs`：不在流式时 pi 走 `_appendCustomMessage`，
     * 进 agent 状态、**写进会话文件**（`custom_message` 条目，挂在回退之后的叶子上）、续接后 `buildSessionContext()` 照样带给模型。
     * 它发的 `message_start/end`（role `custom`）我们不转成任何界面事件：人那一侧的通知由后端写（`回退通知`），不重复一条。
     * 此刻一定不在流式——`回退中` 立着，没人能开新一轮。
     */
    /**
     * **留话失败不许把整次回退报成失败**（Task 5 复审）：走到这里文件已经退了、对话已经撤了——抛出去的话后端不截转录、不出通知、不记账，
     * 界面与 pi 从此各说各的。接住、随回执带回（`noteError`），后端照常收尾，通知里说「没能告诉 agent」。
     */
    let 话落盘了 = false
    if (话) {
      try {
        await s.session.sendCustomMessage({ customType: "dawn-rewind", content: 话, display: false })
        话落盘了 = true
      } catch (e) {
        回执 = { ...回执, noteError: e instanceof Error ? e.message : String(e) }
      }
    }
    /**
     * **把回退之后的叶子钉在盘上**（2026-09-28，M-6，查实 pi 0.86）：`navigateTree` 只在内存里挪叶子（`branch` / `resetLeaf`，不写条目），
     * 续接时 `SessionManager._buildIndex` 取**文件里最后一条**当叶子。留话成功时那条 `custom_message` 就挂在新叶子上、顺带把位置写进了文件；
     * 但「一起回退」没有内核时不留话、留话又可能失败——那时盘上最后一条仍是被撤掉的那一轮，**重启之后撤掉的对话原样回来**
     * （界面、模型、搜索都看得到它）。补一条 pi 的普通 `custom` 条目：它不进模型上下文（`buildSessionContext` 只认 `custom_message`），
     * `还原历史` 也不认它，只起「最后一条」的作用。写不进去就出声——不许悄悄留一个重启就失效的回退。
     */
    if (对话撤了 && !话落盘了) {
      try {
        s.sessionManager.appendCustomEntry("dawn-rewind-leaf", { at: Date.now() })
      } catch (e) {
        this.emit({
          kind: "notice",
          sessionId,
          text: `对话撤回的位置没能写进记录（${e instanceof Error ? e.message : String(e)}）：重启之后撤掉的那几句可能又回来`,
        })
      }
    }
    return 回执
  }

  /**
   * 建会话处与 `setSideTool` 共用：启用的工具 = 别的照旧 + （开着时）`read_main_session`。
   * 没装这件工具（没给 `读主对话`）→ 什么都不做，不凭空多一个名字。
   */
  private 按标记设侧边工具(
    s: { getActiveToolNames(): string[]; getToolDefinition(name: string): unknown; setActiveToolsByName(names: string[]): void },
    on: boolean,
  ): void {
    if (!s.getToolDefinition(READ_MAIN_SESSION)) return
    const 别的 = s.getActiveToolNames().filter((n) => n !== READ_MAIN_SESSION)
    s.setActiveToolsByName(on ? [...别的, READ_MAIN_SESSION] : 别的)
  }

  /**
   * 方案期那几件的启停（先出方案，2026-09-27；`ls` / `grep` / `find` 2026-09-28 加入）。
   * **没装的不凭空加名字**（与 `按标记设侧边工具` 同一条；远端会话没有那三件、没内核的没有 `inspect_data`）。
   */
  private 按标记设方案工具(
    sessionId: SessionId,
    s: { getActiveToolNames(): string[]; setActiveToolsByName(names: string[]): void },
    on: boolean,
  ): void {
    const 名 = this.方案工具名们.get(sessionId) ?? []
    if (名.length === 0) return
    const 别的 = s.getActiveToolNames().filter((n) => !名.includes(n))
    s.setActiveToolsByName(on ? [...别的, ...名] : 别的)
  }

  /** 进 / 出方案期：记进簿、启停那几件工具。**不发开关事件**——调用方（`setConfigOption` / `answerPlan`）发 */
  private 设方案期(sessionId: SessionId, on: boolean): void {
    this.方案簿(sessionId).设阶段(on ? "planning" : "off")
    const s = this.sessions.get(sessionId)?.session
    if (s) this.按标记设方案工具(sessionId, s, on)
  }

  /**
   * 方案期门（spec §4.1）。**每次调用现查簿**：阶段在会话中途会变，门是建会话时装上的——传值的话改了开关不生效。
   * 拒绝回 `isError` 结果，不抛异常（Spike A-2）。放行的那次先给已批准的方案拍这一轮的底（`记轮基线`），再往里走。
   * `mcp只读` 读的是 `MCP只读标记`：它一路经过 `套上溯源`、`套上存档` 的展开（`...def`）留到这里。
   */
  private 套方案期门(def: Record<string, unknown>, spec: SessionSpec): Record<string, unknown> {
    const name = String(def.name)
    const original = (def.execute as (...a: unknown[]) => Promise<unknown>).bind(def)
    const mcp只读 = def[MCP只读标记] === true
    return {
      ...def,
      execute: async (toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: unknown, ctx: unknown) => {
        const 簿 = this.方案簿(spec.sessionId)
        const 决定 = 方案期判(name, params ?? {}, {
          方案期: 簿.阶段 === "planning",
          已批准: 簿.已批准路径(),
          workspace: spec.workspace,
          ...(mcp只读 ? { mcp只读: true } : {}),
        })
        if (决定.kind === "deny") return { content: [{ type: "text", text: 决定.reason }], isError: true, details: undefined }
        await this.记轮基线(spec.sessionId)
        return original(toolCallId, params, signal, onUpdate, ctx)
      },
    }
  }

  /** `propose_plan` 交上来的一版：记进簿，被取代的与新的都发 `plan` 事件 */
  private 收方案(sessionId: SessionId, toolCallId: string, p: { title: string; plan: string }): { version: number } {
    const { 新, 被取代 } = this.方案簿(sessionId).收(toolCallId, p.title, p.plan)
    for (const x of 被取代) this.emit({ kind: "plan", sessionId, plan: x })
    this.emit({ kind: "plan", sessionId, plan: 新 })
    return { version: 新.version }
  }

  /**
   * 这一轮第一件工具执行前：给已批准的方案文件拍一份底（内容拷进会话目录 `plans/turn/`、记指纹）。同一轮后面的工具等同一张。
   * 只有本机会话、只有批准时记下了指纹的才拍（远端的见 spec §0 的限制）。**永不 reject**：拍不上出声、这一轮不核对——工具照常执行。
   * 此刻不在的（人删了）、被换成链接的不拍：那是人的动作，这一轮不替它「恢复」。
   */
  private 记轮基线(sessionId: SessionId): Promise<unknown> {
    const 有 = this.轮基线.get(sessionId)
    if (有) return 有
    const 拍 = this.拍底(sessionId)
    if (!拍) return Promise.resolve()
    this.轮基线.set(sessionId, 拍)
    return 拍
  }

  /**
   * **人在这一轮里说了话，底就挪到此刻**（2026-09-28 审查）：pi 的一轮会把排队的下一句吸进来接着跑（`queue_delivered`、`newTurn: false`），
   * 调整方向会停下这一步再起新的一句——人在这一轮里改了方案、再说「照我改的做」，按旧的底收尾会把人改的当成 agent 改的恢复掉。
   * 人的话是一个时间点：它之前的改动算人的（留着、卡片记「你改过」），之后的才算 agent 的。
   * 这一轮还没拍过底（还没跑工具）→ 什么都不做，第一件工具照常拍。**同步换上新的底**（收轮核对随时会来取），回它。
   */
  private 刷新轮基线(sessionId: SessionId): Promise<unknown> {
    const 旧 = this.轮基线.get(sessionId)
    if (!旧) return Promise.resolve()
    // 旧的那张写完再拍新的：两张写的是同一个位置
    const 新 = 旧.then(() => this.拍底(sessionId) ?? [])
    this.轮基线.set(sessionId, 新)
    return 新
  }

  /** 拍一张已批准方案的底（文件拷进会话目录 `plans/turn/`，**按 planId 取名**）。本机会话、有批准过的才拍，否则回 undefined。永不 reject */
  private 拍底(sessionId: SessionId): Promise<(已批准存档 & { planId: string })[]> | undefined {
    const 处 = this.方案簿们.get(sessionId)
    if (!处 || 处.远端) return undefined
    const 批 = 处.簿.已批准存档()
    if (批.length === 0) return undefined
    return (async () => {
      const 出: (已批准存档 & { planId: string })[] = []
      for (const r of 批) {
        const p = join(处.workspace, r.相对)
        try {
          if ((await lstat(p)).isSymbolicLink()) continue
        } catch {
          continue
        }
        const 内容 = await readFile(p)
        const 底 = join(处.sessionDir, "plans", "turn", 方案存档名(r.planId))
        await mkdir(dirname(底), { recursive: true })
        await writeFile(底, 内容)
        出.push({ planId: r.planId, 相对: r.相对, sha256: 方案指纹(内容), 存档: 底 })
      }
      return 出
    })().catch((e: unknown) => {
      this.emit({
        kind: "notice",
        sessionId,
        text: `这一轮开头没能给批准过的方案留底，这一轮结束时不核对它（${e instanceof Error ? e.message : String(e)}）`,
        // 不带 failed（2026-09-28，M-1）：这一轮照常在跑，这是一句提醒。带上的话界面收掉「正在等回话」、通知报「出错」——都不对
      })
      return []
    })
  }

  /**
   * 一轮收尾（2026-09-28，D3 定案）：①这一轮拍过底的，与底比，**这一轮里被改的恢复**并响亮地说；
   * ②每一份与**批准时**比，不一样就在卡片上记「你改过」（`fileChanged`）——那是人在两轮之间改的，不恢复。
   * 没有要做的回 undefined（调用方据此保持原来的同步收尾，时序一丝不变）。**永不 reject**。
   */
  private 收轮核对(sessionId: SessionId): Promise<void> | undefined {
    const 处 = this.方案簿们.get(sessionId)
    const 基线 = this.轮基线.get(sessionId)
    this.轮基线.delete(sessionId)
    if (!处 || 处.远端) return undefined
    if (!基线 && 处.簿.已批准存档().length === 0) return undefined
    return (async () => {
      if (基线) {
        for (const 话 of await 核对并恢复(处.workspace, await 基线)) {
          this.emit({ kind: "notice", sessionId, text: 话, ...(话.includes("恢复不了") ? { failed: true as const } : {}) })
        }
      }
      await this.刷新文件改过(sessionId, true)
    })().catch((e: unknown) => {
      this.emit({ kind: "notice", sessionId, text: `核对批准过的方案时出错：${e instanceof Error ? e.message : String(e)}`, failed: true })
    })
  }

  /** 已批准的每一份与批准时比，把「你改过」记进簿；`发` 为真时变了的发 `plan` 事件（`history()` 里不发——卡片由它自己带出去） */
  private async 刷新文件改过(sessionId: SessionId, 发: boolean): Promise<void> {
    const 处 = this.方案簿们.get(sessionId)
    if (!处 || 处.远端) return
    for (const r of 处.簿.已批准存档()) {
      const 状 = await 核对方案({ workspace: 处.workspace, 相对: r.相对, sha256: r.sha256 })
      const x = 处.簿.设文件改过(r.planId, 状 !== "完好")
      if (x && 发) this.emit({ kind: "plan", sessionId, plan: x })
    }
  }

  /**
   * 全部撤下（停止 / 关会话用）：pi 那份与镜像全清，**还没交给 pi 的也一起拿走**（它们的回调摘不到就不发了）。
   * 返回有身份的 id；没身份的（飞书 / 微信 / 定时）后端没有存根，在这里就地出声——不许悄悄丢。
   */
  clearQueue(sessionId: SessionId): string[] {
    const s = this.sessions.get(sessionId)
    if (!s || s.待发.length === 0) return []
    const 未交 = s.待发.filter((x) => x.在 !== "pi")
    const 原来 = this.清空待发(s)
    s.待发 = []
    const 全部 = [...原来, ...未交]
    this.发待发单(sessionId)
    for (const x of 全部) {
      if (!x.id) this.emit({ kind: "notice", sessionId, text: `这句还排着、没有送出去：${x.文}` })
    }
    return 全部.flatMap((x) => (x.id ? [x.id] : []))
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
    /**
     * **回退做到一半不拆**（Task 5 复审）：`navigateTree` / 留话做到一半就 `dispose`，对话那一半会停在半路。
     * 表里已经摘掉了——这期间谁也发不进话；等它做完（成败都行，它自己出声）再往下拆。
     */
    await s.回退?.catch(() => {})
    // 先中止在跑的一轮，再退订，最后释放——顺序反了会在 dispose 之后收到事件
    await s.session.abort().catch(() => {})
    /**
     * **等在跑的那一轮自己收完尾**（2026-09-28 审查）：`abort()` 先回、`prompt()` 的 finally 后落——那里做先出方案的收轮核对，
     * 要用这一轮的底；先扔了底，停下时 agent 改坏的方案就不恢复了。停不下来的（pi 挂住）不陪它等：最多 10 秒。
     */
    if (s.pending) {
      let 表: ReturnType<typeof setTimeout> | undefined
      await Promise.race([s.pending.catch(() => {}), new Promise<void>((r) => (表 = setTimeout(r, 10_000)))])
      clearTimeout(表)
    }
    s.收尾?.()
    this.产物们.delete(sessionId)
    // 这一轮的方案底（先出方案）：会话都停了，这一轮不会再收尾核对；方案簿本身不摘（见 `方案簿们`）
    this.轮基线.delete(sessionId)
    // 等存档那条链排空再放手：这一轮的结尾没拍完就续接，新的那份存档会把它读成「一轮开着没收」（2026-09-27）
    const 存档 = this.存档们.get(sessionId)
    this.存档们.delete(sessionId)
    await 存档?.收尾().catch(() => {})
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

/** 方案期才启用的那几件（先出方案）。`按标记设方案工具` 只动其中这段会话真装了的 */
const 方案期工具 = [出方案工具名, 看数据工具名, "ls", "grep", "find"]

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
