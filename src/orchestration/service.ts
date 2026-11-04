/** Shared admission and cleanup ownership for existing DAWN child backends. */
import {OrchestrationStore, type Outcome, type ChildKind, type ChildRecord} from './store.js'

type Work = (signal: AbortSignal) => Promise<Outcome>
interface Entry {
  id: string
  controller: AbortController
  work: Work
  resolve: (outcome: Outcome) => void
  reject: (error: unknown) => void
  detach: () => void
  finished: Promise<void>
  finish: () => void
}
const cancelled = (): Outcome => ({ok: false, output: '', error: '执行已中止'})

export class OrchestrationService {
  private queue: Entry[] = []
  private active = new Map<string, Entry>()
  private closing: Promise<void> | undefined
  private closed = false
  private readonly listeners = new Set<() => void>()
  private generation = 0

  constructor(readonly store: OrchestrationStore, readonly capacity = 4) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid orchestration capacity')
  }

  get revision(): number {return this.generation}
  get isClosed(): boolean {return this.closed}

  register(kind: ChildKind, address: readonly string[], label: string): ChildRecord {
    if (this.closed) throw new Error('Orchestration service is closed')
    const count = this.store.list().length
    const child = this.store.register(kind, address, label)
    if (this.store.list().length !== count) this.changed()
    return child
  }

  run(id: string, work: Work, signal?: AbortSignal): Promise<Outcome> {
    if (this.closed) return Promise.reject(new Error('Orchestration service is closed'))
    const child = this.store.get(id)
    if (!child) return Promise.reject(new Error(`Unknown child in this parent session: ${id}`))
    if (signal?.aborted) return Promise.resolve(cancelled())
    return new Promise<Outcome>((resolve, reject) => {
      const controller = new AbortController()
      let finish!: () => void
      const finished = new Promise<void>(done => {finish = done})
      const entry: Entry = {id, work, controller, resolve, reject, finished, finish, detach: () => {}}
      const abort = () => {
        controller.abort(signal?.reason)
        const index = this.queue.indexOf(entry)
        if (index < 0) return
        this.queue.splice(index, 1)
        try {
          if (!this.active.has(id)) this.store.update(id, {state: 'cancelled', reason: '排队期间已中止'})
          resolve(cancelled())
        } catch (error) {reject(error)}
        finally {entry.detach(); finish(); this.changed(); this.drain()}
      }
      signal?.addEventListener('abort', abort, {once: true})
      entry.detach = () => signal?.removeEventListener('abort', abort)
      try {
        if (!this.active.has(id)) this.store.update(id, {state: 'queued'})
        this.queue.push(entry)
        this.changed()
        this.drain()
      } catch (error) {entry.detach(); finish(); reject(error)}
    })
  }

  /** Interrupt only the active turn; later queued work remains explicitly queued. */
  interrupt(id: string): boolean {
    if (!this.store.get(id)) throw new Error(`Unknown child in this parent session: ${id}`)
    const entry = this.active.get(id)
    if (!entry) return false
    entry.controller.abort()
    this.changed()
    return true
  }

  /** Closing admission happens before awaiting any backend cleanup. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    const active = [...this.active.values()]
    for (const entry of active) entry.controller.abort()
    const queued = this.queue.splice(0)
    const errors: unknown[] = []
    for (const entry of queued) {
      entry.controller.abort()
      try {
        if (!this.active.has(entry.id)) this.store.update(entry.id, {state: 'cancelled', reason: '父会话已关闭，未开始执行'})
        entry.resolve(cancelled())
      } catch (error) {errors.push(error); entry.reject(error)}
      finally {entry.detach(); entry.finish()}
    }
    this.changed()
    this.closing = Promise.all(active.map(entry => entry.finished)).then(() => {
      if (errors.length) throw new AggregateError(errors, 'Orchestration close persistence failed')
    })
    return this.closing
  }

  /** One-shot change wait with revision protection against missed notifications. */
  wait(afterRevision: number, timeoutMs: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) return Promise.reject(new Error('Wait timeout must be 0..60000 ms'))
    if (this.generation !== afterRevision || this.closed || signal?.aborted) return Promise.resolve(this.generation)
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer); this.listeners.delete(finish); signal?.removeEventListener('abort', finish); resolve(this.generation)
      }
      const timer = setTimeout(finish, timeoutMs)
      this.listeners.add(finish)
      signal?.addEventListener('abort', finish, {once: true})
    })
  }

  private changed(): void {this.generation++; for (const listener of [...this.listeners]) listener()}

  private drain(): void {
    if (this.closed) return
    while (this.active.size < this.capacity) {
      const index = this.queue.findIndex(entry => !this.active.has(entry.id))
      if (index < 0) return
      const entry = this.queue.splice(index, 1)[0]!
      this.active.set(entry.id, entry)
      void this.execute(entry)
    }
  }

  private async execute(entry: Entry): Promise<void> {
    try {
      const epoch = this.store.get(entry.id)!.epoch + 1
      this.store.update(entry.id, {state: 'running', epoch, reason: ''})
      this.changed()
      let outcome: Outcome
      try {outcome = await entry.work(entry.controller.signal)}
      catch (error) {outcome = {ok: false, output: '', error: error instanceof Error ? error.message : String(error)}}
      if (entry.controller.signal.aborted) outcome = cancelled()
      this.store.update(entry.id, {
        state: entry.controller.signal.aborted ? 'cancelled' : outcome.ok ? 'completed' : 'failed',
        result: outcome, reason: outcome.error ?? '',
      }, epoch)
      entry.resolve(outcome)
    } catch (error) {entry.reject(error)}
    finally {
      entry.detach(); this.active.delete(entry.id); entry.finish(); this.changed(); this.drain()
    }
  }
}
