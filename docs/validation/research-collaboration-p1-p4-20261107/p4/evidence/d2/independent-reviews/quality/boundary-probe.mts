import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,renameSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.ts'
import {OrchestrationService} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/service.ts'
import {initialUsageTotals,settleUsageTotals} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/agent-usage-totals.ts'
import {AgentUsageTotalsSchema,USAGE_FIELDS} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/agent-usage-totals.ts'
const observed=(input:number)=>({ok:true,output:'done',observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage:{input,output:2,cacheRead:1}}})
const root=mkdtempSync(join(tmpdir(),'dawn-d2-quality-state-'))
try {
 const store=new OrchestrationStore(root,'owner'),child=store.register('bot',['team','bot','g1'],'worker'),epoch=store.beginRun(child.id)
 const before=store.get(child.id),budget=store.budget(),disk=readFileSync(join(root,'orchestration/state.json'),'utf8')
 renameSync(join(root,'orchestration'),join(root,'orchestration-backup'));writeFileSync(join(root,'orchestration'),'block directory')
 assert.throws(()=>store.settleRun(child.id,epoch,observed(7),false),/EEXIST/)
 assert.deepEqual(store.get(child.id),before);assert.equal(store.budget().knownTokens,budget.knownTokens);assert.equal(store.budget().inFlight,1)
 rmSync(join(root,'orchestration'));renameSync(join(root,'orchestration-backup'),join(root,'orchestration'));assert.equal(readFileSync(join(root,'orchestration/state.json'),'utf8'),disk)
 store.settleRun(child.id,epoch,observed(7),false);assert.equal(store.get(child.id)?.usageTotals?.input,7);assert.equal(store.budget().knownTokens,10)
 assert.throws(()=>store.settleRun(child.id,epoch,observed(7),false));assert.equal(new OrchestrationStore(root,'owner').budget().knownTokens,10)
 console.log('PASS atomic failed-write rollback, same-epoch retry, duplicate rejection and durable single charge')
 const service=new OrchestrationService(store,2),b=service.register('bot',['team','bot-b','g1'],'worker-b')
 let releaseA!:()=>void,releaseB!:()=>void
 const gateA=new Promise<void>(r=>releaseA=r),gateB=new Promise<void>(r=>releaseB=r),abort=new AbortController()
 const a1=service.run(child.id,async()=>{await gateA;return observed(3)},abort.signal)
 const a2=service.run(child.id,async()=>observed(5)),b1=service.run(b.id,async()=>{await gateB;return observed(11)})
 abort.abort();releaseB();await b1;releaseA();await Promise.all([a1,a2]);await service.close()
 assert.equal(store.get(child.id)?.usageTotals?.input,15);assert.equal(store.get(child.id)?.usageTotals?.settledEpochs,3)
 assert.equal(store.get(b.id)?.usageTotals?.input,11);assert.equal(store.budget().knownTokens,38);assert.equal(store.budget().consumedRuns,4)
 assert.equal(new OrchestrationStore(root,'owner').budget().knownTokens,38)
 console.log('PASS interleaved two-child completion, active cancellation plus queued same-child successor and reopen')
 let totals=initialUsageTotals(),seed=4319,checks=0
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed}
 for(let epoch=1;epoch<=2000;epoch++){
  const previous=structuredClone(totals),usage:Record<string,unknown>={},partial:string[]=[]
  for(const field of USAGE_FIELDS){const kind=next()%9;usage[field]=kind===0?undefined:kind===1?Number.MAX_SAFE_INTEGER:kind===2?Number.MAX_SAFE_INTEGER+1:kind===3?0.5:next()%100;if(next()%5===0)partial.push(field)}
  usage.partial=partial
  totals=settleUsageTotals(totals,epoch,{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage:usage as any})
  assert.equal(AgentUsageTotalsSchema.safeParse(totals).success,true)
  assert.deepEqual(previous.partial.filter(f=>!totals.partial.includes(f)),[])
  for(const field of USAGE_FIELDS){assert.ok(totals[field]===undefined||Number.isSafeInteger(totals[field]));assert.ok((totals[field]??0)>=(previous[field]??0));checks++}
  assert.equal(totals.settledEpochs,epoch);assert.ok(totals.unknownEpochs<=epoch)
 }
 console.log('PASS deterministic 2000-epoch numeric/partial fuzz, '+checks+' monotone safe field checks; final='+JSON.stringify(totals))
} finally {rmSync(root,{recursive:true,force:true})}
