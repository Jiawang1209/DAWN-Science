/**
 * `CliRuntime`：把两个 driver 接成一个 `AgentRuntime`（①-C · C4）。
 *
 * **①-C 的转折点。** C1–C3 都还没有可运行路径；接上它之后
 * claude / codex 第一次能在对话框里说话，而且它们的工具调用第一次落进账本。
 *
 * ## 一个 runtime，两种进程模型
 *
 * 计划 §3 的结论：**先承认它们不一样**。所以这里只做三件事——
 * 挑 driver、扇出事件、把 `AgentRuntime` 的契约翻译成 driver 的能力调用。
 * **两种生命周期的差异留在各自的 driver 里**，不在这里糊平。
 *
 * ## `write` 的契约
 *
 * 与 `NativeRuntime.write` 一致：**同步返回，不 await 一整轮**。
 * 调用方是租约守卫，它只负责「准不准写」，不该被一轮对话阻塞。
 * 「跑完了没有」另有 `waitForIdle` 一问。
 */
import { UserFacingError } from "../../errors.js"
import { familyOf } from "../family.js"
import { ClaudeDriver } from "./claude.js"
import { CodexDriver } from "./codex.js"
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "../types.js"

/** driver 的公共能力。**按能力定义，不按进程生命周期**（计划 §3） */
interface Driver {
  startTurn(text: string): Promise<void>
  abortTurn(): void
  close(): Promise<void>
}

export interface CliRuntimeOptions {
  /**
   * 会话 → 起哪个命令。**由上层给**（命令来自 `providers.yaml` 的 agent 定义），
   * 本模块不猜。`family` 决定挑哪个 driver。
   */
  commandOf: (spec: SessionSpec) => { command: string; args: string[]; family?: string | undefined }
  /**
   * `thread_id` 变了。**上层负责落库**——codex 的多轮全靠它，
   * 丢了等于会话断了（计划 §3）。
   */
  onThreadId?: (sessionId: SessionId, threadId: string) => void
}

interface Live {
  driver: Driver
  /** 最近一轮的 promise。`waitForIdle` 等它——与 NativeRuntime 的 `pending` 同源 */
  pending: Promise<void> | undefined
}

export class CliRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, Live>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  /** CLI 会话不对应一个长期进程（codex 一轮一个），pid 是合成序号，**不可用于 kill** */
  private nextPid = 1

  constructor(private readonly opts: CliRuntimeOptions) {}

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const { command, args, family } = this.opts.commandOf(spec)
    const kind = family ?? familyOf(command)

    const common = {
      sessionId: spec.sessionId,
      command,
      args,
      cwd: spec.workspace,
      emit: (e: AgentEvent) => this.emit(e),
    }

    let driver: Driver
    if (kind === "claude") {
      driver = new ClaudeDriver(common)
    } else if (kind === "codex") {
      driver = new CodexDriver({
        ...common,
        onThreadId: (id) => this.opts.onThreadId?.(spec.sessionId, id),
        ...(spec.cli?.threadId ? { threadId: spec.cli.threadId } : {}),
      })
    } else {
      /**
       * **认不出就响亮失败**，不挑一个 driver 凑合。
       *
       * 凑合的后果是「进程起得来、事件解析不出来」——界面上是一个
       * 永远不回话的会话，而日志里只有一堆「不认识的事件」。
       * 与 `family.ts` 的注释同源：猜错比不猜更贵。
       */
      throw new UserFacingError(
        `不支持的外部 CLI「${command}」：本项目认得的是 claude 与 codex。` +
          `想用别的 CLI，可以把它配成 kind: pty 在终端里跑。`,
      )
    }

    this.sessions.set(spec.sessionId, { driver, pending: undefined })
    const pid = this.nextPid++
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) {
      set = new Set()
      this.sinks.set(sessionId, set)
    }
    set.add(sink)
    return () => {
      set.delete(sink)
    }
  }

  write(sessionId: SessionId, data: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    // **不 await**：见文件头。失败经事件流出声，不静默吞
    const run = s.driver.startTurn(data).catch((err: unknown) => {
      this.emit({
        kind: "notice",
        sessionId,
        text: `外部 CLI 这一轮没跑起来：${err instanceof Error ? err.message : String(err)}`,
      })
      // **收口**：不发 idle 的话，账本上那条回合会永远 running
      this.emit({ kind: "idle", sessionId })
    })
    // 串起来而不是覆盖：连发两轮时等待必须覆盖两轮
    s.pending = s.pending ? s.pending.then(() => run) : run
    void s.pending
  }

  /** 等当前回合跑完。CLI 的管道模式与测试需要它 */
  async waitForIdle(sessionId: SessionId): Promise<void> {
    await this.sessions.get(sessionId)?.pending
  }

  async abort(sessionId: SessionId): Promise<void> {
    this.sessions.get(sessionId)?.driver.abortTurn()
  }

  async stop(sessionId: SessionId): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    this.sessions.delete(sessionId)
    await s.driver.close()
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
  }

  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }
}
