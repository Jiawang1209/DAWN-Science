/**
 * claude driver：**长驻进程 + stream-json**（①-C · C2）。
 *
 * Spike G 实测：`--input-format stream-json` 可以**保持一个进程连喂多轮**，
 * 第二轮记得第一轮。所以这个 driver 持有进程，一轮一轮往 stdin 写。
 *
 * ```
 * claude --print --output-format stream-json --input-format stream-json --verbose
 *   stdin  ← {"type":"user","message":{"role":"user","content":"…"}}\n
 *   stdout → system ×9 → assistant(tool_use) → user(tool_result) → assistant(text) → result
 * ```
 *
 * ## 与 codex driver 刻意不共用一个抽象
 *
 * 计划 §3 记着：codex 是**一轮一个进程 + `thread_id` 续接**。
 * 把两种生命周期塞进一个类，会得到一个「对一边天然、对另一边别扭」的东西。
 * **接口按能力定义**（`startTurn` / `abortTurn` / `close`），
 * **实现各管各的进程模型。**
 *
 * ## 一轮什么时候算完
 *
 * **只认 `result` 事件**，不认「stdout 安静了」。后者会把一次慢的工具调用
 * 误判成收工——而那之后的回复会被算进下一轮，表现是「答非所问」。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { AgentEvent, SessionId } from "../types.js"
import { translateClaudeEvent, type ClaudeTranslateState } from "./claude-translate.js"

export interface ClaudeDriverOptions {
  sessionId: SessionId
  command: string
  args: string[]
  cwd: string
  emit: (e: AgentEvent) => void
}

/** claude 的固定参数。**写死在这里**——它们是这个 driver 成立的前提，不是可配项 */
const HEADLESS_ARGS = [
  "--print",
  "--output-format",
  "stream-json",
  "--input-format",
  "stream-json",
  // 没有它 stream-json 不给完整事件流（实测）
  "--verbose",
]

export class ClaudeDriver {
  private child: ChildProcessWithoutNullStreams | undefined
  private buf = ""
  private readonly st: ClaudeTranslateState = { unknownKinds: new Map(), toolNames: new Map() }
  /** 当前这一轮的收尾钩子。**一轮至多一个**——claude 的 stdin 是串行的 */
  private pending: (() => void) | undefined
  private dead = false

  constructor(private readonly opts: ClaudeDriverOptions) {}

  async startTurn(text: string): Promise<void> {
    if (this.dead) {
      // **死过之后要明确失败**，不静静地什么都不做——
      // 后者的表现是「我说了话它没反应」，而用户无从知道进程早没了
      throw new Error("外部 CLI 进程已结束，请新建会话")
    }
    if (!this.child) this.spawnChild()
    const child = this.child
    if (!child) return // spawn 失败已在 spawnChild 里出声并标 dead

    return new Promise<void>((resolve) => {
      this.pending = resolve
      const line = JSON.stringify({
        type: "user",
        message: { role: "user", content: text },
      })
      child.stdin.write(`${line}\n`)
    })
  }

  abortTurn(): void {
    // claude 的 headless 模式没有「中断当前轮」的入口，只能整个停掉。
    // **如实反映**：这会结束会话，不是中断一轮
    void this.close()
  }

  async close(): Promise<void> {
    const child = this.child
    this.child = undefined
    this.dead = true
    if (!child) return
    child.kill("SIGKILL")
  }

  private spawnChild(): void {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(this.opts.command, [...this.opts.args, ...HEADLESS_ARGS], {
        cwd: this.opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (err) {
      this.fatal(`起不来外部 CLI「${this.opts.command}」：${message(err)}`)
      return
    }
    this.child = child

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (d: string) => this.onStdout(d))
    /**
     * **stderr 不是失败**（Spike G 第 3 条实测）。
     *
     * codex 每轮都往 stderr 打 `models cache` 与 `HTTP 502` 的噪声而退出码为 0；
     * claude 也会打警告。**把 stderr 非空当失败会让每一轮都被误报成出错。**
     * 它只在真失败（非 0 退出）时作为诊断附带上去。
     */
    child.stderr.on("data", (d: string) => (this.stderrTail = (this.stderrTail + d).slice(-2000)))
    // 进程立刻退出时写 stdin 会撞 EPIPE，那是次生信号；真正的原因由 close 分支报
    child.stdin.on("error", () => {})
    child.on("error", (e) => this.fatal(`起不来外部 CLI「${this.opts.command}」：${e.message}`))
    child.on("close", (code) => {
      if (this.dead) return // 我们自己 close 掉的，不必再报
      const tail = this.stderrTail.trim()
      this.fatal(
        `外部 CLI 进程以退出码 ${code} 结束${tail ? `：${tail.split("\n").slice(-3).join(" ")}` : ""}`,
        code ?? 1,
      )
    })
  }

  private stderrTail = ""

  private onStdout(chunk: string): void {
    this.buf += chunk
    let i: number
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i)
      this.buf = this.buf.slice(i + 1)
      const s = line.trim()
      if (!s) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(s)
      } catch {
        // stdout 上混进一行普通日志是常事。**跳过，不当成协议变了**
        continue
      }
      for (const e of translateClaudeEvent(this.opts.sessionId, parsed, this.st)) {
        this.opts.emit(e)
        // **一轮的边界只认 `idle`**（由 `result` 翻译而来），不认「stdout 安静了」
        if (e.kind === "idle") this.settle()
      }
    }
  }

  /**
   * 进程层面的坏消息：**出声 + 收口 + 放掉在等的那一轮**。
   *
   * 三件缺一不可。少了最后一件，`startTurn` 的 promise 会永远挂着——
   * 而调用方（会话管理器）正 await 它。
   */
  private fatal(text: string, exitCode = 1): void {
    this.dead = true
    this.child = undefined
    this.opts.emit({ kind: "notice", sessionId: this.opts.sessionId, text })
    this.opts.emit({ kind: "exited", sessionId: this.opts.sessionId, exitCode })
    this.settle()
  }

  private settle(): void {
    const done = this.pending
    this.pending = undefined
    done?.()
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
