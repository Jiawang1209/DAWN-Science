import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationDelivery} from '../../src/orchestration/delivery.js'
const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
function pending() {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-delivery-')); roots.push(dir)
  const store = new OrchestrationStore(dir, 'p'), child = store.register('subagent', ['c', '0'], 'a')
  const message = store.enqueue(child.id, 'r1', 'work', true)
  store.updateMessage(message.id, {status: 'completed', outcome: {ok: true, output: 'result'}})
  return {dir, store, message}
}
it('defers while busy and acknowledges only a durable parent receipt', async () => {
  const {store, message} = pending(); let busy = true, sends = 0, received = false
  const delivery = new OrchestrationDelivery({store, busy: () => busy, hasReceipt: async () => received, send: async () => {sends++; received = true}})
  await delivery.flush(); expect(sends).toBe(0)
  busy = false; await Promise.all([delivery.flush(), delivery.flush()])
  expect(sends).toBe(1); expect(store.message(message.id)?.deliveredAt).toBeTypeOf('number')
  await delivery.flush(); expect(sends).toBe(1)
})
it('reconciles a crash after send before acknowledgement without resending or executing the child', async () => {
  const {dir, store, message} = pending(); let sends = 0
  const delivery = new OrchestrationDelivery({store: new OrchestrationStore(dir, 'p'), busy: () => false, hasReceipt: async () => true, send: async () => {sends++}})
  await delivery.flush(); expect(sends).toBe(0)
  expect(new OrchestrationStore(dir, 'p').message(message.id)?.deliveredAt).toBeDefined()
  expect(store.message(message.id)?.deliveredAt).toBeUndefined()
})
it('retains failed or unconfirmed notifications and stops sending after close', async () => {
  const {store, message} = pending(); let fail = true, received = false, sends = 0
  const delivery = new OrchestrationDelivery({store, busy: () => false, hasReceipt: async () => received, send: async () => {sends++; if (fail) throw new Error('unavailable')}})
  await expect(delivery.flush()).rejects.toThrow('unavailable')
  expect(store.message(message.id)?.deliveredAt).toBeUndefined()
  fail = false; await delivery.flush(); expect(store.message(message.id)?.deliveredAt).toBeUndefined()
  received = true; await delivery.flush(); expect(sends).toBe(2)
  delivery.close(); await delivery.flush(); expect(sends).toBe(2)
})
it('records cancellation notices without requesting an automatic parent turn', async () => {
  const {store, message} = pending(); let received = false
  store.updateMessage(message.id, {status: 'cancelled', outcome: {ok: false, output: '', error: '用户已停止'}})
  const delivery = new OrchestrationDelivery({store, busy: () => false, hasReceipt: async () => received, send: async () => {received = true}})
  expect(await delivery.flush()).toBe(0)
  expect(store.message(message.id)?.deliveredAt).toBeDefined()
})
it('drains results arriving during an in-flight flush instead of losing its wakeup', async () => {
  const {store, message} = pending()
  let release!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  const receipts = new Set<string>(), sent: string[] = []
  const delivery = new OrchestrationDelivery({store, busy: () => false, hasReceipt: async id => receipts.has(id), send: async item => {
    sent.push(item.id); if (item.id === message.id) await gate; receipts.add(item.id)
  }})
  const first = delivery.flush()
  await new Promise<void>(resolve => setImmediate(resolve))
  const second = store.enqueue(message.childId, 'r2', 'next', true)
  store.updateMessage(second.id, {status: 'completed', outcome: {ok: true, output: 'next result'}})
  const concurrent = delivery.flush(); release()
  expect(await first).toBe(2); await concurrent
  expect(sent).toEqual([message.id, second.id])
  expect(store.message(second.id)?.deliveredAt).toBeDefined()
})

it.each(['suspend', 'suspend-resume', 'close'] as const)('does not request a parent turn after %s during an in-flight receipt check', async mode => {
  const {store, message} = pending()
  let release!: () => void, checking!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  const entered = new Promise<void>(resolve => {checking = resolve})
  let checks = 0
  const delivery = new OrchestrationDelivery({store, busy: () => false, send: async () => {}, hasReceipt: async () => {
    if (++checks === 1) return false
    checking(); await gate; return true
  }})
  const flushing = delivery.flush()
  await entered
  if (mode === 'close') delivery.close()
  else {delivery.suspend(); if (mode === 'suspend-resume') delivery.resume()}
  release()
  expect(await flushing).toBe(0)
  expect(store.message(message.id)?.deliveredAt).toBeUndefined()
  if (mode !== 'close') {
    delivery.resume(); await delivery.flush()
    expect(store.message(message.id)?.deliveredAt).toBeDefined()
  }
})
