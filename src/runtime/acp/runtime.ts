/**
 * ACP 运行时（A1，2026-08-16，分支 `acp`）。
 *
 * 把一个 **Agent Client Protocol** 适配器（`@agentclientprotocol/codex-acp`、
 * `@agentclientprotocol/claude-agent-acp` 等）接成本项目的第五种运行时。
 * 设计见 `docs/superpowers/specs/2026-08-16-acp-runtime-design.md`。
 *
 * ## 与 `cli` 的区别不是形态，是**谁在说了算**
 *
 * `cli` 那条是我们驱动它：起一个 headless 进程、喂一句、读它吐的 JSON。
 * 它干了什么、要不要动某个文件——**我们没有话语权**，只能事后从输出里读。
 *
 * ACP 反过来：**agent 会主动问**（`session/request_permission`），
 * 会广播它支持哪些模型与模式，会接受 `session/cancel`。
 * 这一片（A1）只做「起得来、说得上话」，权限与取消在 A2 / A3。
 *
 * ## 线上是 NDJSON
 *
 * 一行一条 JSON-RPC。**我们不引 SDK 的连接层**，自己收发这几行——
 * 理由与「不取 WorkBuddy 的 path」同一条：这一层薄到自己写更清楚，
 * 而引进来的是它整套连接、重试与生命周期假设。
 * 类型仍然照着官方 schema 写（方法名、字段名一个字不改）。
 *
 * ## 三条本项目的老纪律，在这里各自有具体形状
 *
 * 1. **失败必须出声**：适配器起不来、`initialize` 报错、进程半路退出，
 *    都要变成屏幕上的一句话。它们各自的措辞不同——「起不来」是路径问题，
 *    「initialize 报错」多半是没登录。
 * 2. **不静默截断**：stderr 留尾巴（适配器把认证提示写在那儿）。
 * 3. **缺席不等于零**：没收到 usage 就不发 `turn_usage`，不补 0。
 */
import type { ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { 起适配器, 收进程 } from "./launch.js"
import { 客户端的手, 本机后端, 手的错误 } from "./hands.js"
import { UserFacingError } from "../../errors.js"
import type {
  会话开关,
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "../types.js"

/**
 * ACP 的 `configOptions` → 我们的 `会话开关`。
 *
 * 两件要小心：
 *   1. **select 的可选项可以是「分组」**（`SessionConfigSelectOptions` 是
 *      `Option[] | Group[]`）。我们**摊平**——分组只是排版，
 *      而我们这一版的菜单是一列。摊平比「不认得就整条丢掉」诚实。
 *   2. **boolean 的 `currentValue` 是真布尔**，而 select 的是字符串 id。
 *      统一成字符串（`"1"` / `""`）好让上层只处理一种，
 *      **线上形状的差别留在这一层**。
 */
/** 这一段的 token 记在谁头上：**agent 一定有，模型有就带上** */
/**
 * 把 ACP 回来的那条错误**说成一句人能照着办的话**（2026-08-19，规格 7.5）。
 *
 * ## 这是一次真实的代价
 *
 * 作者在模型选择器里挑了 `claude-code-acp`，屏幕上只有一句
 * *「操作 createTask 执行失败」*，日志里也只有 `Error: Invalid params`——
 * **既没说哪一个请求，也没说哪一个参数。** 我们不得不去起一台真适配器、
 * 手工重放一遍握手，才知道它嫌的是 `mcpServers[].env` 的形状。
 *
 * 而那台适配器**早就把答案写在 `data` 里了**：
 *
 * ```
 * env: ["Invalid input: expected array, received object"]
 * ```
 *
 * ——是我们在 `位.败(new Error(err.message))` 那一行把它扔了。
 *
 * `message` 这一层是 JSON-RPC 的分类（`Invalid params` / `Internal error`），
 * **本来就不该指望它具体**；具体的东西按约定在 `data` 里。只取 message，
 * 等于**只抄了错误的标题**。
 *
 * 所以这里三样都带上：**哪个方法、哪一类、以及它到底嫌什么**。
 */
function 说清楚(method: string, err: { message?: string; code?: number; data?: unknown }): string {
  const 类 = err.message ?? "没有说明的错误"
  const 号 = err.code === undefined ? "" : `（${err.code}）`
  /**
   * `data` 什么形状都可能，所以原样 JSON 化。**截到 400 字**：
   * 一条塞满屏幕的错误没人读，而**截断要说清省了多少**（规格 7.5）。
   */
  let 细 = ""
  if (err.data !== undefined) {
    const 全 = typeof err.data === "string" ? err.data : JSON.stringify(err.data)
    细 = 全.length > 400 ? `：${全.slice(0, 400)}…（还有 ${全.length - 400} 字）` : `：${全}`
  }
  return `ACP 的 ${method} 被拒了${号}——${类}${细}`
}

function 算谁答的(agentId: string, 开关: readonly 会话开关[] | undefined): string {
  const 模型 = 开关?.find((o) => o.category === "model")
  return 模型?.current ? `${agentId}/${模型.current}` : agentId
}

/**
 * **有些适配器根本不给 `configOptions`**（2026-08-17，拿真适配器验出来的）。
 *
 * `@zed-industries/claude-code-acp` 0.16.2 只给 `models` 与 `modes`，
 * `session/set_config_option` 在它那儿是 **`-32601` Method not found**；
 * 而 `@agentclientprotocol/codex-acp` 1.4.0 三样都给。
 *
 * 不合成的话，真 claude 接进来**模型与模式菜单是空的**——
 * 而空菜单看起来像「这个 agent 不让换模型」，不像「我们没读那个字段」。
 *
 * **只补缺的那一支**：`configOptions` 里已经有 `category: model` 的，
 * 就不再合成一个 model——两个长得一样的菜单，等于没有判据。
 *
 * 返回值第二项是**这些是合成的**，`setConfigOption` 据它分流到
 * `session/set_model` / `session/set_mode`。
 */
function 合成开关(原: unknown, 已有: readonly 会话开关[]): {
  开关: 会话开关[]
  合成的: Map<string, "model" | "mode">
} {
  const r = (原 ?? {}) as Record<string, unknown>
  const 出: 会话开关[] = []
  const 合成的 = new Map<string, "model" | "mode">()

  const 取项 = (源: unknown, 键: "modelId" | "id") => {
    const 项: { value: string; name: string; description?: string }[] = []
    for (const x of Array.isArray(源) ? 源 : []) {
      const y = x as Record<string, unknown>
      if (typeof y[键] === "string" && typeof y["name"] === "string") {
        项.push({
          value: y[键] as string,
          name: y["name"] as string,
          ...(typeof y["description"] === "string" ? { description: y["description"] } : {}),
        })
      }
    }
    return 项
  }

  /**
   * **模型用 `modelId`，模式用 `id`。**
   * 这一处不对称是真适配器里量出来的，不是猜的——写成一样的话，
   * 模型那一支会全军覆没（每一项都少了 value），而表现是「菜单是空的」。
   */
  const 模型源 = (r["models"] ?? {}) as Record<string, unknown>
  if (!已有.some((o) => o.category === "model")) {
    const 项 = 取项(模型源["availableModels"], "modelId")
    if (项.length > 0) {
      出.push({
        id: "__dawn_model",
        name: "Model",
        category: "model",
        kind: "select",
        current: typeof 模型源["currentModelId"] === "string" ? (模型源["currentModelId"] as string) : "",
        options: 项,
      })
      合成的.set("__dawn_model", "model")
    }
  }

  const 模式源 = (r["modes"] ?? {}) as Record<string, unknown>
  if (!已有.some((o) => o.category === "mode")) {
    const 项 = 取项(模式源["availableModes"], "id")
    if (项.length > 0) {
      出.push({
        id: "__dawn_mode",
        name: "Mode",
        category: "mode",
        kind: "select",
        current: typeof 模式源["currentModeId"] === "string" ? (模式源["currentModeId"] as string) : "",
        options: 项,
      })
      合成的.set("__dawn_mode", "mode")
    }
  }
  return { 开关: 出, 合成的 }
}

function 收窄开关(原: unknown): 会话开关[] {
  if (!Array.isArray(原)) return []
  const 出: 会话开关[] = []
  for (const 条 of 原) {
    const o = 条 as Record<string, unknown>
    const id = typeof o["id"] === "string" ? o["id"] : undefined
    const name = typeof o["name"] === "string" ? o["name"] : undefined
    if (!id || !name) continue
    const 类 = o["type"] === "boolean" ? "boolean" : "select"
    const 基 = {
      id,
      name,
      ...(typeof o["description"] === "string" ? { description: o["description"] } : {}),
      ...(typeof o["category"] === "string" ? { category: o["category"] } : {}),
    }
    if (类 === "boolean") {
      出.push({ ...基, kind: "boolean", current: o["currentValue"] ? "1" : "", options: [] })
      continue
    }
    const 生 = o["options"]
    const 项: { value: string; name: string; description?: string }[] = []
    for (const x of Array.isArray(生) ? 生 : []) {
      const y = x as Record<string, unknown>
      // 分组：把它里面的选项摊出来
      const 里 = Array.isArray(y["options"]) ? (y["options"] as unknown[]) : [y]
      for (const z of 里) {
        const w = z as Record<string, unknown>
        if (typeof w["value"] === "string" && typeof w["name"] === "string") {
          项.push({
            value: w["value"],
            name: w["name"],
            ...(typeof w["description"] === "string" ? { description: w["description"] } : {}),
          })
        }
      }
    }
    出.push({
      ...基,
      kind: "select",
      current: typeof o["currentValue"] === "string" ? o["currentValue"] : "",
      options: 项,
    })
  }
  return 出
}

/** 一台适配器要怎么起。**命令由配置给**，运行时不猜 */
export interface ACP命令 {
  command: string
  args: readonly string[]
}

interface 一段 {
  proc: ChildProcess
  /** ACP 那边的会话 id。**与我们的 sessionId 不是一回事**，要对照着记 */
  acpSessionId?: string
  sinks: Set<EventSink>
  /** 等回复的请求。key 是 JSON-RPC 的 id */
  /** `method` 记着这是哪个请求——**错误回来时它是唯一能说清「哪一步失败了」的东西** */
  等着: Map<number, { 成: (v: unknown) => void; 败: (e: Error) => void; method: string }>
  下一个id: number
  缓冲: string
  /** 这一段是哪个 agent（A4）。**记账要用**，而事件里只有 sessionId */
  agentId: string
  /** stderr 的尾巴。**认证提示常常只写在这儿** */
  stderr尾: string[]
  /**
   * 这一段的 token 记在谁头上（A4）。形如 `claude-acp/opus`。
   *
   * ## 为什么不是「模型」而是「agent/模型」
   *
   * ACP 那边**模型是一个可选的开关**——很多适配器压根不报。
   * 只写模型名的话，不报的那些会全部挤进同一格「未记录」，
   * 而它们其实是**不同的 agent**（claude-acp 与 codex-acp 花的钱不是一回事）。
   *
   * 所以：**agent 一定有，模型有就带上**。
   * 「用量」那一屏显示时会去掉斜杠前那一段（`显示模型名`），
   * 于是有模型时看到的是模型，没有时看到的是 agent 名——**都不是编的**。
   */
  谁答的?: string
  /**
   * 这一段当前的开关（A3）。
   * **只用来分辨 boolean 与 select 的线上形状**——前者要多带一个
   * `type: "boolean"` 且 `value` 是真布尔。
   */
  开关们?: readonly 会话开关[]
  /**
   * 这几个开关是**我们合成的**（见 `合成开关`），改它们要走
   * `session/set_model` / `session/set_mode`，而不是 `set_config_option`。
   */
  合成的?: Map<string, "model" | "mode">
  /** 这一轮累计报到多少 token（ACP 报的是**累计**，我们要差值） */
  上次累计?: { input: number; output: number }
  /**
   * 还没回答的权限询问：我们这边的 requestId → 对方的 JSON-RPC id。
   *
   * **必须记住**：它在等一个回复，不回它就一直卡着，
   * 而那看起来像「它死了」。
   */
  待答: Map<string, number>
  /** 这一段借给 agent 的手（T1）。`stop` 时释放里面的终端 */
  手: 客户端的手
  停了: boolean
}

const STDERR尾行数 = 40

/**
 * `session/new` / `session/load` 的 `_meta`：**只有 claude-code-acp 读它**，别的适配器当它不存在
 * （codex-acp 1.6.2 验过收下不报错）。
 *
 * `disallowedTools`：Grep / Glob / NotebookEdit 不经过 `fs/*`——它们直接摸适配器所在机器的磁盘，
 * 是借手之后**仅剩的漏网**。禁掉之后它改用 `grep` 走 terminal（量过）。
 * WebFetch / WebSearch 留着：网络从本机走，无所谓。
 */
const 会话_META = {
  claudeCode: { options: { disallowedTools: ["Grep", "Glob", "NotebookEdit"] } },
} as const

export class AcpRuntime implements AgentRuntime {
  private readonly 段们 = new Map<SessionId, 一段>()

  constructor(
    private readonly opts: {
      commandOf: (spec: SessionSpec) => ACP命令
      /**
       * 这一段是哪个 agent（A4，记账要用）。
       *
       * **`SessionSpec` 里没有它**——那份结构说的是「怎么起这个进程」，
       * 而 agent 的身份住在库里。与 `commandOf` 同一条缝：**现查，不缓存**。
       * 取不到时退回 `"acp"`，那是实情（我们只知道它是一台 ACP agent）。
       */
      agentIdOf?: (spec: SessionSpec) => string | undefined
      /**
       * **把我们自己的工具递给它**（B1 路线 B，2026-08-17）。
       *
       * ACP 里 `mcpServers` 是**由 agent 去拉起**的——我们只声明
       * 「有这么一台，这样起它」。所以这里给的是一条命令 + 环境变量，
       * 而不是一个对象：那台服务器活在另一个进程里。
       *
       * **令牌走 `env`，绝不落盘**（见 `acp/gateway.ts` 的文件头）。
       * 不给这个钩子时递空数组——**「客人模式」仍然成立**（路线 C）。
       */
      mcp?: (spec: SessionSpec) =>
        | { name: string; command: string; args: string[]; env: Record<string, string> }
        | undefined
      /**
       * 上一次那段 ACP 会话的凭据（A3）。**指纹对不上就别给**——
       * 判断留在调用方，运行时只管「给了就试着 load」。
       */
      priorOf?: (spec: SessionSpec) => { acpSessionId: string; fingerprint: string } | undefined
      /** 拿到会话 id 就落库。**一拿到就落**：进程随时会退，留在内存里等于随时会丢 */
      onSessionId?: (sessionId: SessionId, acpSessionId: string, fingerprint: string) => void
    },
  ) {}

  /**
   * 一台适配器的**身份指纹**：命令 + 参数 + 工作目录。
   *
   * 人随时会改配置里的 `command`（换适配器、换版本）。拿旧的会话 id 去
   * `session/load` 一个**不同的 agent**，轻则报错，重则接上一段
   * 风马牛不相及的历史——**而那种错没有任何提示**。
   */
  static 指纹(cmd: ACP命令, workspace: string): string {
    return JSON.stringify([cmd.command, [...cmd.args], workspace])
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const cmd = this.opts.commandOf(spec)
    /**
     * **工作目录不在，要说的是这件事**（2026-08-16，写指纹那条用例时撞出来的）。
     *
     * `spawn` 对「cwd 不存在」报的也是 `ENOENT`，与「命令不存在」一模一样——
     * 于是我们会指着一个好端端的命令说它起不来，而真正的原因是
     * **那个项目文件夹被删了或被改名了**。人照着这句话去查命令，永远查不出来。
     */
    if (!existsSync(spec.workspace)) {
      throw new UserFacingError(
        `这段会话的工作目录不在了：${spec.workspace}。ACP 适配器要在这个目录里起，先把它建回来或换一个目录。`,
      )
    }
    const proc = 起适配器({ command: cmd.command, args: cmd.args, cwd: spec.workspace })
    const 段: 一段 = {
      proc,
      sinks: new Set(),
      等着: new Map(),
      下一个id: 1,
      缓冲: "",
      agentId: this.opts.agentIdOf?.(spec) ?? "acp",
      stderr尾: [],
      待答: new Map(),
      手: new 客户端的手(本机后端(), {
        工作区: spec.workspace,
        // `记录` 只在命令结束后才调，那时段早已进了 `段们`，`发` 送得到
        记录: (text) => this.发(spec.sessionId, { kind: "notice", sessionId: spec.sessionId, text }),
      }),
      停了: false,
    }
    this.段们.set(spec.sessionId, 段)

    /**
     * **起不来要说清是哪一句起不来。**
     *
     * `spawn` 的 ENOENT 是异步来的（`error` 事件），不是抛的——
     * 只 try/catch 的话它会变成一个没人接的 unhandled rejection，
     * 而屏幕上什么都不会发生。
     */
    const 起来了 = new Promise<void>((成, 败) => {
      proc.once("error", (e) => {
        /**
         * **必须是 `UserFacingError`。**
         *
         * 协议服务端对普通 `Error` 的策略是「归一成 internal_error，
         * 原始信息只进日志」——那条策略是对的（消息里可能有路径、密钥片段），
         * **问题永远在抛错的一侧**。
         *
         * `errors.ts` 的文件头写着这条规矩，还写着「同一条规矩在一天里
         * 被我自己违反了一次」。**这是第三次**：我先写了普通 `Error`，
         * e2e 当场抓到——屏幕上只有一句「操作 "createTask" 执行失败」，
         * 而真正的原因（哪个命令起不来）只在主进程日志里。
         */
        败(
          new UserFacingError(
            `起不来 ACP 适配器「${cmd.command}」：${e.message}。` +
              `检查配置里的 command——它要是一个能直接执行的文件（Windows 上 npx 要写 npx.cmd，我们会自动补）`,
          ),
        )
      })
      proc.once("spawn", () => 成())
    })

    proc.stdout?.setEncoding("utf8")
    proc.stdout?.on("data", (块: string) => this.收行(spec.sessionId, 块))
    proc.stderr?.setEncoding("utf8")
    proc.stderr?.on("data", (块: string) => {
      // **留尾巴，不静默丢**：适配器把「请先登录」这类写在 stderr
      段.stderr尾.push(...块.split("\n").filter(Boolean))
      if (段.stderr尾.length > STDERR尾行数) 段.stderr尾.splice(0, 段.stderr尾.length - STDERR尾行数)
    })
    proc.once("exit", (code) => {
      段.停了 = true
      // 还等着回复的那些**必须收到失败**，否则调用方永远挂着
      for (const { 败 } of 段.等着.values()) {
        败(new Error(`ACP 适配器退出了（退出码 ${code ?? "未知"}）${this.尾巴(段)}`))
      }
      段.等着.clear()
      this.发(spec.sessionId, { kind: "exited", sessionId: spec.sessionId, exitCode: code ?? 0 })
    })

    await 起来了

    /**
     * 握手。**版本号写 1**——这是当前 ACP 的版本；
     * 对方回一个它支持的版本，不一致时它自己会拒。
     */
    const 初 = (await this.请求(spec.sessionId, "initialize", {
      protocolVersion: 1,
      /**
       * **把手借出去**（T1，2026-08-20）。claude-code-acp 看见这三样为真，
       * 就把自己的 Read/Write/Edit/Bash 禁掉、改调我们的 `fs/*` 与 `terminal/*`
       * （量过：specs/2026-08-20-acp-terminal-design.md §一）。codex-acp 不看，照旧。
       */
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      clientInfo: { name: "DAWN Science", version: "0.0.1" },
    }).catch((e: unknown) => {
      const 因 = e instanceof Error ? e.message : String(e)
      throw new UserFacingError(`ACP 握手失败：${因}${this.尾巴(段)}`)
    })) as { agentCapabilities?: { loadSession?: boolean } }

    /**
     * **它自己说支持才试**（A3）。
     *
     * 不问就试的话，不支持的适配器会回一个「不认识这个方法」，
     * 而那条错误会被我们说成「接不回上一段」——**把「不支持」说成「失败」
     * 是一种误导**：前者是它本来就没有这个能力，后者是出了问题。
     */
    const 能load = 初?.agentCapabilities?.loadSession === true

    /**
     * 开一段会话——**能接上就接，接不上就重开并说清楚**（A3）。
     *
     * `mcpServers` 这一版给空数组（把我们自己的工具递进去是 B1）。
     * 给空数组而不是省略：协议里它是必填的。
     */
    /**
     * 我们那台 MCP 服务器（B1）。**没有就给空数组**——协议里这一格是必填的，
     * 而「不给工具」是一个合法的、明确的选择（路线 C 的客人模式）。
     */
    const 我 = this.opts.mcp?.(spec)
    /**
     * **`env` 是一个数组，不是一个对象**（2026-08-19，拿真适配器撞出来的）。
     *
     * ACP 里 `McpServer.env` 的类型是 `EnvVariable[]`——`{name, value}` 一条条列，
     * 不是 `Record<string, string>`。送错形状的后果是
     * `session/new` 直接回 `-32602 Invalid params`，
     * 而**界面上只显示「操作 createTask 执行失败」**（作者报的就是这一句）。
     *
     * 真适配器的错误 `data` 里其实写得清清楚楚：
     *
     * ```
     * env: ["Invalid input: expected array, received object"]
     * ```
     *
     * ——**而我们把 `data` 丢掉了**，所以那句话谁也没看见。那条一并修了（见 `请求`）。
     *
     * 为什么此前没红：我们那台假适配器**不校验**这一格。
     * 现在它校验了（`scripts/fake-acp-agent.mjs`），
     * 这一类「形状对不上真契约」的漏才有判据兜着。
     */
    const 我们的MCP = 我
      ? [
          {
            name: 我.name,
            command: 我.command,
            args: 我.args,
            env: Object.entries(我.env).map(([name, value]) => ({ name, value })),
          },
        ]
      : []

    const 指纹 = AcpRuntime.指纹(cmd, spec.workspace)
    const 旧 = this.opts.priorOf?.(spec)
    let 新: { sessionId?: string; configOptions?: unknown } | undefined

    if (旧 && 旧.fingerprint === 指纹 && 能load) {
      try {
        const r = (await this.请求(spec.sessionId, "session/load", {
          sessionId: 旧.acpSessionId,
          cwd: spec.workspace,
          mcpServers: 我们的MCP,
          _meta: 会话_META,
        })) as { configOptions?: unknown }
        新 = { sessionId: 旧.acpSessionId, ...(r ?? {}) }
      } catch (e) {
        /**
         * **接不上要说出来，然后重开一段。**
         *
         * 静默重开的表现是「我上次聊的东西呢」——而那时人会以为
         * 是我们把历史弄丢了。说清楚「接不上、已经新开一段」，
         * 他至少知道发生了什么（规格 7.5）。
         */
        this.发(spec.sessionId, {
          kind: "notice",
          sessionId: spec.sessionId,
          text: `接不回上一段 ACP 会话（${e instanceof Error ? e.message : String(e)}），已经新开了一段。`,
        })
      }
    } else if (旧 && 旧.fingerprint !== 指纹) {
      // **指纹变了**：多半是改了配置里的 command。如实说，别硬接
      this.发(spec.sessionId, {
        kind: "notice",
        sessionId: spec.sessionId,
        text: "这台 ACP agent 的启动命令与上次不同，没有接回上一段会话——已经新开了一段。",
      })
    }

    if (!新) {
      新 = (await this.请求(spec.sessionId, "session/new", {
        cwd: spec.workspace,
        mcpServers: 我们的MCP,
        _meta: 会话_META,
      })) as { sessionId?: string; configOptions?: unknown }
    }
    if (!新?.sessionId) throw new UserFacingError("ACP 适配器没有回 sessionId，这一段起不来")
    段.acpSessionId = 新.sessionId
    // **一拿到就落库**：进程随时会退，留在内存里等于随时会丢
    this.opts.onSessionId?.(spec.sessionId, 新.sessionId, 指纹)

    /**
     * 这一段会话可以调哪些开关。**它可以一个都没有**——
     * 那时菜单不画（**不摆一个空菜单**）。
     */
    const 原生 = 收窄开关((新 as Record<string, unknown>)["configOptions"])
    const 补的 = 合成开关(新, 原生)
    const 开关 = [...原生, ...补的.开关]
    段.开关们 = 开关
    段.合成的 = 补的.合成的
    段.谁答的 = 算谁答的(段.agentId, 开关)
    if (开关.length > 0) {
      this.发(spec.sessionId, { kind: "config_options", sessionId: spec.sessionId, options: 开关 })
    }

    const pid = proc.pid ?? 0
    this.发(spec.sessionId, { kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    const 段 = this.段们.get(sessionId)
    if (!段) return () => {}
    段.sinks.add(sink)
    /**
     * **新来的订阅者要立刻收到当前状态**（A3，2026-08-16 补）。
     *
     * 会话开关是在 `start()` 里拿到的，而**订阅是在 `start()` 之后才挂上的**
     * ——中枢那边的顺序就是「先建会话，再 attach」。
     * 于是那一条广播谁也没收到，症状是**界面上那颗按钮根本不出现**，
     * 而运行时这一侧的判据全绿（它确实发过）。
     *
     * 这不是时序上的巧合，是「订阅只给未来的事件」这个模型的固有缺口：
     * **凡是「当前是什么」而不是「刚发生了什么」的东西，都要补发一次。**
     */
    if (段.开关们?.length) {
      sink({ kind: "config_options", sessionId, options: 段.开关们 })
    }
    return () => 段.sinks.delete(sink)
  }

  write(sessionId: SessionId, data: string): void {
    const 段 = this.段们.get(sessionId)
    if (!段?.acpSessionId) return
    void this.一轮(sessionId, 段, data)
  }

  /**
   * 回答一次权限询问（A2）。
   *
   * `optionId` 缺省 = 取消。**答完就把它从待答里划掉**——
   * 同一个 id 答两次，对方会收到两条回复，而 JSON-RPC 那边只认第一条，
   * 第二条会被当成协议错误。
   */
  answerPermission(sessionId: SessionId, requestId: string, optionId?: string): void {
    const 段 = this.段们.get(sessionId)
    const id = 段?.待答.get(requestId)
    if (!段 || id === undefined) return
    段.待答.delete(requestId)
    this.答(段, id, optionId)
  }

  /**
   * 改一个会话开关（A3）。
   *
   * **boolean 与 select 的线上形状不同**：前者要多带一个 `type: "boolean"`
   * 且 `value` 是真布尔。差别留在这一层，上层只给一个字符串。
   *
   * 回复里带着**整份新的开关**，直接转发出去——
   * 比我们自己去改那一条再合并可靠：合并只会多一种「合错了」的失效方式。
   */
  async setConfigOption(sessionId: SessionId, configId: string, value: string): Promise<void> {
    const 段 = this.段们.get(sessionId)
    if (!段?.acpSessionId) return
    /**
     * **合成出来的那两个走别的方法**（2026-08-17）。
     *
     * `session/set_config_option` 在 claude 那台适配器上是
     * `-32601 Method not found`——照旧发过去的话，用户点了模型菜单
     * 会看到一句「不认识这个方法」，而那看起来像我们坏了。
     *
     * 这条路与原生那条还有一处实质不同：**它们回的是空的 `{}`**，
     * 不带整份新开关。所以当前值得我们自己改——原生那条刻意不这么做
     * （合并只会多一种「合错了」的失效方式），但这里没得选：
     * 不改的话菜单会弹回旧值，看起来像「点了没生效」。
     */
    const 是合成的 = 段.合成的?.get(configId)
    if (是合成的) {
      await this.请求(
        sessionId,
        是合成的 === "model" ? "session/set_model" : "session/set_mode",
        是合成的 === "model"
          ? { sessionId: 段.acpSessionId, modelId: value }
          : { sessionId: 段.acpSessionId, modeId: value },
      )
      const 新的 = (段.开关们 ?? []).map((o) => (o.id === configId ? { ...o, current: value } : o))
      段.开关们 = 新的
      段.谁答的 = 算谁答的(段.agentId, 新的)
      this.发(sessionId, { kind: "config_options", sessionId, options: 新的 })
      return
    }
    const 是布尔 = 段.开关们?.find((o) => o.id === configId)?.kind === "boolean"
    const r = (await this.请求(sessionId, "session/set_config_option", {
      sessionId: 段.acpSessionId,
      configId,
      ...(是布尔 ? { type: "boolean", value: value === "1" } : { value }),
    })) as Record<string, unknown>
    const 开关 = 收窄开关(r?.["configOptions"])
    if (开关.length > 0) {
      段.开关们 = 开关
      // **换了模型，后面的 token 就记在新的那个头上**
      段.谁答的 = 算谁答的(段.agentId, 开关)
      this.发(sessionId, { kind: "config_options", sessionId, options: 开关 })
    }
  }

  async abort(sessionId: SessionId): Promise<void> {
    const 段 = this.段们.get(sessionId)
    if (!段?.acpSessionId) return
    // 通知，没有回复。**发完就当作已经在停**，不等它确认
    this.通知(段, "session/cancel", { sessionId: 段.acpSessionId })
  }

  async stop(sessionId: SessionId): Promise<void> {
    const 段 = this.段们.get(sessionId)
    if (!段) return
    /**
     * **没答完的一律按取消回掉。**
     *
     * 直接杀进程也能了事，但那时对方的日志里是一次「客户端消失了」；
     * 按协议取消是它认得的收场，而**收场清楚的失败才可能被诊断**。
     */
    for (const [rid, id] of 段.待答) {
      this.答(段, id, undefined)
      段.待答.delete(rid)
    }
    // 借出去的终端一起收——不然 agent 死了，它起的 `sleep 999` 还活着
    await 段.手.释放全部()
    段.停了 = true
    收进程(段.proc)
    this.段们.delete(sessionId)
  }

  /* ── 里面 ─────────────────────────────────────────────────── */

  private async 一轮(sessionId: SessionId, 段: 一段, 文本: string): Promise<void> {
    try {
      const r = (await this.请求(sessionId, "session/prompt", {
        sessionId: 段.acpSessionId,
        prompt: [{ type: "text", text: 文本 }],
      })) as { stopReason?: string; usage?: Record<string, number> }

      /**
       * **usage 是累计的，我们要差值**（设计文档第三条）。
       *
       * SDK 的类型注释原文是 `Sum of all token types across session`。
       * 直接相加的话，一段十轮的会话会被算成十几倍——
       * 那时它连作者说的「一个参考」都算不上。
       *
       * 差值为负 = 对方重开了会话，从头算。
       */
      const u = r?.usage
      if (u && typeof u["inputTokens"] === "number") {
        const 现 = { input: u["inputTokens"] ?? 0, output: u["outputTokens"] ?? 0 }
        const 上 = 段.上次累计 ?? { input: 0, output: 0 }
        const 增 = {
          input: 现.input >= 上.input ? 现.input - 上.input : 现.input,
          output: 现.output >= 上.output ? 现.output - 上.output : 现.output,
        }
        段.上次累计 = 现
        if (增.input > 0 || 增.output > 0) {
          this.发(sessionId, {
            kind: "turn_usage",
            sessionId,
            usage: { input: 增.input, output: 增.output },
            // **谁花的**（A4）：账本据此在「用量」那一屏上把它分出来
            ...(段.谁答的 ? { model: 段.谁答的 } : {}),
          })
        }
      }

      this.发(sessionId, { kind: "turn_end", sessionId })
    } catch (e) {
      // **失败要出声**：不出声的表现是「发了没反应」
      this.发(sessionId, {
        kind: "notice",
        sessionId,
        text: `ACP 这一轮失败了：${e instanceof Error ? e.message : String(e)}`,
      })
    } finally {
      // **一整轮真正结束**——账本在这里收口
      this.发(sessionId, { kind: "idle", sessionId })
    }
  }

  private 收行(sessionId: SessionId, 块: string): void {
    const 段 = this.段们.get(sessionId)
    if (!段) return
    段.缓冲 += 块
    let i: number
    while ((i = 段.缓冲.indexOf("\n")) >= 0) {
      const 行 = 段.缓冲.slice(0, i).trim()
      段.缓冲 = 段.缓冲.slice(i + 1)
      if (!行) continue
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(行) as Record<string, unknown>
      } catch {
        // **坏行不静默吞**：它多半意味着对方根本不是一个 ACP agent
        this.发(sessionId, {
          kind: "notice",
          sessionId,
          text: `ACP 适配器吐了一行不是 JSON 的东西（前 120 字）：${行.slice(0, 120)}`,
        })
        continue
      }
      this.收一条(sessionId, 段, msg)
    }
  }

  private 收一条(sessionId: SessionId, 段: 一段, msg: Record<string, unknown>): void {
    const id = msg["id"]
    // ① 是我们那些请求的回复
    if (typeof id === "number" && 段.等着.has(id)) {
      const 位 = 段.等着.get(id)!
      段.等着.delete(id)
      const err = msg["error"] as { message?: string; code?: number; data?: unknown } | undefined
      if (err) 位.败(new Error(说清楚(位.method, err)))
      else 位.成(msg["result"])
      return
    }
    // ② 是它发来的通知
    if (msg["method"] === "session/update") {
      const p = msg["params"] as { update?: Record<string, unknown> } | undefined
      const up = p?.update
      const 类 = up?.["sessionUpdate"]
      const 内容 = up?.["content"] as { type?: string; text?: string } | undefined
      if (类 === "agent_message_chunk" && 内容?.type === "text" && 内容.text) {
        this.发(sessionId, { kind: "output", sessionId, data: 内容.text })
      } else if (类 === "config_option_update") {
        // **整份换掉**：它给的就是整份新的
        const 开关 = 收窄开关((up as Record<string, unknown>)["configOptions"])
        if (开关.length > 0) {
          段.开关们 = 开关
          段.谁答的 = 算谁答的(段.agentId, 开关)
          this.发(sessionId, { kind: "config_options", sessionId, options: 开关 })
        }
      } else if (类 === "agent_thought_chunk" && 内容?.type === "text" && 内容.text) {
        // **它对自己说的话，不是对你说的**——两者混起来等于把草稿当答案念
        this.发(sessionId, { kind: "thinking", sessionId, delta: 内容.text })
      }
      return
    }
    // ③ **它在问「能不能」**（A2）
    if (typeof id === "number" && msg["method"] === "session/request_permission") {
      const p = msg["params"] as
        | { toolCall?: { title?: string; rawInput?: unknown; kind?: string }; options?: unknown[] }
        | undefined
      const 选项 = (p?.options ?? [])
        .map((o) => o as { optionId?: string; name?: string; kind?: string })
        .filter((o) => typeof o.optionId === "string" && typeof o.name === "string")
        .map((o) => ({ optionId: o.optionId!, name: o.name!, kind: o.kind ?? "" }))

      /**
       * **一个选项都没有时，只能取消。**
       *
       * 摆一张没有按钮的卡等于让人对着它干瞪眼；
       * 而静默不回它会一直卡着。两害相权，如实取消并出声。
       */
      if (选项.length === 0) {
        this.答(段, id, undefined)
        this.发(sessionId, {
          kind: "notice",
          sessionId,
          text: "ACP agent 问了一次权限，但一个选项都没给——这一次按取消处理了",
        })
        return
      }

      const requestId = `p${id}`
      段.待答.set(requestId, id)
      this.发(sessionId, {
        kind: "permission_request",
        sessionId,
        requestId,
        // **标题用它给的**：它比我们更清楚这次要干什么
        title: p?.toolCall?.title ?? "这次工具调用",
        options: 选项,
      })
      return
    }

    /**
     * ④ 别的请求——**读写文件、终端——交给手**（T1）。
     *
     * 它在等回复，不回它就一直卡着（表现是「它死了」）。
     * 所以成了回 result，败了回带 code 的 error——两条路都**必须**写回去。
     */
    if (typeof id === "number" && typeof msg["method"] === "string") {
      const method = msg["method"]
      void 段.手.处理(method, msg["params"]).then(
        (result) => this.回结果(段, id, result),
        (e: unknown) => {
          if (e instanceof 手的错误) this.回错(段, id, e.message, e.code)
          else this.回错(段, id, `${method} 失败：${e instanceof Error ? e.message : String(e)}`, -32603)
        },
      )
    }
  }

  private 请求(sessionId: SessionId, method: string, params: unknown): Promise<unknown> {
    const 段 = this.段们.get(sessionId)
    if (!段 || 段.停了) return Promise.reject(new Error("这一段 ACP 会话已经不在了"))
    const id = 段.下一个id++
    return new Promise((成, 败) => {
      // **记下这是哪个方法**：错误回来时它是唯一能说清「哪一步失败了」的东西
      段.等着.set(id, { 成, 败, method })
      段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    })
  }

  private 通知(段: 一段, method: string, params: unknown): void {
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
  }

  /** 把一次权限询问的结果写回去。**`optionId` 缺省 = 取消** */
  private 答(段: 一段, id: number, optionId?: string): void {
    const outcome = optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" }
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: { outcome } })}\n`)
  }

  private 回结果(段: 一段, id: number, result: unknown): void {
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: result ?? {} })}\n`)
  }

  private 回错(段: 一段, id: number, message: string, code = -32601): void {
    段.proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`)
  }

  private 尾巴(段: 一段): string {
    if (段.stderr尾.length === 0) return ""
    // **说清省了多少**（规格 7.5：不静默截断）
    const 取 = 段.stderr尾.slice(-8)
    const 省 = 段.stderr尾.length - 取.length
    return `\n适配器最后几行输出${省 > 0 ? `（另有 ${省} 行没显示）` : ""}：\n${取.join("\n")}`
  }

  private 发(sessionId: SessionId, e: AgentEvent): void {
    const 段 = this.段们.get(sessionId)
    if (!段) return
    for (const s of 段.sinks) s(e)
  }
}
