/**
 * 测试替身：不起任何进程，write 原样 echo 回来（Task 1.4）。
 *
 * 存在的意义是让 `session/*` 的业务逻辑（生命周期、租约、背压）能在**不依赖真实进程**
 * 的前提下做 TDD。Task 1.5–1.8 全部基于它写测试，真实现（pty / native）留到 1.9–1.10。
 */
import type {
  AgentEvent,
  AgentRuntime,
  EventSink,
  SessionHandle,
  SessionId,
  SessionSpec,
} from "./types.js"

export class FakeRuntime implements AgentRuntime {
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  private readonly live = new Map<SessionId, number>()
  private nextPid = 1000

  private emit(event: AgentEvent): void {
    // 复制一份再遍历：sink 内部若调用退订，会在遍历中修改集合
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const pid = this.nextPid++
    this.live.set(spec.sessionId, pid)
    this.emit({ kind: "started", sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) {
      set = new Set()
      this.sinks.set(sessionId, set)
    }
    const target = set // 固定住引用，避免退订时误删后来重建的集合
    target.add(sink)
    return () => {
      target.delete(sink)
    }
  }

  write(sessionId: SessionId, data: string): void {
    if (!this.live.has(sessionId)) throw new Error(`会话 "${sessionId}" 未启动，无法写入`)
    this.emit({ kind: "output", sessionId, data: `echo:${data}` })
  }

  /** 幂等：对已停止的会话再次 stop 不重复发 exited 事件。 */
  async stop(sessionId: SessionId): Promise<void> {
    if (!this.live.has(sessionId)) return
    this.live.delete(sessionId)
    this.emit({ kind: "exited", sessionId, exitCode: 0 })
  }
}
