import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {reviewReservationKey} from '../../src/orchestration/budget.js'

const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
function setup(capacity = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-coordinator-')); roots.push(dir)
  const store = new OrchestrationStore(dir, 'p')
  return {store, service: new OrchestrationService(store, capacity)}
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const gate = () => {let release!: () => void; const promise = new Promise<void>(resolve => {release = resolve}); return {promise, release}}

it('admits its protected review after ordinary work has spent every unreserved execution run',async()=>{
 const {store,service}=setup(1)
 service.configureBudget({maxRuns:3,reserveReviewRuns:true},0)
 const reservation=store.reserveReviewRuns('pipeline',0)!,key=reservation.key
 for(const [index,stage] of (['check','analyze'] as const).entries()){
  const child=store.register('team',['team',stage,'1'],stage),attempt={teamId:'team',taskId:stage,attemptId:'attempt-'+stage,attempt:1},admission={key,stage}
  store.bindReviewAdmission(child.id,admission,attempt)
  store.settleRun(child.id,store.beginRun(child.id,attempt,admission),{ok:true,output:'done'},false)
  expect(store.budget().consumedRuns).toBe(index+1)
 }
 const ordinary=store.register('subagent',['ordinary'],'ordinary')
 expect((await service.run(ordinary.id,async()=>({ok:true,output:'must not start'}))).ok).toBe(false)
 const reviewer=store.register('team',['team','review','1'],'review'),attempt={teamId:'team',taskId:'review',attemptId:'attempt-review',attempt:1},admission={key,stage:'review' as const}
 store.bindReviewAdmission(reviewer.id,admission,attempt)
 expect(await service.run(reviewer.id,async()=>({ok:true,output:'reviewed'}),undefined,attempt,admission)).toMatchObject({ok:true,output:'reviewed'})
 expect(store.budget()).toMatchObject({consumedRuns:3,reviewReservedRuns:0,inFlight:0})
 await service.close()
})
it('keeps a queued protected review when lowering the limit blocks ordinary queued work',async()=>{
 const {store,service}=setup(1)
 service.configureBudget({maxRuns:4,reserveReviewRuns:true},0)
 const key=store.reserveReviewRuns('pipeline',0)!.key,wait=gate(),busy=store.register('subagent',['busy'],'busy')
 const active=service.run(busy.id,async()=>{await wait.promise;return{ok:true,output:'done'}})
 const ordinary=store.register('subagent',['ordinary'],'ordinary'),queued=service.run(ordinary.id,async()=>({ok:true,output:'must not run'}))
 const child=store.register('team',['team','review','1'],'review'),attempt={teamId:'team',taskId:'review',attemptId:'review',attempt:1},admission={key,stage:'review' as const}
 store.bindReviewAdmission(child.id,admission,attempt)
 const review=service.run(child.id,async()=>({ok:true,output:'reviewed'}),undefined,attempt,admission)
 service.configureBudget({maxRuns:2,reserveReviewRuns:true},store.budget().revision)
 expect((await queued).ok).toBe(false)
 wait.release();await active
 expect((await review).ok).toBe(true)
 expect(store.budget().consumedRuns).toBe(2)
 await service.close()
})
it('does not release an unused review hold until matching queued and cancelled work has drained',async()=>{
 const {store,service}=setup(1)
 service.configureBudget({maxRuns:4,reserveReviewRuns:true},0)
 const key=store.reserveReviewRuns('pipeline',0)!.key,wait=gate(),busy=store.register('subagent',['busy'],'busy')
 const active=service.run(busy.id,async()=>{await wait.promise;return{ok:true,output:'done'}})
 const child=store.register('team',['team','analysis','1'],'analysis'),attempt={teamId:'team',taskId:'analysis',attemptId:'analysis',attempt:1},admission={key,stage:'analyze' as const},ctrl=new AbortController()
 store.bindReviewAdmission(child.id,admission,attempt)
 const queued=service.run(child.id,async()=>({ok:true,output:'must not run'}),ctrl.signal,attempt,admission)
 expect(()=>service.releaseReviewReservation(key)).toThrow(/排空|queued|在途/)
 ctrl.abort();await queued
 service.releaseReviewReservation(key)
 expect(store.budget()).toMatchObject({consumedRuns:1,reviewReservedRuns:0})
 wait.release();await active;await service.close()
})

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

it('keeps independent stable observation stamps and isolates persistent observer failures',async()=>{
 const {service}=setup(),initial=service.observation,waitRevision=service.revision,seen:number[]=[]
 expect(service.observation).toEqual(initial)
 service.subscribeObservation(()=>{throw Error('observer failure')})
 const off=service.subscribeObservation(stamp=>seen.push(stamp.revision))
 let woke=false;const abort=new AbortController(),waiting=service.wait(waitRevision,60000,abort.signal).then(()=>{woke=true})
 service.invalidateObservation();await Promise.resolve()
 expect(woke).toBe(false);expect(service.revision).toBe(waitRevision)
 expect(service.observation).toEqual({observerId:initial.observerId,revision:initial.revision+1})
 service.register('subagent',['a'],'a');expect(seen).toEqual([1,2]);off()
 service.invalidateObservation();expect(seen).toEqual([1,2])
 abort.abort();await waiting;await service.close()
 expect(setup().service.observation.observerId).not.toBe(initial.observerId)
})
it('keeps only exact active admission task proof after bounded history truncation',async()=>{
 const {service,store}=setup(),child=service.register('team',['team','member','1'],'member'),hold=gate()
 const binding={teamId:'team',taskId:'task',attemptId:'attempt',attempt:1}
 const run=service.run(child.id,async()=>{await hold.promise;return{ok:true,output:''}},undefined,binding)
 for(let i=0;i<270;i++)store.recordEvent({type:'cancel-requested',childId:child.id,epoch:1})
 expect(store.history()).toMatchObject({truncated:true});expect(store.history().events.some(e=>e.taskAttempt)).toBe(false)
 binding.attemptId='forged'
 const proof=service.currentTaskAttempt(child.id)!;expect(proof.attemptId).toBe('attempt');proof.attemptId='forged'
 expect(service.currentTaskAttempt(child.id)?.attemptId).toBe('attempt')
 store.update(child.id,{epoch:2});expect(service.currentTaskAttempt(child.id)).toBeUndefined();store.update(child.id,{epoch:1})
 hold.release();await run;expect(service.currentTaskAttempt(child.id)).toBeUndefined();await service.close()
})
it('disposes observation listeners after final close settlement',async()=>{
 const {service}=setup(),seen:number[]=[];service.subscribeObservation(s=>seen.push(s.revision))
 await service.close();const count=seen.length;service.invalidateObservation();expect(seen).toHaveLength(count)
})
it('does not expose schema-valid task bindings rejected by child ownership projection',async()=>{
 const {service}=setup(),hold=gate(),binding={teamId:'team',taskId:'task',attemptId:'attempt',attempt:1}
 const ordinary=service.register('subagent',['call','0'],'ordinary'),foreign=service.register('team',['other','m','1'],'foreign')
 const first=service.run(ordinary.id,async()=>{await hold.promise;return{ok:true,output:''}},undefined,binding)
 const second=service.run(foreign.id,async()=>{await hold.promise;return{ok:true,output:''}},undefined,binding)
 expect(service.currentTaskAttempt(ordinary.id)).toBeUndefined();expect(service.currentTaskAttempt(foreign.id)).toBeUndefined()
 hold.release();await first;await second;await service.close()
})
it('publishes active external cancellation as stopping before cleanup drains without advancing wait revision',async()=>{
 const {store,service}=setup(1),child=store.register('subagent',['cancel-observation'],'cancel observation'),controller=new AbortController(),cleanup=gate()
 const work=service.run(child.id,async signal=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));await cleanup.promise;return{ok:true,output:'cleanup complete'}},controller.signal)
 await tick()
 const before=service.observation,revision=service.revision,seen:string[]=[]
 const off=service.subscribeObservation(()=>seen.push(service.controlPhase(child.id)))
 let woke=false;const waiter=service.wait(revision,1000).then(()=>{woke=true})
 try{
 controller.abort();await Promise.resolve()
 expect(service.controlPhase(child.id)).toBe('stopping')
 expect(seen).toEqual(['stopping'])
 expect(service.observation).toEqual({observerId:before.observerId,revision:before.revision+1})
 expect(service.revision).toBe(revision);expect(woke).toBe(false)
 cleanup.release();await work;await waiter
 expect(seen.at(-1)).toBe('drained');expect(woke).toBe(true)
 }finally{controller.abort();cleanup.release();await work;await waiter;off();await service.close()}
})
