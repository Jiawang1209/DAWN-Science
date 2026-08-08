/**
 * PTY Runtime：在真实终端里起一个外部 agent CLI（Task 1.9）。
 *
 * Spike B 已验证这条路可行：claude 在 PTY 中 TUI 完整渲染、键盘输入生效、
 * 注入的 MCP 工具被调用、Stop hook 触发、用户全局配置未被修改。
 */
import { execFileSync } from "node:child_process"
import * as pty from "node-pty"
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "./types.js"
import { materializeSessionDir } from "./session-dir.js"

interface ProcRow {
  pid: number
  ppid: number
  pgid: number
}

/** 快照当前进程表。失败返回空表——拿不到就退回只杀进程组，不让 stop 整体失败。 */
function processTable(): ProcRow[] {
  try {
    return execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((n) => n.length >= 3 && n.every(Number.isFinite))
      .map(([pid, ppid, pgid]) => ({ pid: pid!, ppid: ppid!, pgid: pgid! }))
  } catch {
    return []
  }
}

/**
 * 收集 root 及其全部后代的 pid 与它们所属的进程组。
 *
 * **必须在杀之前快照**——进程一死，它的孩子会被 reparent 到 init(1)，
 * 那时再遍历就找不到亲子关系了。
 */
function collectTree(rootPid: number): { pids: number[]; pgids: number[] } {
  const table = processTable()
  const childrenOf = new Map<number, ProcRow[]>()
  for (const row of table) {
    const list = childrenOf.get(row.ppid) ?? []
    list.push(row)
    childrenOf.set(row.ppid, list)
  }

  const pids = new Set<number>([rootPid])
  const pgids = new Set<number>()
  const self = table.find((r) => r.pid === rootPid)
  if (self) pgids.add(self.pgid)

  const queue = [rootPid]
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (pids.has(child.pid)) continue
      pids.add(child.pid)
      pgids.add(child.pgid)
      queue.push(child.pid)
    }
  }
  return { pids: [...pids], pgids: [...pgids] }
}

export interface PtyRuntimeOptions {
  command: string
  args?: string[]
  /** CLI 家族名，用于生成隔离配置。留空则不写配置（如测试用 bash） */
  family?: string
  stopHookCommand?: string
  cols?: number
  rows?: number
}

export class PtyRuntime implements AgentRuntime {
  private readonly procs = new Map<SessionId, pty.IPty>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()

  constructor(private readonly opts: PtyRuntimeOptions) {}

  private emit(event: AgentEvent): void {
    // 复制后遍历：sink 若在回调里退订，会在遍历中修改集合
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    let extraEnv: Record<string, string> = {}
    let extraArgs: string[] = []

    if (this.opts.family) {
      const materialized = materializeSessionDir(this.opts.family, spec.sessionDir, {
        mcpServers: spec.mcpServers ?? [],
        ...(this.opts.stopHookCommand ? { stopHookCommand: this.opts.stopHookCommand } : {}),
      })
      extraEnv = materialized.env
      // args 必须一起传下去。Task 1.7 之后 claude 的 MCP 与 hook 全靠命令行标志，
      // 只传 env 会让它完全收不到注入的配置——而进程照样起得来，
      // 失效方式极其隐蔽。
      extraArgs = materialized.args
    }

    const proc = pty.spawn(this.opts.command, [...(this.opts.args ?? []), ...extraArgs], {
      name: "xterm-256color",
      cols: this.opts.cols ?? 100,
      rows: this.opts.rows ?? 30,
      cwd: spec.workspace,
      env: { ...process.env, ...extraEnv } as Record<string, string>,
    })

    this.procs.set(spec.sessionId, proc)
    proc.onData((data) => this.emit({ kind: "output", sessionId: spec.sessionId, data }))
    proc.onExit(({ exitCode }) => {
      this.procs.delete(spec.sessionId)
      this.emit({ kind: "exited", sessionId: spec.sessionId, exitCode })
    })

    this.emit({ kind: "started", sessionId: spec.sessionId, pid: proc.pid })
    return { sessionId: spec.sessionId, pid: proc.pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) {
      set = new Set()
      this.sinks.set(sessionId, set)
    }
    const target = set // 固定引用，避免退订时误删后来重建的集合
    target.add(sink)
    return () => {
      target.delete(sink)
    }
  }

  write(sessionId: SessionId, data: string): void {
    const proc = this.procs.get(sessionId)
    if (!proc) throw new Error(`会话 "${sessionId}" 无活动 PTY 进程`)
    proc.write(data)
  }

  resize(sessionId: SessionId, cols: number, rows: number): void {
    try {
      this.procs.get(sessionId)?.resize(cols, rows)
    } catch {
      // 进程正在退出时 resize 会从 native 层抛错，无实际影响
    }
  }

  /**
   * 终止会话。**杀整个进程组，不是只杀 pty 进程。**
   *
   * node-pty 通过 setsid 让子进程成为新会话与进程组的组长，因此 pid 即 pgid，
   * `process.kill(-pid, sig)` 覆盖它派生的全部后代。
   *
   * 若只调 `proc.kill()`，agent 起的 `npm test` / `python train.py` 会变成孤儿
   * 继续占用 CPU 与 GPU——对长时训练任务尤其致命（显存不释放会卡死后续全部工作）。
   * 这是规格 7.18，也是本仓库最早修正的一处实现缺陷。
   *
   * 序列：SIGTERM → 宽限期 → SIGKILL。
   *
   * **只杀 pty 自己的进程组是不够的**（实施计划初稿的假设，实测被本任务的回归
   * 测试证伪）：shell 在 PTY 里拿到终端后会**启用 job control**，`cmd &` 起的
   * 后台任务会被放进**它自己的进程组**，`kill(-ptyPid)` 够不着。
   * 因此改为**先快照整棵进程树**，再逐个进程组 + 逐个 pid 地杀。
   *
   * **刻意不调用 node-pty 的 `proc.kill()`**：Spike C 实测，对已退出的 pty 再操作
   * 会让 native 层抛 `Napi::Error`——那是异步异常，`try/catch` 拦不住，进程直接
   * SIGABRT。`process.kill` 是纯 POSIX 调用，失败只会同步抛 ESRCH。
   */
  async stop(sessionId: SessionId, opts: { graceMs?: number } = {}): Promise<void> {
    const proc = this.procs.get(sessionId)
    if (!proc) return // 幂等：已退出的会话直接返回
    const graceMs = opts.graceMs ?? 200

    // 必须在杀之前快照：进程一死，子进程会被 reparent 到 init(1)
    const { pids, pgids } = collectTree(proc.pid)

    const send = (target: number, signal: NodeJS.Signals | 0): boolean => {
      try {
        process.kill(target, signal)
        return true
      } catch {
        return false // ESRCH：已消失
      }
    }
    const sweep = (signal: NodeJS.Signals) => {
      for (const pgid of pgids) send(-pgid, signal) // 进程组优先，一次覆盖一批
      for (const pid of pids) send(pid, signal) // 再补漏网的单个进程
    }

    sweep("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, graceMs))
    // 信号 0 只做存在性探测，不实际发送——全走干净就不必补刀
    if (!pids.some((pid) => send(pid, 0))) return
    sweep("SIGKILL")
  }
}

// Windows 说明：process.kill(-pid) 是 POSIX 语义，Windows 上不适用。
// 本阶段以 macOS / Linux 为目标；Windows 支持需改用 job object 或
// `taskkill /T /F`，届时在 stop() 内分支实现（已记入 BACKLOG）。
