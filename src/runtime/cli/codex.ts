/**
 * codex driver：**一轮一个进程 + `thread_id` 续接**（①-C · C3）。
 *
 * Spike G 实测：`codex exec` 是一次性的，多轮靠
 * `codex exec resume <thread_id>` 接上。**这与 claude 完全不同**——
 * 那边是一个长驻进程连喂多轮。
 *
 * ```
 * 第一轮   codex exec --json <prompt>              → thread.started 给出 thread_id
 * 之后     codex exec resume <thread_id> --json <prompt>
 * ```
 *
 * ## 为什么不与 claude driver 共用一个类
 *
 * 计划 §3 写着：**先承认它们不一样**。两种生命周期塞进一个类，会得到一个
 * 「对一边天然、对另一边别扭」的东西。接口按**能力**定义
 * （`startTurn` / `abortTurn` / `close`），实现各管各的进程模型。
 *
 * 这里能看见那个差异的实际后果：**`close()` 之后仍然可以再说话**——
 * 它本来就没有长驻进程。claude driver 那边 `close()` 之后再说话要报错。
 *
 * ## `thread_id` 丢了等于会话断了
 *
 * 所以它经 `onThreadId` 报给上层落库，**不只是留在内存里**。
 * 重开应用之后靠它接上上一次的对话。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { AgentEvent, SessionId } from "../types.js"
import { translateCodexEvent, type CodexTranslateState } from "./codex-translate.js"

export interface CodexDriverOptions {
  sessionId: SessionId
  command: string
  args: string[]
  cwd: string
  emit: (e: AgentEvent) => void
  /** 拿到 / 更新 `thread_id` 时回调。**上层负责落库** */
  onThreadId: (id: string) => void
  /** 已有的 `thread_id`（重开应用后从库里取）。给了就直接 resume */
  threadId?: string
}

/**
 * 固定参数。
 *
 * **`--skip-git-repo-check` 是刻意加的**：codex 默认要求工作区是 git 仓库，
 * 而 DAWN 的默认工作区（`~/DAWN/scratch`）不是。那个检查是 codex 为**它自己的**
 * 沙箱假设设的门；本项目有自己的项目模型与产出事实（不变式 5 从 git 算，
 * 但**没有仓库时如实说「不知道」**，不阻断对话）。
 * 不加它的话，默认工作区里每一轮都会失败。
 */
const EXEC_ARGS = ["--json", "--skip-git-repo-check"]

export class CodexDriver {
  private readonly st: CodexTranslateState
  private child: ChildProcessWithoutNullStreams | undefined
  private buf = ""
  private stderrTail = ""
  private settled = false
  /**
   * 下一轮要用的模型。**缺省 = 用 CLI 自己的默认**，不替它选一个。
   *
   * **codex 换模型几乎不花什么**：它本来就是一轮一个进程，
   * 下一轮的命令行多一个 `--model` 就换了，上下文靠 `thread_id` 保住。
   * 与 claude 恰好相反——那边的 `--model` 是启动时定的，
   * 换模型要杀进程 + `--resume` 重开。**同一个能力，两种代价。**
   */
  private model: string | undefined

  constructor(private readonly opts: CodexDriverOptions) {
    this.st = { unknownKinds: new Map(), threadId: opts.threadId }
  }

  async startTurn(text: string): Promise<void> {
    const before = this.st.threadId
    // **有 thread_id 就 resume**：没有的话每一轮都是全新的对话，
    // 而它看起来是好的（每轮都答得出话），只是不记得上文——**那种坏法最难被发现**
    const modelArgs = this.model ? ["--model", this.model] : []
    const args = before
      ? [...this.opts.args, "exec", "resume", before, ...EXEC_ARGS, ...modelArgs, text]
      : [...this.opts.args, "exec", ...EXEC_ARGS, ...modelArgs, text]

    this.buf = ""
    this.stderrTail = ""
    this.settled = false

    await new Promise<void>((resolve) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(this.opts.command, args, {
          cwd: this.opts.cwd,
          stdio: ["pipe", "pipe", "pipe"],
        })
      } catch (err) {
        this.fatal(`起不来外部 CLI「${this.opts.command}」：${message(err)}`)
        return resolve()
      }
      this.child = child

      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (d: string) => this.onStdout(d))
      /**
       * **stderr 不是失败**（Spike G 第 3 条实测）：codex 每轮都往 stderr 打
       * `models cache` 与 `HTTP 502` 的噪声，**而退出码是 0**。
       * 把它当失败会让每一轮都被误报成出错。只在真失败时作为诊断附带上去。
       */
      child.stderr.on("data", (d: string) => (this.stderrTail = (this.stderrTail + d).slice(-2000)))
      child.stdin.on("error", () => {})
      child.stdin.end()

      child.on("error", (e) => {
        this.fatal(`起不来外部 CLI「${this.opts.command}」：${e.message}`)
        resolve()
      })
      child.on("close", (code) => {
        this.child = undefined
        // **这一轮已经正常收口的话，进程怎么退都不再多报一次失败**
        if (!this.settled && code !== 0) {
          const tail = this.stderrTail.trim()
          this.fatal(
            `外部 CLI 进程以退出码 ${code} 结束${tail ? `：${tail.split("\n").slice(-3).join(" ")}` : ""}`,
          )
        } else if (!this.settled) {
          // 退出码 0 却没给出 turn.completed —— 也是失败，不是空结果
          this.fatal("外部 CLI 正常退出，但这一轮没有收到结束事件")
        }
        resolve()
      })
    })

    // 第一轮之后 thread_id 才有；**变了就报给上层落库**
    if (this.st.threadId && this.st.threadId !== before) this.opts.onThreadId(this.st.threadId)
  }

  /** 换模型。**下一轮生效**——这一轮的进程已经带着旧参数起来了 */
  async setModel(model: string): Promise<void> {
    this.model = model
  }

  abortTurn(): void {
    this.child?.kill("SIGKILL")
  }

  /**
   * **codex 没有长驻进程**，所以 close 只是把当前那一轮停掉。
   * 之后仍然可以再说话——这正是它与 claude 的形状差异。
   */
  async close(): Promise<void> {
    this.child?.kill("SIGKILL")
    this.child = undefined
  }

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
        continue // stdout 上混进普通日志是常事，不当成协议变了
      }
      for (const e of translateCodexEvent(this.opts.sessionId, parsed, this.st)) {
        this.opts.emit(e)
        if (e.kind === "idle") this.settled = true
      }
    }
  }

  /** 出声 + 收口。**没有 `exited`**——会话没结束，只是这一轮没成 */
  private fatal(text: string): void {
    this.settled = true
    this.opts.emit({ kind: "notice", sessionId: this.opts.sessionId, text })
    this.opts.emit({ kind: "idle", sessionId: this.opts.sessionId })
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
