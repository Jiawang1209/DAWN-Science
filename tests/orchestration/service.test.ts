import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'

const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
function setup(capacity = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-coordinator-')); roots.push(dir)
  const store = new OrchestrationStore(dir, 'p')
  return {store, service: new OrchestrationService(store, capacity)}
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const gate = () => {let release!: () => void; const promise = new Promise<void>(resolve => {release = resolve}); return {promise, release}}

describe('shared execution ownership', () => {
  it('shares capacity across backends and serializes each child', async () => {
    const {store, service} = setup(2)
    const a = store.register('subagent', ['c', '0'], 'a'), b = store.register('bot', ['t', 'b', '1'], 'b'), c = store.register('team', ['t', 'c', '1'], 'c')
    let active = 0, peak = 0
    const started: string[] = [], gates = [gate(), gate(), gate(), gate()]
    const work = (name: string, index: number) => async () => {
      started.push(name); peak = Math.max(peak, ++active)
      await gates[index]!.promise; active--; return {ok: true, output: name}
    }
    const runs = [service.run(a.id, work('a1', 0)), service.run(a.id, work('a2', 1)), service.run(b.id, work('b', 2)), service.run(c.id, work('c', 3))]
    await tick(); expect(started).toEqual(['a1', 'b'])
    gates[0]!.release(); await tick(); expect(started).toEqual(['a1', 'b', 'a2'])
    gates[1]!.release(); gates[2]!.release(); gates[3]!.release()
    expect((await Promise.all(runs)).map(r => r.output)).toEqual(['a1', 'a2', 'b', 'c'])
    expect(peak).toBe(2)
    expect(store.get(a.id)).toMatchObject({epoch: 2, state: 'completed', result: {output: 'a2'}})
    await service.close()
  })

  it('cancels queued work without dispatch and preserves sibling execution', async () => {
    const {store, service} = setup(1)
    const a = store.register('subagent', ['a'], 'a'), b = store.register('team', ['b'], 'b')
    const first = gate(), ctrl = new AbortController(); let dispatched = false
    const run = service.run(a.id, async () => {await first.promise; return {ok: true, output: 'a'}})
    const queued = service.run(b.id, async () => {dispatched = true; return {ok: true, output: 'b'}}, ctrl.signal)
    ctrl.abort(); expect((await queued).ok).toBe(false); expect(dispatched).toBe(false)
    first.release(); expect((await run).ok).toBe(true); await service.close()
  })

  it('closes admission synchronously, aborts work and awaits backend cleanup exactly once', async () => {
    const {store, service} = setup(1)
    const a = store.register('bot', ['a'], 'a'), b = store.register('team', ['b'], 'b')
    const cleanup = gate(); let aborted = false, cleaned = false, dispatched = false
    const run = service.run(a.id, async signal => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => {aborted = true; resolve()}, {once: true}))
      await cleanup.promise; cleaned = true; return {ok: true, output: 'late result'}
    })
    const queued = service.run(b.id, async () => {dispatched = true; return {ok: true, output: 'b'}})
    await tick()
    let closed = false
    const closing = service.close(); void closing.then(() => {closed = true})
    expect(service.close()).toBe(closing)
    await expect(service.run(b.id, async () => ({ok: true, output: ''}))).rejects.toThrow(/closed/)
    await tick(); expect(aborted).toBe(true); expect(closed).toBe(false); expect(dispatched).toBe(false)
    cleanup.release(); await closing
    expect(cleaned).toBe(true); expect((await run).ok).toBe(false); expect((await queued).ok).toBe(false)
    expect(store.get(a.id)?.state).toBe('cancelled')
    expect(store.get(a.id)?.result?.output).not.toBe('late result')
  })

  it('a failed run does not poison the next turn and stale epochs refuse to overwrite', async () => {
    const {store, service} = setup(1)
    const a = store.register('subagent', ['a'], 'a')
    expect(await service.run(a.id, async () => {throw new Error('provider failed')})).toMatchObject({ok: false, error: 'provider failed'})
    expect(await service.run(a.id, async () => ({ok: true, output: 'recovered'}))).toMatchObject({ok: true})
    expect(() => store.update(a.id, {result: {ok: true, output: 'stale'}}, 1)).toThrow(/Stale/)
    expect(store.get(a.id)?.result?.output).toBe('recovered')
    await service.close()
  })
})
it('keeps only diagnostic metadata after abort, with current-epoch binding and no stale queued cancellation trace',async()=>{
 const {store,service}=setup(1),a=store.register('subagent',['trace','0'],'reader'),b=store.register('bot',['blocker'],'b')
 const trace={records:[{toolCallId:'actual-read',name:'read',status:'done' as const,execution:'not_observed' as const,path:'in.csv'}],omitted:0}
 const ctrl=new AbortController(),cleanup=gate()
 const run=service.run(a.id,async()=>{await cleanup.promise;return{ok:true,output:'late',trace,receipt:{version:1 as const,state:'accepted' as const,summary:'late',deliverables:[]}}},ctrl.signal)
 ctrl.abort();cleanup.release();const outcome=await run
 expect(outcome).toMatchObject({ok:false,output:'',trace});expect(outcome.receipt).toBeUndefined()
 const {liveRunOverview}=await import('../../src/orchestration/run-overview.js')
 expect(liveRunOverview(service).runs.find(r=>r.id===a.id)?.trace).toEqual(trace)
 const wait=gate(),busy=service.run(b.id,async()=>{await wait.promise;return{ok:true,output:''}})
 const queuedCtrl=new AbortController(),queued=service.run(a.id,async()=>({ok:true,output:''}),queuedCtrl.signal)
 queuedCtrl.abort();await queued
 expect(store.get(a.id)?.result?.trace).toEqual(trace)
 expect(liveRunOverview(service).runs.find(r=>r.id===a.id)?.trace).toBeUndefined()
 wait.release();await busy;await service.close()
})
it.each(['abort','close'])('queued continuation %s cannot expose the prior active turn trace as its cancellation',async(action)=>{
 const {store,service}=setup(1),a=store.register('subagent',['a'],'a'),b=store.register('bot',['b'],'b'),one=gate(),two=gate(),controller=new AbortController()
 const trace={records:[{toolCallId:'previous-turn',name:'read',status:'done' as const,execution:'not_observed' as const}],omitted:0}
 const first=service.run(a.id,async()=>{await one.promise;return{ok:true,output:'previous',trace}})
 const blocker=service.run(b.id,async()=>{await two.promise;return{ok:true,output:''}})
 const next=service.run(a.id,async()=>({ok:true,output:'must not run'}),controller.signal)
 one.release();await first;await tick()
 let closing:Promise<void>|undefined
 if(action==='abort')controller.abort();else closing=service.close()
 await next
 const {liveRunOverview}=await import('../../src/orchestration/run-overview.js')
 try{
  expect(liveRunOverview(service).runs.find(r=>r.id===a.id)?.trace).toBeUndefined()
  expect(store.get(a.id)?.result?.trace).toEqual(trace)
 }finally{two.release();await blocker;await(closing??service.close())}
})
