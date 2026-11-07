import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {readRunOverview,liveRunOverview} from '../../src/orchestration/run-overview.js'
import {sessionUsage} from '../../src/runtime/session-usage.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(){const root=mkdtempSync(join(tmpdir(),'dawn-p14-d2-totals-'));roots.push(root);const store=new OrchestrationStore(root,'owner'),child=store.register('subagent',['call','0'],'reader');return{root,store,child,file:join(root,'orchestration/state.json')}}
const observed=(usage:import('../../src/protocol/task-observation.js').TaskUsage)=>({ok:true,output:'done',observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage}})
const zero={source:'host-epoch-deltas',settledEpochs:0,unknownEpochs:0,partial:[]}
it.each(['error','aborted'] as const)('durably settles mixed known usage plus a no-receipt %s as one incomplete epoch and one budget charge',stopReason=>{
 const{root,store,child}=setup();store.configureBudget({maxTokens:100},0)
 const epoch=store.beginRun(child.id),entry=(usage:object,reason='stop')=>({type:'message',message:{role:'assistant',stopReason:reason,usage}})
 const usage=sessionUsage([entry({input:10,output:2,cacheRead:1}),entry({input:0,output:0,cacheRead:0},stopReason)],true)
 const outcome={...observed(usage),ok:false,error:'second request has no provider usage receipt'}
 store.settleRun(child.id,epoch,outcome,stopReason==='aborted')
 const totals={...zero,input:10,output:2,cacheRead:1,settledEpochs:1,unknownEpochs:1,lastSettledEpoch:epoch,partial:['input','output','cacheRead']}
 expect(store.get(child.id)?.usageTotals).toEqual(totals)
 expect(store.budget()).toMatchObject({consumedRuns:1,knownTokens:13,unknownRuns:1,inFlight:0,blocked:{code:'unknown-usage'}})
 expect(()=>store.settleRun(child.id,epoch,outcome,false)).toThrow(/Stale|settled/)
 const restored=new OrchestrationStore(root,'owner')
 expect(restored.get(child.id)?.usageTotals).toEqual(totals)
 expect(restored.budget()).toMatchObject({consumedRuns:1,knownTokens:13,unknownRuns:1,inFlight:0})
 expect(readRunOverview(root,'owner').runs[0]?.usageTotals).toEqual(totals)
})
it('an unverified SDK zero remains absent rather than becoming a known cache sum',()=>{
 const{store,child}=setup(),epoch=store.beginRun(child.id)
 store.settleRun(child.id,epoch,observed({input:12,output:8,cacheRead:0,partial:['cacheRead']}),false)
 expect(store.get(child.id)?.usageTotals).toEqual({...zero,input:12,output:8,partial:['cacheRead'],settledEpochs:1,unknownEpochs:1,lastSettledEpoch:1})
})
it('tracks two settled deltas once, keeps last result distinct, and charges the existing budget formula once',()=>{
 const{root,store,child}=setup();expect(store.get(child.id)?.usageTotals).toEqual(zero)
 const a=store.beginRun(child.id);store.settleRun(child.id,a,observed({input:10,output:4,cacheRead:2}),false)
 expect(()=>store.settleRun(child.id,a,observed({input:999}),false)).toThrow(/settled|Stale/)
 const b=store.beginRun(child.id);expect(()=>store.settleRun(child.id,a,observed({input:999}),false)).toThrow(/Stale/)
 expect(store.get(child.id)?.usageTotals).toMatchObject({input:10,settledEpochs:1})
 store.settleRun(child.id,b,observed({input:20,output:7,cacheRead:3}),false)
 const totals={...zero,input:30,output:11,cacheRead:5,settledEpochs:2,lastSettledEpoch:2}
 expect(store.get(child.id)?.usageTotals).toEqual(totals)
 expect(store.get(child.id)?.result?.observation?.usage?.input).toBe(20)
 expect(store.budget()).toMatchObject({consumedRuns:2,knownTokens:46,unknownRuns:0,inFlight:0})
 expect(readRunOverview(root,'owner').runs[0]?.usageTotals).toEqual(totals)
})
it('preserves every known field and marks missing, partial, invalid and overflow deltas incomplete',()=>{
 const{store,child}=setup()
 for(const usage of [{input:10,output:4},{input:5,output:6,cacheRead:2,partial:['input'] as const},{input:0.5,output:3,cacheRead:0},{input:Number.MAX_SAFE_INTEGER,output:2,cacheRead:0}]){
  const epoch=store.beginRun(child.id);store.settleRun(child.id,epoch,observed({...usage,partial:usage.partial?[...usage.partial]:undefined}),false)
 }
 expect(store.get(child.id)?.usageTotals).toEqual({source:'host-epoch-deltas',input:15,output:15,cacheRead:2,partial:['input','cacheRead'],settledEpochs:4,unknownEpochs:4,lastSettledEpoch:4})
 expect(store.get(child.id)?.state).toBe('completed')
})
it('counts admitted failures/cancellation/unknown usage, but a queued cancellation has no settled usage',async()=>{
 const{store,child}=setup(),service=new OrchestrationService(store,1),queued=service.register('team',['t','m','g1'],'member')
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const run=service.run(child.id,async()=>{await gate;return{ok:false,output:'',error:'cancelled'}})
 const abort=new AbortController(),pending=service.run(queued.id,async()=>observed({input:99,output:99,cacheRead:99}),abort.signal)
 abort.abort();release();await Promise.all([run,pending]);await service.close()
 expect(store.get(child.id)?.usageTotals).toMatchObject({settledEpochs:1,unknownEpochs:1,partial:['input','output','cacheRead']})
 expect(store.get(queued.id)?.usageTotals).toEqual(zero)
 const epoch=store.beginRun(child.id);store.settleRun(child.id,epoch,{...observed({input:7}),ok:false},true)
 expect(store.get(child.id)?.usageTotals).toMatchObject({input:7,settledEpochs:2,unknownEpochs:2})
})
it('recovers admitted unfinished epochs as unknown once in the same durable recovery and never counts queued work',()=>{
 const{root,store,child}=setup(),queued=store.register('team',['t','m','g1'],'queued')
 store.beginRun(child.id);store.update(queued.id,{state:'queued'})
 const recovered=new OrchestrationStore(root,'owner'),once=recovered.get(child.id)?.usageTotals
 expect(once).toEqual({...zero,partial:['input','output','cacheRead'],settledEpochs:1,unknownEpochs:1,lastSettledEpoch:1})
 expect(recovered.get(queued.id)?.usageTotals).toEqual(zero)
 expect(new OrchestrationStore(root,'owner').get(child.id)?.usageTotals).toEqual(once)
 expect(recovered.budget()).toMatchObject({consumedRuns:1,unknownRuns:1,inFlight:0})
})
it('legacy admitted recovery records one tracked unknown epoch without backfilling historical observations',()=>{
 const{root,store,child,file}=setup();store.beginRun(child.id)
 const raw=JSON.parse(readFileSync(file,'utf8'));delete raw.children[0].usageTotals;raw.children[0].result=observed({input:900,output:800,cacheRead:700});writeFileSync(file,JSON.stringify(raw))
 const recovered=new OrchestrationStore(root,'owner')
 expect(recovered.get(child.id)?.usageTotals).toEqual({...zero,legacyHistory:true,partial:['input','output','cacheRead'],settledEpochs:1,unknownEpochs:1,lastSettledEpoch:1})
 expect(new OrchestrationStore(root,'owner').get(child.id)?.usageTotals).toEqual(recovered.get(child.id)?.usageTotals)
 expect(recovered.budget()).toMatchObject({consumedRuns:1,unknownRuns:1,knownTokens:0})
})
it('forced cancellation preserves the proved final delta while unsupported Bot usage stays absent',async()=>{
 const{store,child}=setup(),service=new OrchestrationService(store),abort=new AbortController()
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const pending=service.run(child.id,async()=>{await gate;return observed({input:3,output:2,cacheRead:1})},abort.signal)
 abort.abort();release();expect(await pending).toMatchObject({ok:false,observation:{usage:{input:3}}})
 expect(store.get(child.id)?.usageTotals).toMatchObject({settledEpochs:1,unknownEpochs:0,input:3,output:2,cacheRead:1})
 const remote=service.register('bot',['remote-team','acp-bot','g1'],'remote')
 await service.run(remote.id,async()=>({ok:true,output:'unsupported adapter has no scoped usage'}))
 expect(store.get(remote.id)?.usageTotals).toEqual({...zero,partial:['input','output','cacheRead'],settledEpochs:1,unknownEpochs:1,lastSettledEpoch:1})
 expect(service.budgetSnapshot()).toMatchObject({knownTokens:6,consumedRuns:2,unknownRuns:1});await service.close()
})
it('projects legacy history without migration or backfilling last result and distinguishes fresh tracked zero',()=>{
 const{root,store,child,file}=setup(),old=JSON.parse(readFileSync(file,'utf8'))
 delete old.children[0].usageTotals;old.children[0].epoch=4;old.children[0].state='completed';old.children[0].result=observed({input:100,output:50,cacheRead:9})
 writeFileSync(file,JSON.stringify(old));const before=readFileSync(file,'utf8'),overview=readRunOverview(root,'owner')
 expect(overview.runs[0]?.usageTotals).toEqual({...zero,partial:['input','output','cacheRead'],legacyHistory:true})
 expect(readFileSync(file,'utf8')).toBe(before)
 const restored=new OrchestrationStore(root,'owner'),epoch=restored.beginRun(child.id);restored.settleRun(child.id,epoch,observed({input:1,output:2,cacheRead:0}),false)
 expect(restored.get(child.id)?.usageTotals).toEqual({...zero,partial:['input','output','cacheRead'],legacyHistory:true,input:1,output:2,cacheRead:0,settledEpochs:1,unknownEpochs:0,lastSettledEpoch:5})
 expect(store.get(child.id)?.usageTotals).toEqual(zero)
})
it('same generation accumulates assignments while a new generation starts empty',()=>{
 const{store}=setup(),a=store.register('team',['team','member','g1'],'member')
 for(let i=0;i<2;i++){const same=store.register('team',['team','member','g1'],'member'),epoch=store.beginRun(same.id);store.settleRun(same.id,epoch,observed({input:2,output:1,cacheRead:0}),false)}
 expect(store.get(a.id)?.usageTotals).toMatchObject({input:4,output:2,settledEpochs:2})
 expect(store.register('team',['team','member','g2'],'member').usageTotals).toEqual(zero)
})
it('legacy running without an admission ledger never invents settled usage or budget charges',()=>{
 const{root,file}=setup(),old=JSON.parse(readFileSync(file,'utf8'));delete old.children[0].usageTotals;old.children[0].state='running';old.children[0].epoch=3
 writeFileSync(file,JSON.stringify(old));const restored=new OrchestrationStore(root,'owner'),before=readFileSync(file,'utf8')
 expect(readRunOverview(root,'owner').runs[0]?.usageTotals).toEqual({...zero,legacyHistory:true,partial:['input','output','cacheRead']})
 expect(restored.list()[0]?.usageTotals).toBeUndefined();expect(restored.budget()).toMatchObject({legacyRuns:3,unknownRuns:3,knownTokens:0})
 new OrchestrationStore(root,'owner');expect(readFileSync(file,'utf8')).toBe(before)
})
it('context samples and pure overview reads do not change usage or budget',async()=>{
 const{store,child}=setup(),service=new OrchestrationService(store),epoch=store.beginRun(child.id),budget=store.budget()
 const before=store.get(child.id)?.usageTotals
 store.observeContext({ownerSessionId:'owner',childId:child.id,epoch,sample:{version:1,availability:'unknown',source:'unknown',provider:'p',model:'m',reason:'no-current-route-anchor',observedAt:Date.now()}})
 expect(liveRunOverview(service).runs[0]?.usageTotals).toEqual(before);expect(store.budget()).toMatchObject({knownTokens:budget.knownTokens,unknownRuns:budget.unknownRuns,consumedRuns:budget.consumedRuns,revision:budget.revision})
 store.settleRun(child.id,epoch,{ok:false,output:''},true);await service.close()
})
