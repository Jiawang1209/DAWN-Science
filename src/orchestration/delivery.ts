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
  constructor(private readonly opts: DeliveryOptions) {}
  close(): void {this.closed = true}
  suspend(): void {this.suspended = true}
  resume(): void {this.suspended = false}
  flush(): Promise<number> {
    if (this.flushing) {this.requested = true; return this.flushing}
    const work = (async () => {
      let sent = 0
      do {
        this.requested = false
        sent += await this.once()
      } while (this.requested && !this.closed && !this.suspended && !this.opts.busy())
      return sent
    })().finally(() => {this.flushing = undefined})
    this.flushing = work
    return work
  }
  private async once(): Promise<number> {
    let sent = 0
    for (const message of this.opts.store.messages()) {
      if (this.closed || this.suspended || this.opts.busy()) break
      if (!message.notify || message.deliveredAt !== undefined || ['queued', 'running'].includes(message.status)) continue
      if (await this.opts.hasReceipt(message.id)) {
        this.opts.store.updateMessage(message.id, {deliveredAt: Date.now()})
        continue
      }
      if (this.closed || this.suspended || this.opts.busy()) break
      await this.opts.send(message)
      if (await this.opts.hasReceipt(message.id)) {
        this.opts.store.updateMessage(message.id, {deliveredAt: Date.now()})
        if (message.status === 'completed' || message.status === 'failed') sent++
      }
    }
    return sent
  }
}
