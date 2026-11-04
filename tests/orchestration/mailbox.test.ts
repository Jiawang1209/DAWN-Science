import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {OrchestrationMailbox} from '../../src/orchestration/mailbox.js'
const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const setup = () => {const dir = mkdtempSync(join(tmpdir(), 'dawn-mailbox-')); roots.push(dir); const store = new OrchestrationStore(dir, 'p'); return {dir, store, service: new OrchestrationService(store, 1)}}

it('durably deduplicates messages and serially resumes the same child', async () => {
  const {store, service} = setup(), seen: string[] = []
  const child = store.register('subagent', ['c', '0'], 'a')
  const mailbox = new OrchestrationMailbox(service, async (_child, message) => {seen.push(message.text); return {ok: true, output: `answer:${message.text}`}})
  const first = mailbox.send(child.id, 'one', 'r1')
  expect(mailbox.send(child.id, 'one', 'r1').id).toBe(first.id)
  expect(() => mailbox.send(child.id, 'different', 'r1')).toThrow(/conflict/)
  mailbox.send(child.id, 'two', 'r2')
  await mailbox.settled()
  expect(seen).toEqual(['one', 'two'])
  expect(store.messages().map(m => m.status)).toEqual(['completed', 'completed'])
  expect(store.get(child.id)?.epoch).toBe(2)
  await mailbox.close()
})

it('recovers completed and interrupted messages without rerunning side effects', async () => {
  const {dir, store} = setup()
  const child = store.register('subagent', ['c', '0'], 'a')
  const done = store.enqueue(child.id, 'done', 'finished', true)
  store.updateMessage(done.id, {status: 'completed', outcome: {ok: true, output: 'existing'}})
  const uncertain = store.enqueue(child.id, 'uncertain', 'maybe wrote files', true)
  store.updateMessage(uncertain.id, {status: 'running'})
  const fresh = store.register('subagent', ['other', '0'], 'b')
  store.enqueue(fresh.id, 'queued', 'never started', true)
  const recovered = new OrchestrationStore(dir, 'p'), seen: string[] = []
  expect(recovered.message(uncertain.id)?.status).toBe('interrupted')
  const mailbox = new OrchestrationMailbox(new OrchestrationService(recovered), async (_child, message) => {seen.push(message.text); return {ok: true, output: 'new'}})
  mailbox.resume()
  await mailbox.settled()
  expect(seen).toEqual(['never started'])
  expect(recovered.message(done.id)?.outcome?.output).toBe('existing')
  await mailbox.close()
})

it('interrupts only the named child and pauses its remaining inbox until a new send', async () => {
  const {store, service} = setup(), seen: string[] = []
  const child = store.register('subagent', ['c', '0'], 'a')
  const mailbox = new OrchestrationMailbox(service, async (_child, message, signal) => {
    seen.push(message.text)
    if (message.text === 'long') await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), {once: true}))
    return {ok: true, output: message.text}
  })
  const first = mailbox.send(child.id, 'long', 'r1'); mailbox.send(child.id, 'queued', 'r2')
  await tick(); expect(mailbox.interrupt(child.id)).toBe(true)
  await mailbox.settled()
  expect(store.message(first.id)?.status).toBe('cancelled')
  expect(seen).toEqual(['long'])
  mailbox.send(child.id, 'new', 'r3'); await mailbox.settled()
  expect(seen).toEqual(['long', 'queued', 'new'])
  await mailbox.close()
  expect(() => mailbox.send(child.id, 'after close', 'r4')).toThrow(/closed/)
})

it('preserves an explicit pause across reopen and never restarts a stopped inbox', async () => {
  const {dir, store, service} = setup()
  const child = store.register('subagent', ['c', '0'], 'a')
  const mailbox = new OrchestrationMailbox(service, async () => ({ok: true, output: 'unused'}))
  store.enqueue(child.id, 'queued', 'waiting', true)
  mailbox.interrupt(child.id)
  const recovered = new OrchestrationStore(dir, 'p'); let executed = false
  const next = new OrchestrationMailbox(new OrchestrationService(recovered), async () => {executed = true; return {ok: true, output: ''}})
  next.resume(); await next.settled(); expect(executed).toBe(false)
  await mailbox.close(); await next.close()
})

it('still aborts every live backend when close cannot persist queued cancellation', async () => {
  const {dir, store, service} = setup()
  const child = store.register('subagent', ['c', '0'], 'a')
  let aborted = false
  const mailbox = new OrchestrationMailbox(service, async (_child, _message, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => {aborted = true; resolve()}, {once: true}))
    return {ok: true, output: 'late'}
  }, () => {}, () => {})
  mailbox.send(child.id, 'long', 'r1'); mailbox.send(child.id, 'queued', 'r2')
  await tick()
  rmSync(join(dir, 'orchestration'), {recursive: true})
  const {writeFileSync} = await import('node:fs')
  writeFileSync(join(dir, 'orchestration'), 'not a directory')
  let closing: Promise<void>
  try {closing = mailbox.close()} catch {closing = Promise.reject(new Error('synchronous failure'))}
  await expect(closing).rejects.toThrow()
  expect(aborted).toBe(true)
})
