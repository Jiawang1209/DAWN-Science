/** Durable next-turn delivery. Running messages are never replayed after host interruption. */
import type {OrchestrationService} from './service.js'
import type {ChildMessage, ChildRecord, Outcome} from './store.js'

type Runner = (child: ChildRecord, message: ChildMessage, signal: AbortSignal) => Promise<Outcome>
export class OrchestrationMailbox {
  private readonly running = new Map<string, {promise: Promise<void>; controller: AbortController}>()
  private readonly paused = new Set<string>()
  private closed = false
  private closing: Promise<void> | undefined
  constructor(private readonly service: OrchestrationService, private readonly runner: Runner, private readonly onResult: () => void = () => {}, private readonly onError: (error: unknown) => void = error => console.error('[orchestration]', error)) {}

  send(childId: string, text: string, requestId: string, mode: 'start' | 'continue' = 'continue'): ChildMessage {
    if (this.closed || this.service.isClosed) throw new Error('Orchestration mailbox is closed')
    const child = this.service.store.get(childId)
    if (child?.kind !== 'subagent') throw new Error('Unknown or unsupported child in this parent session')
    const duplicate = this.service.store.messages().some(message => message.childId === childId && message.requestId === requestId)
    const message = this.service.store.enqueue(childId, requestId, text, true, mode)
    // Replayed tool calls acknowledge the original request; only a new instruction may undo a stop.
    if (duplicate) return message
    this.service.store.update(childId, {paused: false})
    this.paused.delete(childId)
    this.pump(childId)
    return message
  }

  /** Called only after the owning parent session and its execution adapter are live. */
  resume(): void {
    if (this.closed) return
    for (const child of this.service.store.list()) if (child.kind === 'subagent') this.pump(child.id)
  }

  interrupt(childId: string): boolean {
    if (!this.service.store.get(childId)) throw new Error('Unknown child in this parent session')
    this.paused.add(childId)
    const active = this.running.get(childId)
    active?.controller.abort()
    const interrupted = this.service.interrupt(childId) || !!active
    this.service.store.update(childId, {paused: true})
    return interrupted
  }

  pauseAll(): void {
    const errors: unknown[] = []
    for (const child of this.service.store.list()) if (child.kind === 'subagent') {try {this.interrupt(child.id)} catch (error) {errors.push(error)}}
    if (errors.length) throw new AggregateError(errors, 'Unable to persist child pause')
  }

  async settled(): Promise<void> {
    while (this.running.size) await Promise.all([...this.running.values()].map(run => run.promise))
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    const errors: unknown[] = []
    // Cancellation must proceed even when the filesystem can no longer record it.
    for (const run of this.running.values()) run.controller.abort()
    for (const message of this.service.store.messages()) if (message.status === 'queued') {
      try {this.service.store.updateMessage(message.id, {status: 'cancelled', outcome: {ok: false, output: '', error: '父会话已关闭，消息未执行'}})}
      catch (error) {errors.push(error)}
    }
    this.closing = Promise.all([this.service.close().catch(error => {errors.push(error)}), this.settled()]).then(() => {
      if (errors.length) throw new AggregateError(errors, 'Orchestration mailbox close persistence failed')
    })
    return this.closing
  }

  private pump(childId: string): void {
    if (this.closed || this.paused.has(childId) || this.running.has(childId) || this.service.isClosed) return
    const message = this.service.store.messages().find(item => item.childId === childId && item.status === 'queued')
    const child = this.service.store.get(childId)
    if (!message || !child || child.paused) return
    const controller = new AbortController()
    // Publish local ownership before the service's synchronous admission invokes the runner.
    const work = Promise.resolve().then(async () => {
      const outcome = await this.service.run(childId, async signal => {
        if (this.service.store.message(message.id)?.status !== 'queued') return {ok: false, output: '', error: '消息已取消'}
        this.service.store.updateMessage(message.id, {status: 'running'})
        return this.runner(child, message, signal)
      }, controller.signal)
      this.service.store.updateMessage(message.id, {status: controller.signal.aborted ? 'cancelled' : outcome.ok ? 'completed' : 'failed', outcome})
      this.onResult()
    }).catch(error => {this.paused.add(childId); this.onError(error)}).finally(() => {
      this.running.delete(childId)
      this.pump(childId)
    })
    this.running.set(childId, {promise: work, controller})
  }
}
