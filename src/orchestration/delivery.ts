/** Result outbox. A parent-owned durable receipt, not an API return, confirms delivery. */
import type {ChildMessage, OrchestrationStore} from './store.js'
interface DeliveryOptions {
  store: OrchestrationStore
  busy: () => boolean
  hasReceipt: (messageId: string) => Promise<boolean>
  send: (message: ChildMessage) => Promise<void>
}
export class OrchestrationDelivery {
  private flushing: Promise<number> | undefined
  private requested = false
  private closed = false
  private suspended = false
  private epoch = 0
  constructor(private readonly opts: DeliveryOptions) {}
  close(): void {this.closed = true; this.epoch++}
  suspend(): void {this.suspended = true; this.epoch++}
  resume(): void {this.suspended = false}
  get canWakeParent(): boolean {return !this.closed && !this.suspended}
  private current(epoch: number): boolean {return this.canWakeParent && this.epoch === epoch}
  flush(): Promise<number> {
    if (this.flushing) {this.requested = true; return this.flushing}
    const epoch = this.epoch
    const work = (async () => {
      let sent = 0
      do {
        this.requested = false
        sent += await this.once(epoch)
      } while (this.requested && this.current(epoch) && !this.opts.busy())
      return this.current(epoch) ? sent : 0
    })().finally(() => {this.flushing = undefined})
    this.flushing = work
    return work
  }
  private async once(epoch: number): Promise<number> {
    let sent = 0
    for (const message of this.opts.store.messages()) {
      if (!this.current(epoch) || this.opts.busy()) break
      if (!message.notify || message.deliveredAt !== undefined || ['queued', 'running'].includes(message.status)) continue
      const received = await this.opts.hasReceipt(message.id)
      if (!this.current(epoch) || this.opts.busy()) break
      if (received) {
        this.opts.store.updateMessage(message.id, {deliveredAt: Date.now()})
        continue
      }
      await this.opts.send(message)
      if (!this.current(epoch)) break
      const confirmed = await this.opts.hasReceipt(message.id)
      if (!this.current(epoch) || this.opts.busy()) break
      if (confirmed) {
        this.opts.store.updateMessage(message.id, {deliveredAt: Date.now()})
        if (message.status === 'completed' || message.status === 'failed') sent++
      }
    }
    return sent
  }
}
