import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {readRunOverview} from '../../src/orchestration/run-overview.js'
const roots:string[]=[]
afterEach(()=>{vi.useRealTimers();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(capacity=2){const root=mkdtempSync(join(tmpdir(),'dawn-budget-'));roots.push(root);const store=new OrchestrationStore(root,'p'),service=new OrchestrationService(store,capacity),child=service.register('subagent',['call','0'],'reader');return{root,store,service,child}}
const known={elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage:{input:10,output:5,cacheRead:2}}
it('limits actual admissions across continuations and restarts without resetting consumption',async()=>{
 const {root,store,service,child}=setup();let dispatched=0
 service.configureBudget({maxRuns:2},0)
 const work=async()=>{dispatched++;return{ok:true,output:'kept result',observation:known}}
 expect((await service.run(child.id,work)).ok).toBe(true)
 expect((await service.run(child.id,work)).ok).toBe(true)
 expect(await service.run(child.id,work)).toMatchObject({ok:false,error:expect.stringContaining('预算')})
 expect(dispatched).toBe(2);expect(store.get(child.id)?.result?.output).toBe('kept result')
 const restored=new OrchestrationService(new OrchestrationStore(root,'p'))
 expect(restored.budgetSnapshot()).toMatchObject({consumedRuns:2,knownTokens:34,inFlight:0})
 expect((await restored.run(child.id,work)).ok).toBe(false);expect(dispatched).toBe(2)
 expect(()=>restored.configureBudget({maxRuns:9},0)).toThrow(/版本|revision/)
 const current=restored.budgetSnapshot();restored.configureBudget({maxRuns:3},current.revision)
 expect((await restored.run(child.id,work)).ok).toBe(true)
 expect(restored.budgetSnapshot().consumedRuns).toBe(3)
 await service.close();await restored.close()
})
it('concurrent admissions cannot exceed the last remaining run',async()=>{
 const {service,child}=setup(4);service.configureBudget({maxRuns:1},0);let calls=0
 const results=await Promise.all([1,2,3].map(()=>service.run(child.id,async()=>{calls++;return{ok:true,output:''}})))
 expect(calls).toBe(1);expect(results.filter(r=>r.ok)).toHaveLength(1)
 expect(service.budgetSnapshot().consumedRuns).toBe(1);await service.close()
})
it('elapsed budget aborts then retains stopping ownership until cleanup and never starts the queue',async()=>{
 vi.useFakeTimers();const{service,child}=setup(1);service.configureBudget({maxElapsedMs:1000},0)
 const sibling=service.register('team',['t','m','1'],'sibling');let release!:()=>void,aborted=false,started=false
 const gate=new Promise<void>(r=>release=r)
 const one=service.run(child.id,async signal=>{signal.addEventListener('abort',()=>{aborted=true});await gate;return{ok:true,output:'late'}})
 const two=service.run(sibling.id,async()=>{started=true;return{ok:true,output:''}})
 try{await vi.advanceTimersByTimeAsync(1001);expect(aborted).toBe(true);expect(started).toBe(false);expect(service.controlPhase(child.id)).toBe('stopping');expect(service.hasPendingWork).toBe(true)}
 finally{release();await one;await two;await service.close()}
 expect(service.hasPendingWork).toBe(false)
 expect(service.budgetSnapshot().blocked?.message).not.toContain('正在排空')
})
it('counts known token fields once and stops new admissions at the observed boundary',async()=>{
 const{service,child}=setup();service.configureBudget({maxTokens:17},0)
 await service.run(child.id,async()=>({ok:true,output:'accepted',observation:known}))
 expect(service.budgetSnapshot()).toMatchObject({knownTokens:17,unknownRuns:0,blocked:{code:'tokens'}})
 let called=false;expect((await service.run(child.id,async()=>{called=true;return{ok:true,output:''}})).ok).toBe(false);expect(called).toBe(false)
 await service.close()
})
it('drains a concurrent sibling at the token boundary and accounts its final usage without admitting the queue',async()=>{
 const{service,child}=setup(2);service.configureBudget({maxTokens:17},0)
 const sibling=service.register('team',['t','m','1'],'sibling'),queued=service.register('bot',['t','b','2'],'queued')
 let settleFirst!:()=>void,finishCleanup!:()=>void,aborted=false,queueStarted=false
 const firstGate=new Promise<void>(resolve=>settleFirst=resolve),cleanup=new Promise<void>(resolve=>finishCleanup=resolve)
 const one=service.run(child.id,async()=>{await firstGate;return{ok:true,output:'accepted',observation:known}})
 const two=service.run(sibling.id,async signal=>{signal.addEventListener('abort',()=>aborted=true);await cleanup;return{ok:true,output:'late',observation:known}})
 const three=service.run(queued.id,async()=>{queueStarted=true;return{ok:true,output:''}})
 try{
  settleFirst();expect((await one).ok).toBe(true);expect(aborted).toBe(true)
  expect(service.controlPhase(sibling.id)).toBe('stopping');expect(service.hasPendingWork).toBe(true)
  expect((await three).ok).toBe(false);expect(queueStarted).toBe(false)
  expect(service.budgetSnapshot()).toMatchObject({consumedRuns:2,knownTokens:17,inFlight:1})
 }finally{settleFirst();finishCleanup();await Promise.all([one,two,three]);await service.close()}
 expect(service.budgetSnapshot()).toMatchObject({consumedRuns:2,knownTokens:34,inFlight:0})
})
it.each([undefined,{...known,usage:{input:10,output:5}},{...known,usage:{input:10,output:5,cacheRead:0,partial:['cacheRead'] as ('cacheRead')[]}}])('missing or partial usage is unknown, not zero',async observation=>{
 const{service,child}=setup();service.configureBudget({maxTokens:1000},0)
 await service.run(child.id,async()=>({ok:true,output:'kept',...(observation?{observation}:{})}))
 expect(service.budgetSnapshot()).toMatchObject({unknownRuns:1,blocked:{code:'unknown-usage'}})
 await service.close()
})
it('interrupted in-flight accounting is recovered once and cold reading does not write',async()=>{
 const{root,store,service,child}=setup();service.configureBudget({maxRuns:4,maxTokens:1000},0)
 store.beginRun(child.id)
 const file=join(root,'orchestration/state.json'),before=readFileSync(file,'utf8')
 expect(readRunOverview(root,'p').budget).toMatchObject({consumedRuns:1,inFlight:1})
 expect(readFileSync(file,'utf8')).toBe(before)
 const recovered=new OrchestrationService(new OrchestrationStore(root,'p'))
 expect(recovered.budgetSnapshot()).toMatchObject({consumedRuns:1,inFlight:0,unknownRuns:1})
 const twice=new OrchestrationService(new OrchestrationStore(root,'p'))
 expect(twice.budgetSnapshot().unknownRuns).toBe(1)
 await Promise.all([service.close(),recovered.close(),twice.close()])
})
it('older epochs count as legacy runs with unknown usage and do not invent a start time',async()=>{
 const{root,child,service}=setup()
 const file=join(root,'orchestration/state.json'),old=JSON.parse(readFileSync(file,'utf8'));old.children[0].epoch=4;old.children[0].state='completed';writeFileSync(file,JSON.stringify(old))
 const restored=new OrchestrationService(new OrchestrationStore(root,'p'))
 expect(restored.budgetSnapshot()).toMatchObject({legacyRuns:4,consumedRuns:4,unknownRuns:4})
 expect(restored.budgetSnapshot().startedAt).toBeUndefined()
 const rev=restored.budgetSnapshot().revision;restored.configureBudget({maxRuns:4},rev)
 expect((await restored.run(child.id,async()=>({ok:true,output:''}))).ok).toBe(false)
 await service.close();await restored.close()
})
it('a legacy result without an epoch still proves at least one unknown-usage turn',async()=>{
 const{root,service}=setup(),file=join(root,'orchestration/state.json'),old=JSON.parse(readFileSync(file,'utf8'))
 old.children[0].state='completed';old.children[0].result={ok:true,output:'legacy result'};writeFileSync(file,JSON.stringify(old))
 const restored=new OrchestrationService(new OrchestrationStore(root,'p'))
 expect(restored.budgetSnapshot()).toMatchObject({legacyRuns:1,consumedRuns:1,unknownRuns:1})
 expect(restored.budgetSnapshot().startedAt).toBeUndefined()
 await service.close();await restored.close()
})
it('non-integral or unsafe provider usage stays unknown without preventing terminal settlement',async()=>{
 const{service,child}=setup()
 expect((await service.run(child.id,async()=>({ok:true,output:'retained',observation:{...known,usage:{input:0.5,output:5,cacheRead:2}}}))).ok).toBe(true)
 expect(service.budgetSnapshot()).toMatchObject({unknownRuns:1,knownTokens:7,inFlight:0})
 await service.close()
})
it('re-arms the elapsed deadline if the wall clock moved backwards before the timer fired',async()=>{
 vi.useFakeTimers();const{service,child}=setup();service.configureBudget({maxElapsedMs:1000},0)
 let release!:()=>void,aborted=false;const gate=new Promise<void>(r=>release=r)
 const run=service.run(child.id,async signal=>{signal.addEventListener('abort',()=>{aborted=true});await gate;return{ok:true,output:''}})
 try{vi.setSystemTime(Date.now()-500);await vi.advanceTimersByTimeAsync(1000);expect(aborted).toBe(false);await vi.advanceTimersByTimeAsync(500);expect(aborted).toBe(true)}finally{release();await run;await service.close()}
})
it('checks a forward wall-clock jump promptly instead of waiting out the old long timer',async()=>{
 vi.useFakeTimers();const{service,child}=setup();service.configureBudget({maxElapsedMs:60_000},0)
 let release!:()=>void,aborted=false;const gate=new Promise<void>(r=>release=r)
 const run=service.run(child.id,async signal=>{signal.addEventListener('abort',()=>{aborted=true});await gate;return{ok:true,output:''}})
 try{vi.setSystemTime(Date.now()+120_000);await vi.advanceTimersByTimeAsync(1000);expect(aborted).toBe(true);expect(service.controlPhase(child.id)).toBe('stopping')}
 finally{release();await run;await service.close()}
})
