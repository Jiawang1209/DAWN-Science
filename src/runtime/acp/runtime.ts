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
import { 起适配器, 收进程 } from "./launch.js"
import { UserFacingError } from "../../errors.js"
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "../types.js"

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
  /** 这一轮累计报到多少 token（ACP 报的是**累计**，我们要差值） */
  上次累计?: { input: number; output: number }
  停了: boolean
}

const STDERR尾行数 = 40

export class AcpRuntime implements AgentRuntime {
  private readonly 段们 = new Map<SessionId, 一段>()

  constructor(private readonly opts: { commandOf: (spec: SessionSpec) => ACP命令 }) {}

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const cmd = this.opts.commandOf(spec)
    const proc = 起适配器({ command: cmd.command, args: cmd.args, cwd: spec.workspace })
    const 段: 一段 = {
      proc,
      sinks: new Set(),
      等着: new Map(),
      下一个id: 1,
      缓冲: "",
      stderr尾: [],
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
    await this.请求(spec.sessionId, "initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      clientInfo: { name: "DAWN Science", version: "0.0.1" },
    }).catch((e: unknown) => {
      const 因 = e instanceof Error ? e.message : String(e)
      throw new UserFacingError(`ACP 握手失败：${因}${this.尾巴(段)}`)
    })

    /**
     * 开一段会话。`mcpServers` **这一版给空数组**——
     * 把我们自己的工具递进去是 B1 那一片（设计文档里的路线 B）。
     * 给空数组而不是省略：协议里它是必填的。
     */
    const 新 = (await this.请求(spec.sessionId, "session/new", {
      cwd: spec.workspace,
      mcpServers: [],
    })) as { sessionId?: string }
    if (!新?.sessionId) throw new UserFacingError("ACP 适配器没有回 sessionId，这一段起不来")
    段.acpSessionId = 新.sessionId

    const pid = proc.pid ?? 0
    this.发(spec.sessionId, { kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    const 段 = this.段们.get(sessionId)
    if (!段) return () => {}
    段.sinks.add(sink)
    return () => 段.sinks.delete(sink)
  }

  write(sessionId: SessionId, data: string): void {
    const 段 = this.段们.get(sessionId)
    if (!段?.acpSessionId) return
    void this.一轮(sessionId, 段, data)
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
      } else if (类 === "agent_thought_chunk" && 内容?.type === "text" && 内容.text) {
        // **它对自己说的话，不是对你说的**——两者混起来等于把草稿当答案念
        this.发(sessionId, { kind: "thinking", sessionId, delta: 内容.text })
      }
      return
    }
    /**
     * ③ 它向我们发请求（权限、读写文件、终端）。
     *
     * **A1 一律如实拒绝，并说清楚**——静默不回会让它一直等，
     * 而那个表现是「它卡住了」。权限那条在 A2 才真的接。
     */
    if (typeof id === "number" && typeof msg["method"] === "string") {
      this.回错(段, id, `DAWN 这一版还不支持 ${String(msg["method"])}（A2 会接上权限那条）`)
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
