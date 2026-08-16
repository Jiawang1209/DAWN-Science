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
  等着: Map<number, { 成: (v: unknown) => void; 败: (e: Error) => void }>
  下一个id: number
  缓冲: string
  /** stderr 的尾巴。**认证提示常常只写在这儿** */
  stderr尾: string[]
  /**
   * 这一段当前的开关（A3）。
   * **只用来分辨 boolean 与 select 的线上形状**——前者要多带一个
   * `type: "boolean"` 且 `value` 是真布尔。
   */
  开关们?: readonly 会话开关[]
  /** 这一轮累计报到多少 token（ACP 报的是**累计**，我们要差值） */
  上次累计?: { input: number; output: number }
  /**
   * 还没回答的权限询问：我们这边的 requestId → 对方的 JSON-RPC id。
   *
   * **必须记住**：它在等一个回复，不回它就一直卡着，
   * 而那看起来像「它死了」。
   */
  待答: Map<string, number>
  停了: boolean
}

const STDERR尾行数 = 40

export class AcpRuntime implements AgentRuntime {
  private readonly 段们 = new Map<SessionId, 一段>()

  constructor(
    private readonly opts: {
      commandOf: (spec: SessionSpec) => ACP命令
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
      stderr尾: [],
      待答: new Map(),
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
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
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
    const 指纹 = AcpRuntime.指纹(cmd, spec.workspace)
    const 旧 = this.opts.priorOf?.(spec)
    let 新: { sessionId?: string; configOptions?: unknown } | undefined

    if (旧 && 旧.fingerprint === 指纹 && 能load) {
      try {
        const r = (await this.请求(spec.sessionId, "session/load", {
          sessionId: 旧.acpSessionId,
          cwd: spec.workspace,
          mcpServers: [],
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
        mcpServers: [],
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
    const 开关 = 收窄开关((新 as Record<string, unknown>)["configOptions"])
    段.开关们 = 开关
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
    const 是布尔 = 段.开关们?.find((o) => o.id === configId)?.kind === "boolean"
    const r = (await this.请求(sessionId, "session/set_config_option", {
      sessionId: 段.acpSessionId,
      configId,
      ...(是布尔 ? { type: "boolean", value: value === "1" } : { value }),
    })) as Record<string, unknown>
    const 开关 = 收窄开关(r?.["configOptions"])
    if (开关.length > 0) {
      段.开关们 = 开关
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
      const err = msg["error"] as { message?: string } | undefined
      if (err) 位.败(new Error(err.message ?? "ACP 返回了一个没有说明的错误"))
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
     * ④ 别的请求（读写文件、终端）**如实拒绝，并说清楚**。
     *
     * 静默不回会让它一直等，而那个表现是「它卡住了」。
     */
    if (typeof id === "number" && typeof msg["method"] === "string") {
      this.回错(段, id, `DAWN 这一版还不支持 ${String(msg["method"])}`)
    }
  }

  private 请求(sessionId: SessionId, method: string, params: unknown): Promise<unknown> {
    const 段 = this.段们.get(sessionId)
    if (!段 || 段.停了) return Promise.reject(new Error("这一段 ACP 会话已经不在了"))
    const id = 段.下一个id++
    return new Promise((成, 败) => {
      段.等着.set(id, { 成, 败 })
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

  private 回错(段: 一段, id: number, message: string): void {
    段.proc.stdin?.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message } })}\n`,
    )
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
