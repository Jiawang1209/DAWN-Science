import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {团队调度器,type BotMemberRun} from '../../src/team/scheduler.js'
import {建团队,加成员,写团队,取消任务} from '../../src/team/state.js'
import {startPipeline,cancelPipeline,pipelineBudgetId} from '../../src/team/science-pipeline.js'
import {startScienceBatch,cancelScienceBatch} from '../../src/team/science-batch.js'
import {createSciencePipelineTools} from '../../src/team/science-pipeline-tools.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {AnalysisRouteSchema} from '../../src/protocol/analysis-route.js'
import type {成员轮结果} from '../../src/team/types.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
const route=AnalysisRouteSchema.parse({routeId:'route',revision:1,updatedAt:1,title:'analysis',goal:'check and analyze',dataContext:[],steps:[{id:'s',title:'model',purpose:'confirmed method',inputs:['in.csv'],outputs:['out.csv'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
const version=(path:string,text:string)=>({path,sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)})
function accepted(run:BotMemberRun,revise=false):成员轮结果{
 const kind=run.settings!.contract!.resultType!
 const data=kind==='data-summary'?{kind,rows:1,columns:[{name:'x'}],issues:[]}:kind==='model-metrics'?{kind,method:'mean',metrics:{n:1},caveats:[]}:{kind:'review' as const,verdict:revise?'revise' as const:'pass' as const,findings:revise?['fix units']:[],reviewedPaths:run.settings!.contract!.inputs}
 return{ok:!revise,output:'trusted adapter fixture',receipt:{version:1,state:revise?'blocked':'accepted',summary:'fixture',deliverables:[],...(run.settings?.versions?{versions:{version:1,inputs:run.settings.versions.inputs,outputs:kind==='model-metrics'?run.settings.contract!.outputs.map(path=>version(path,'n\n1\n')):[]}}:{}),result:{summary:'fixture',blockers:[],deliverables:[],execution:{state:'not_run',note:'fixture'},verification:{state:kind==='model-metrics'?'unreviewed':'reviewed',note:'fixture'},data:data as any}}}
}
function setup(maxRuns:number,runner?:(run:BotMemberRun)=>Promise<成员轮结果>,versioned=false){
 const root=mkdtempSync(join(tmpdir(),'science-review-budget-'));roots.push(root)
 writeFileSync(join(root,'in.csv'),'x\n1\n');writeFileSync(join(root,'out.csv'),'n\n1\n')
 const store=new OrchestrationStore(root,'parent'),service=new OrchestrationService(store,4)
 service.configureBudget({maxRuns,reserveReviewRuns:true},0)
 const calls:BotMemberRun[]=[]
 const scheduler=new 团队调度器({sessionDir:root,orchestration:service,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'must-not-run-model',args:[]})},memberRunner:async run=>{calls.push(run);return runner?runner(run):accepted(run)},onChange:()=>{}})
 const team=建团队({id:'pipeline-'+'a'.repeat(24),name:'study',goal:'approved analysis',captainSessionId:'parent'})
 for(const name of ['check','analyze','review'])加成员(team,{name,agent:name,botId:'fixture-'+name})
 startPipeline(team,'request',{route,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],...(versioned?{initialVersions:[version('in.csv','x\n1\n')]}:{}),members:{check:'check',analyze:'analyze',review:'review'},instructions:'approved',requireExecution:false,maxRevisions:1})
 写团队(scheduler.dir(team.id),team)
 return{root,store,service,scheduler,team,calls}
}
function parallelSetup(maxRuns:number,runner:(run:BotMemberRun)=>Promise<成员轮结果>,ids=['a','b']){
 const fixture=setup(maxRuns,runner,true),{root,team,scheduler}=fixture
 const definition=structuredClone(team.pipeline!.definition);team.tasks=[];delete team.pipeline
 const items=ids.map((id,index)=>{
  writeFileSync(join(root,id+'.csv'),'n\n1\n')
  if(index%2===0)return{id,label:id,definition:{...definition,outputs:[id+'.csv']}}
  const members={check:'check-'+id,analyze:'analyze-'+id,review:'review-'+id}
  for(const name of Object.values(members))加成员(team,{name,agent:name,botId:'fixture-'+name})
  return{id,label:id,definition:{...definition,outputs:[id+'.csv'],members}}
 })
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},items,['summary.json','summary.md'],undefined,Date.now(),2)
 写团队(scheduler.dir(team.id),team)
 return fixture
}
it('blocks an initial pipeline below three available runs before dispatching a backend',async()=>{
 const {store,service,scheduler,team,calls}=setup(2)
 await scheduler.踢一下(team.id)
 await vi.waitFor(()=>expect(scheduler.读(team.id).pipeline?.status).toBe('blocked'))
 expect(calls).toHaveLength(0);expect(store.budget()).toMatchObject({consumedRuns:0,inFlight:0,reviewReservedRuns:0})
 await service.close()
})
it('keeps the full legal escaped request identity bounded and distinct across retry generations',async()=>{
 const {service,team}=setup(3)
 team.pipeline!.requestId='\\"'.repeat(256)
 const id=pipelineBudgetId(team,team.pipeline!)
 expect(id.length).toBeLessThanOrEqual(512)
 team.pipeline!.budgetGeneration=1
 expect(pipelineBudgetId(team,team.pipeline!)).not.toBe(id)
 await service.close()
})
it.each([3,4,5,6])('reserves hidden parallel checkpoints independently with maxRuns=%s before any backend admission',async maxRuns=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const {root,store,service,scheduler,team,calls}=parallelSetup(maxRuns,async()=>cleanup)
 try{
  await scheduler.踢一下(team.id)
  if(maxRuns<6){
   expect(scheduler.读(team.id).scienceBatch?.status).toBe('blocked')
   expect(calls).toHaveLength(0);expect(store.budget()).toMatchObject({consumedRuns:0,reviewReservedRuns:0})
  }else{
   await vi.waitFor(()=>expect(calls).toHaveLength(2))
   const budget=store.budget()
   expect(budget).toMatchObject({consumedRuns:2,reviewReservedRuns:2,inFlight:2})
   expect(new Set(budget.reviewReservations?.map(r=>r.key)).size).toBe(2)
   const raw=JSON.parse(readFileSync(join(root,'orchestration/state.json'),'utf8'))
   expect(new Set(raw.budget.active.map((a:any)=>a.reviewAdmission.key)).size).toBe(2)
   scheduler.中止全部(team.id);scheduler.改(team.id,t=>cancelScienceBatch(t))
   expect(store.budget().reviewReservedRuns).toBe(2)
  }
  release({ok:false,output:'drained'})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  expect(store.budget().reviewReservedRuns).toBe(0)
 }finally{release({ok:false,output:''});await service.close();await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))}
})
it.each([8,9])('counts an admitted predecessor only once when a third parallel item starts with maxRuns=%s and truncated history',async maxRuns=>{
 let release!:(value:成员轮结果)=>void,ledger:OrchestrationStore|undefined
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const {store,service,scheduler,team,calls}=parallelSetup(maxRuns,async run=>{
  if(run.member.name==='check-b'){
   for(let i=0;i<260;i++)ledger!.recordEvent({type:'budget-configured'})
   return cleanup
  }
  return accepted(run)
 },['a','b','c'])
 ledger=store
 try{
  await scheduler.踢一下(team.id)
  if(maxRuns===8){
   await vi.waitFor(()=>expect(scheduler.读(team.id).scienceBatch?.status).toBe('blocked'))
   expect(calls.some(run=>run.team.scienceBatch?.items[2]?.checkpoint?.taskIds.includes(run.taskId!))).toBe(false)
   expect(store.budget()).toMatchObject({consumedRuns:4,reviewReservedRuns:1,inFlight:1})
  }else{
   await vi.waitFor(()=>expect(calls.some(run=>run.team.scienceBatch?.items[2]?.checkpoint?.taskIds.includes(run.taskId!))).toBe(true))
   scheduler.中止全部(team.id);scheduler.改(team.id,t=>cancelScienceBatch(t))
  }
  expect(store.history().truncated).toBe(true)
  expect(store.history().events.some(event=>event.type==='started'&&event.taskAttempt?.taskId===calls.find(run=>run.member.name==='check-b')?.taskId)).toBe(false)
  release({ok:false,output:'drained'})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  expect(store.budget().reviewReservedRuns).toBe(0)
 }finally{release({ok:false,output:''});await service.close();await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))}
})
it('keeps the ordinary per-run budget behavior when the reservation policy is disabled and no live hold exists',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const {store,service,scheduler,team,calls}=parallelSetup(4,async()=>cleanup)
 service.configureBudget({maxRuns:4,reserveReviewRuns:false},store.budget().revision)
 try{
  await scheduler.踢一下(team.id);await vi.waitFor(()=>expect(calls).toHaveLength(2))
  expect(store.budget().consumedRuns).toBe(2)
  expect(store.budget().reviewReservedRuns??0).toBe(0)
  scheduler.中止全部(team.id);scheduler.改(team.id,t=>cancelScienceBatch(t))
  release({ok:false,output:'drained'})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
 }finally{release({ok:false,output:''});await service.close();await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))}
})
function restored(root:string){
 const store=new OrchestrationStore(root,'parent'),service=new OrchestrationService(store,4),calls:BotMemberRun[]=[]
 const scheduler=new 团队调度器({sessionDir:root,orchestration:service,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'must-not-run-model',args:[]})},memberRunner:async run=>{calls.push(run);return accepted(run)},onChange:()=>{}})
 const teamId='pipeline-'+'a'.repeat(24)
 const tools=createSciencePipelineTools({sessionId:'parent',调度器:scheduler,定义:()=>[],当前:{get:()=>teamId,set:()=>{}},已知模型:async()=>[],route:()=>route})
 const resume=tools.find(tool=>tool.name==='resume_science_pipeline')!
 return{store,service,scheduler,calls,resume,cancel:tools.find(tool=>tool.name==='cancel_science_pipeline')!,status:tools.find(tool=>tool.name==='science_pipeline_status')!}
}
it('retains cold recovery holds and verifies frozen input bytes before unfreezing or starting a retry',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const first=setup(4,async run=>run.settings!.contract!.resultType==='model-metrics'?cleanup:accepted(run),true)
 await first.scheduler.踢一下(first.team.id)
 await vi.waitFor(()=>expect(first.calls).toHaveLength(2))
 first.scheduler.中止全部(first.team.id);release({ok:false,output:'drained'})
 await vi.waitFor(()=>expect(first.scheduler.hasActiveTeam(first.team.id)).toBe(false));await first.service.close()
 const next=restored(first.root)
 try{
  expect(next.store.budget()).toMatchObject({consumedRuns:2,reviewReservedRuns:1,reviewRecoveryRuns:1})
  await next.scheduler.踢一下(first.team.id);expect(next.calls).toHaveLength(0)
  writeFileSync(join(first.root,'in.csv'),'x\n9\n')
  const before=next.scheduler.读(first.team.id)
  expect((await next.resume.execute('changed',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).toBe(true)
  expect(next.scheduler.读(first.team.id)).toEqual(before);expect(next.store.budget().reviewRecoveryRuns).toBe(1);expect(next.calls).toHaveLength(0)
  writeFileSync(join(first.root,'in.csv'),'x\n1\n')
  expect((await next.resume.execute('verified',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(next.scheduler.读(first.team.id).pipeline?.status).toBe('completed'))
  expect(next.calls).toHaveLength(2);expect(next.store.budget()).toMatchObject({consumedRuns:4,reviewReservedRuns:0,reviewRecoveryRuns:0})
 }finally{release({ok:false,output:''});await next.service.close()}
})
it('retries an admitted interrupted review only with fresh capacity and a new frozen budget generation',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const first=setup(3,async run=>run.settings!.contract!.resultType==='review'?cleanup:accepted(run),true)
 await first.scheduler.踢一下(first.team.id);await vi.waitFor(()=>expect(first.calls).toHaveLength(3))
 first.scheduler.中止全部(first.team.id);release({ok:false,output:'drained'})
 await vi.waitFor(()=>expect(first.scheduler.hasActiveTeam(first.team.id)).toBe(false));await first.service.close()
 const next=restored(first.root)
 try{
  const before=next.scheduler.读(first.team.id)
  expect(next.store.budget()).toMatchObject({consumedRuns:3,reviewReservedRuns:0})
  expect((await next.resume.execute('no-capacity',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).toBe(true)
  expect(next.scheduler.读(first.team.id).pipeline?.status).toBe('interrupted');expect(next.calls).toHaveLength(0)
  expect(next.store.budget().consumedRuns).toBe(3)
  next.service.configureBudget({maxRuns:4,reserveReviewRuns:true},next.store.budget().revision)
  const retry=next.scheduler.读(first.team.id)
  expect((await next.resume.execute('new-capacity',{stateRevision:retry.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(next.scheduler.读(first.team.id).pipeline?.status).toBe('completed'))
  expect(next.calls).toHaveLength(1)
  expect(next.scheduler.读(first.team.id).pipeline).toMatchObject({round:0,budgetGeneration:1})
  expect(next.store.budget()).toMatchObject({consumedRuns:4,reviewReservedRuns:0})
  expect(next.store.budget().reviewReservations?.map(r=>r.phase)).toEqual(['consumed','consumed'])
 }finally{release({ok:false,output:''});await next.service.close()}
})
it('allows an ordinary unlimited review retry after the reservation policy is disabled, preserving consumed history',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const first=setup(3,async run=>run.settings!.contract!.resultType==='review'?cleanup:accepted(run),true)
 await first.scheduler.踢一下(first.team.id);await vi.waitFor(()=>expect(first.calls).toHaveLength(3))
 first.scheduler.中止全部(first.team.id);release({ok:false,output:'drained'})
 await vi.waitFor(()=>expect(first.scheduler.hasActiveTeam(first.team.id)).toBe(false));await first.service.close()
 const next=restored(first.root)
 try{
  const history=next.store.budget().reviewReservations
  next.service.configureBudget({},next.store.budget().revision)
  const before=next.scheduler.读(first.team.id)
  expect((await next.resume.execute('policy-off',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(next.scheduler.读(first.team.id).pipeline?.status).toBe('completed'))
  expect(next.calls).toHaveLength(1)
  expect(next.store.budget()).toMatchObject({consumedRuns:4,limits:{},reviewReservedRuns:0})
  expect(next.store.budget().reviewReservations).toEqual(history)
 }finally{release({ok:false,output:''});await next.service.close()}
})
it('keeps an existing cold hold protected after disabling the policy until verified resumed stages consume it',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const first=setup(4,async run=>run.settings!.contract!.resultType==='model-metrics'?cleanup:accepted(run),true)
 await first.scheduler.踢一下(first.team.id);await vi.waitFor(()=>expect(first.calls).toHaveLength(2))
 first.scheduler.中止全部(first.team.id);release({ok:false,output:'drained'})
 await vi.waitFor(()=>expect(first.scheduler.hasActiveTeam(first.team.id)).toBe(false));await first.service.close()
 const next=restored(first.root)
 try{
  const key=next.store.budget().reviewReservations![0]!.key
  next.service.configureBudget({maxRuns:3,reserveReviewRuns:false},next.store.budget().revision)
  const before=next.scheduler.读(first.team.id)
  expect((await next.resume.execute('insufficient',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).toBe(true)
  expect(next.calls).toHaveLength(0)
  expect(next.store.budget()).toMatchObject({consumedRuns:2,reviewReservedRuns:1,reviewRecoveryRuns:1})
  next.service.configureBudget({maxRuns:4,reserveReviewRuns:false},next.store.budget().revision)
  const retry=next.scheduler.读(first.team.id)
  expect((await next.resume.execute('verified',{stateRevision:retry.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
  await vi.waitFor(()=>expect(next.scheduler.读(first.team.id).pipeline?.status).toBe('completed'))
  expect(next.calls).toHaveLength(2)
  expect(next.store.budget()).toMatchObject({consumedRuns:4,reviewReservedRuns:0})
  expect(next.store.budget().reviewReservations).toEqual([{key,stage:'review',remainingRuns:0,phase:'consumed'}])
 }finally{release({ok:false,output:''});await next.service.close()}
})
it('reconciles a terminal drained hold on explicit repeated cancel after a release write failure and restart',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const first=setup(3,async run=>run.settings!.contract!.resultType==='model-metrics'?cleanup:accepted(run),true)
 await first.scheduler.踢一下(first.team.id);await vi.waitFor(()=>expect(first.calls).toHaveLength(2))
 const failure=vi.spyOn(first.service,'releaseReviewReservation').mockImplementation(()=>{throw new Error('synthetic release write failure')})
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  first.scheduler.中止全部(first.team.id)
  first.scheduler.改(first.team.id,t=>{cancelPipeline(t);for(const task of t.tasks)if(!['completed','failed','cancelled'].includes(task.status))取消任务(t,task.id)})
  release({ok:false,output:'drained'})
  await vi.waitFor(()=>expect(first.scheduler.hasActiveTeam(first.team.id)).toBe(false));await first.service.close()
  expect(first.store.budget()).toMatchObject({consumedRuns:2,inFlight:0,reviewReservedRuns:1})
 }finally{release({ok:false,output:''});failure.mockRestore();errors.mockRestore();await first.service.close()}
 const next=restored(first.root)
 try{
  const before=next.scheduler.读(first.team.id),budget=next.store.budget()
  const stateFile=join(first.root,'orchestration/state.json'),state=readFileSync(stateFile,'utf8')
  expect(before.pipeline?.status).toBe('cancelled');expect(budget.reviewRecoveryRuns).toBe(1)
  expect((await next.status.execute('readonly',{})).isError).not.toBe(true)
  expect(readFileSync(stateFile,'utf8')).toBe(state)
  expect((await next.cancel.execute('retry-cancel',{stateRevision:before.pipeline!.stateRevision})).isError).not.toBe(true)
  expect(next.store.budget()).toMatchObject({consumedRuns:2,inFlight:0,reviewReservedRuns:0,reviewRecoveryRuns:0})
  expect(next.store.budget().reviewReservations?.[0]?.phase).toBe('released')
  const settled=readFileSync(stateFile,'utf8')
  expect((await next.cancel.execute('retry-again',{stateRevision:before.pipeline!.stateRevision})).isError).not.toBe(true)
  expect(readFileSync(stateFile,'utf8')).toBe(settled);expect(next.calls).toHaveLength(0)
 }finally{await next.service.close()}
})
it('completes check analysis and independent review with exactly three runs and no ordinary capacity left',async()=>{
 const {store,service,scheduler,team,calls}=setup(3)
 await scheduler.踢一下(team.id)
 await vi.waitFor(()=>expect(scheduler.读(team.id).pipeline?.status).toBe('completed'))
 expect(calls.map(r=>r.settings!.contract!.resultType)).toEqual(['data-summary','model-metrics','review'])
 expect(store.budget()).toMatchObject({consumedRuns:3,inFlight:0,reviewReservedRuns:0,ordinaryRemainingRuns:0})
 expect(store.budget().reviewReservations).toEqual([expect.objectContaining({phase:'consumed',remainingRuns:0})])
 await service.close()
})
it.each([4,5])('a correction round under maxRuns=%s reserves new capacity without refunding the prior review',async maxRuns=>{
 let reviews=0
 const {store,service,scheduler,team,calls}=setup(maxRuns,async run=>accepted(run,run.settings!.contract!.resultType==='review'&&reviews++===0))
 await scheduler.踢一下(team.id)
 await vi.waitFor(()=>expect(scheduler.读(team.id).pipeline?.status).toBe(maxRuns===4?'blocked':'completed'))
 expect(store.budget().consumedRuns).toBe(maxRuns===4?3:5)
 expect(calls).toHaveLength(maxRuns===4?3:5)
 expect(store.budget().reviewReservedRuns).toBe(0)
 await service.close()
})
it('retains an unused hold through cancellation until the active analysis backend cleanup settles',async()=>{
 let release!:(value:成员轮结果)=>void
 const cleanup=new Promise<成员轮结果>(resolve=>{release=resolve})
 const {store,service,scheduler,team,calls}=setup(3,async run=>run.settings!.contract!.resultType==='model-metrics'?cleanup:accepted(run))
 try{
  await scheduler.踢一下(team.id)
  await vi.waitFor(()=>expect(calls).toHaveLength(2))
  scheduler.中止全部(team.id)
  scheduler.改(team.id,t=>{cancelPipeline(t);for(const task of t.tasks)if(!['completed','failed','cancelled'].includes(task.status))取消任务(t,task.id)})
  scheduler.reconcileTerminalPipelineReservations(team.id)
  expect(store.budget()).toMatchObject({consumedRuns:2,inFlight:1,reviewReservedRuns:1})
  release({ok:true,output:'late completion must not publish'})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  expect(store.budget()).toMatchObject({consumedRuns:2,inFlight:0,reviewReservedRuns:0})
  expect(store.budget().reviewReservations?.[0]?.phase).toBe('released')
  expect(scheduler.读(team.id).pipeline?.status).toBe('cancelled')
 }finally{release({ok:false,output:''});await service.close()}
})
