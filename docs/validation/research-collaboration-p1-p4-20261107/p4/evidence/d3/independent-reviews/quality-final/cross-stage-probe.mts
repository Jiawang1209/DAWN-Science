import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.ts'
import {OrchestrationService} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/service.ts'
import {currentExecutionContext} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/execution-context.ts'
import {liveRunOverview,readRunOverview,publicRunOverview} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/run-overview.ts'
import {RunOverviewSchema} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/run-overview.ts'
import {projectAgentObservation,exactTaskObservationRun} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/agent-observation.ts'
import {teamTaskTimeline} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/task-timeline.tsx'
import {selectCollaborationOutcome} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/collaboration-outcome.ts'
import {$lang} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/i18n/index.ts'
$lang.set('zh')
const root=mkdtempSync('/tmp/dawn-p14-quality-state-'),checks:string[]=[],snapshots:any[]=[]
function check(name:string,f:()=>void){f();checks.push(name);console.log('PASS '+name)}
const releases:Array<()=>void>=[]
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);releases.push(release);return{promise,release}}
const sample=(at:number,model='m')=>({version:1,availability:'available',source:'sdk-estimate',observedAt:at,provider:'p',model,usedTokens:0,contextWindow:100,contextWindowSource:'model-config'} as const)
const observation=(usage:any)=>({elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage})
let service:OrchestrationService|undefined
try{
 const store=new OrchestrationStore(root,'owner');service=new OrchestrationService(store)
 service.configureBudget({maxRuns:3,reserveReviewRuns:true},0)
 const reservation=service.reserveReviewRuns('pipeline',0)!,member=service.register('team',['team','worker','1'],'worker'),reviewer=service.register('team',['team','reviewer','1'],'reviewer')
 const q1={teamId:'team',taskId:'check',attemptId:'one',attempt:1},q2={teamId:'team',taskId:'analyze',attemptId:'two',attempt:1},q3={teamId:'team',taskId:'review',attemptId:'three',attempt:1}
 let report!:(s:unknown)=>void,bind!:any
 const one=gate(),run1=service.run(member.id,async()=>{bind=currentExecutionContext()!.bindContextRoute!;report=bind({provider:'p',model:'m'});await one.promise;return{ok:true,output:'done',observation:observation({input:10,output:2,cacheRead:1})}},undefined,q1,{key:reservation.key,stage:'check'})
 const view=()=>RunOverviewSchema.parse(publicRunOverview(liveRunOverview(service!))),projection=()=>{const s=view(),r=s.runs.find(r=>r.id===member.id)!;return projectAgentObservation(s,r)}
 const raw=()=>readFileSync(join(root,'orchestration/state.json'),'utf8')
 const budgetBefore=store.budget(),revision=service.revision
 report(sample(1))
 check('D1 sample produces valid-zero D3 current occupancy',()=>{assert.equal(projection().context.current,true);assert.equal(projection().context.percent,0)})
 check('D1 observation does not alter D2 totals or B budget/wait generation',()=>{assert.equal(projection().usage.value,'尚未结算');assert.equal(store.budget().consumedRuns,budgetBefore.consumedRuns);assert.equal(store.budget().knownTokens,budgetBefore.knownTokens);assert.equal(service!.revision,revision)})
 check('C timeline exact attempt admits D3 task observation',()=>{const s=view();assert.equal(exactTaskObservationRun(s,'owner',q1,teamTaskTimeline(s,'owner',q1).current)?.id,member.id)})
 report=bind({provider:'p',model:'new'})
 check('D1 route replacement revokes D3 current occupancy retaining only history',()=>{assert.equal(projection().context.current,false);assert.equal(projection().context.percent,undefined);assert.equal(projection().context.historical,true)})
 report({...sample(2,'new'),availability:'unknown',source:'unknown',usedTokens:undefined,reason:'sdk-unavailable'})
 // Strict schema rejects the extra usedTokens key; then use the actual unknown protocol shape.
 const {usedTokens:_,...unknown}=sample(2,'new');report({...unknown,availability:'unknown',source:'unknown',reason:'sdk-unavailable'})
 check('Host-current unknown sample never creates D3 meter or value zero',()=>{assert.equal(view().runs[0]!.contextObservation!.current,true);assert.equal(projection().context.current,false);assert.equal(projection().context.value,'未知');assert.equal(projection().context.percent,undefined)})
 one.release();await run1
 check('D2 settlement sums input/output separate from B input/output/cache formula',()=>{assert.equal(projection().usage.value,'12 tokens');assert.equal(projection().usage.cacheRead,'1 tokens');assert.equal(store.budget().knownTokens,13);assert.equal(store.budget().consumedRuns,1)})
 const two=gate(),controller=new AbortController(),oldReport=report
 const run2=service.run(member.id,async()=>{report=currentExecutionContext()!.bindContextRoute!({provider:'p',model:'m'});await two.promise;return{ok:true,output:'partial',observation:observation({input:5,output:3})}},controller.signal,q2,{key:reservation.key,stage:'analyze'})
 report({...sample(3),usedTokens:30})
 check('C old task may not borrow D3 new assignment sample',()=>{const s=view();assert.equal(exactTaskObservationRun(s,'owner',q1,teamTaskTimeline(s,'owner',q1).current),undefined);assert.equal(exactTaskObservationRun(s,'owner',q2,teamTaskTimeline(s,'owner',q2).current)?.epoch,2)})
 check('B holds review admission despite ordinary remaining zero',()=>{const b=store.budget();assert.equal(b.consumedRuns,2);assert.equal(b.reviewReservedRuns,1);assert.equal(b.ordinaryRemainingRuns,0)})
 controller.abort();oldReport({...sample(999,'new'),usedTokens:999});report({...sample(999),usedTokens:999})
 check('C stopping simultaneously revokes D3 current and preserves D2 prior totals until settle',()=>{assert.equal(view().runs[0]!.phase,'stopping');assert.equal(projection().context.current,false);assert.equal(projection().context.percent,undefined);assert.equal(projection().usage.value,'12 tokens');assert.equal(projection().context.sample!.usedTokens,30);assert.equal(selectCollaborationOutcome(view()).state,'stopping')})
 check('B prevents releasing held reservation while active prior stage drains',()=>assert.throws(()=>service!.releaseReviewReservation(reservation.key)))
 two.release();await run2
 check('D2 cancelled known deltas settle once preserving cache lower bound and B unknown',()=>{const u=store.get(member.id)!.usageTotals!;assert.equal(u.input,15);assert.equal(u.output,5);assert.equal(u.cacheRead,1);assert.deepEqual(u.partial,['cacheRead']);assert.equal(u.settledEpochs,2);assert.equal(u.unknownEpochs,1);assert.equal(projection().usage.value,'20 tokens');assert.equal(projection().usage.cacheRead,'至少 1 tokens');assert.equal(store.budget().knownTokens,21);assert.equal(store.budget().unknownRuns,1)})
 const three=gate(),run3=service.run(reviewer.id,async()=>{await three.promise;return{ok:true,output:'done',observation:observation({input:0,output:0,cacheRead:0})}},undefined,q3,{key:reservation.key,stage:'review'})
 check('B review consumes held reservation without refunding predecessor or duplicate ledger',()=>{const b=store.budget();assert.equal(b.reviewReservedRuns,0);assert.equal(b.consumedRuns,3);assert.equal(b.inFlight,1)})
 three.release();await run3
 check('C execution completion without contract receipt never becomes final scientific accepted',()=>assert.notEqual(selectCollaborationOutcome(view()).state,'accepted'))
 const settledBytes=raw();check('D2 duplicate old settlement is rejected atomically',()=>{assert.throws(()=>store.settleRun(member.id,2,{ok:true,output:'duplicate',observation:observation({input:999,output:999,cacheRead:999})},false));assert.equal(raw(),settledBytes)})
 check('D3 repeated live and disk projections never persist or charge',()=>{for(let i=0;i<30;i++){const s=i%2?view():readRunOverview(root,'owner');for(const r of s.runs)projectAgentObservation(s,r)}assert.equal(raw(),settledBytes)})
 snapshots.push(view());await service.close();service=undefined
 const reopened=new OrchestrationStore(root,'owner'),disk=RunOverviewSchema.parse(publicRunOverview(readRunOverview(root,'owner')))
 check('Restart history preserves settled totals and B counts without restoring D3 current',()=>{assert.deepEqual(reopened.get(member.id)!.usageTotals,store.get(member.id)!.usageTotals);assert.equal(reopened.budget().consumedRuns,3);assert.equal(reopened.budget().knownTokens,21);for(const r of disk.runs)assert.equal(projectAgentObservation(disk,r).context.current,false)})
 snapshots.push(disk)
 const recoveryDir=mkdtempSync('/tmp/dawn-p14-quality-recovery-')
 try{
  const interrupted=new OrchestrationStore(recoveryDir,'owner');interrupted.configureBudget({maxRuns:3,reserveReviewRuns:true},0)
  const held=interrupted.reserveReviewRuns('recovery-pipeline',0)!,c=interrupted.register('team',['t','a','1'],'a'),q={teamId:'t',taskId:'x',attemptId:'x1',attempt:1},a={key:held.key,stage:'check' as const}
  interrupted.bindReviewAdmission(c.id,a,q);const epoch=interrupted.beginRun(c.id,q,a)
  interrupted.observeContext({ownerSessionId:'owner',childId:c.id,epoch,sample:sample(1)})
  const restored=new OrchestrationStore(recoveryDir,'owner'),bytes=readFileSync(join(recoveryDir,'orchestration/state.json'),'utf8')
  check('B recovery hold plus D2 unknown epoch survive first restore',()=>{assert.equal(restored.budget().reviewRecoveryRuns,1);assert.equal(restored.budget().consumedRuns,1);assert.equal(restored.budget().unknownRuns,1);assert.equal(restored.get(c.id)!.usageTotals!.settledEpochs,1);assert.equal(restored.get(c.id)!.usageTotals!.unknownEpochs,1)})
  const again=new OrchestrationStore(recoveryDir,'owner')
  check('B/D2 repeated recovery is idempotent and disk never current',()=>{assert.equal(readFileSync(join(recoveryDir,'orchestration/state.json'),'utf8'),bytes);assert.equal(again.get(c.id)!.usageTotals!.settledEpochs,1);const s=readRunOverview(recoveryDir,'owner');assert.equal(projectAgentObservation(s,s.runs[0]!).context.current,false)})
 }finally{rmSync(recoveryDir,{recursive:true,force:true})}
 console.log(JSON.stringify({status:'PASS',checks:checks.length,names:checks,snapshots},null,2))
}catch(error){console.error(error);process.exitCode=1}finally{for(const release of releases)release();await service?.close();rmSync(root,{recursive:true,force:true})}
