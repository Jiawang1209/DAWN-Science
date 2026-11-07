import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {TaskContractSchema,acceptTaskResult} from '../../src/orchestration/task-contract.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {建团队,加成员,加任务,写团队} from '../../src/team/state.js'
const roots:string[]=[]
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const observation={elapsedMs:5,submissionAttempts:0,invalidSubmissions:0,usage:{input:10,output:2,cacheRead:1}}
const trace={records:[{toolCallId:'read-before-acceptance',name:'read',status:'done' as const,execution:'not_observed' as const}],omitted:0}
const evidence=trace.records.map(record=>({...record,result:'checked'}))
const contract=TaskContractSchema.parse({access:'read-only'})
const output=JSON.stringify({summary:'completed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read only'},verification:{state:'unreviewed',note:'not scientific review'}})
const definitions=[{name:'worker',description:'worker',systemPrompt:'worker',filePath:'/unused'}]
function setup(){
 const cwd=mkdtempSync(join(tmpdir(),'dawn-acceptance-cancel-'));roots.push(cwd)
 const store=new OrchestrationStore(cwd,'owner'),service=new OrchestrationService(store)
 const observe=store.observeStage.bind(store)
 let cancelled=false
 store.observeStage=(...args)=>{const changed=observe(...args);if(args[2]==='acceptance'){cancelled=true;service.interrupt(args[0])}return changed}
 const settings={...resolveTaskSettings(contract,'allow-all',['read']),versions:{version:1 as const,inputs:[]}}
 const childOf=()=>({command:process.execPath,args:['-e',`process.stdin.once('data',()=>{console.log(JSON.stringify(${JSON.stringify({type:'done',ok:true,output,observation,evidence})}));process.exit(0)})`]})
 expect(acceptTaskResult(contract,output,[],cwd).state).toBe('accepted')
 return{cwd,store,service,settings,childOf,wasCancelled:()=>cancelled}
}
function assertSettled(store:OrchestrationStore){
 const child=store.list()[0]!
 expect(child).toMatchObject({state:'cancelled',epoch:1,resultEpoch:1,usageTotals:{input:10,output:2,cacheRead:1,settledEpochs:1,unknownEpochs:0,lastSettledEpoch:1},result:{ok:false,output:'',observation,trace}})
 expect(child.result?.receipt).toBeUndefined()
 expect(store.budget()).toMatchObject({consumedRuns:1,knownTokens:13,unknownRuns:0,inFlight:0})
 expect(()=>store.settleRun(child.id,1,{ok:true,output,observation},false)).toThrow(/Stale|settled/)
 const reopened=new OrchestrationStore(store.sessionDir,store.ownerSessionId)
 expect(reopened.get(child.id)?.usageTotals).toEqual(child.usageTotals)
 expect(reopened.budget()).toMatchObject({consumedRuns:1,knownTokens:13,inFlight:0})
}
it('keeps received child usage and trace when cancellation interrupts host version acceptance',async()=>{
 const x=setup(),executor=new SubagentExecutor({context:{cwd:x.cwd,provider:'p',model:'m',agentDirOf:i=>join(x.cwd,String(i))},orchestration:{service:x.service,addressOf:i=>['call',String(i)]},prepareTask:()=>x.settings,childOf:x.childOf})
 try{
  const result=(await executor.run({mode:'single',agent:'worker',task:'read'},definitions)).results[0]!
  expect(x.wasCancelled()).toBe(true);expect(result).toMatchObject({ok:false,output:'',observation,trace});expect(result.receipt).toBeUndefined();expect(result.versions).toBeUndefined()
  assertSettled(x.store)
 }finally{await x.service.close()}
})
it('keeps received team usage through cancelled version acceptance without adopting a late receipt',async()=>{
 const x=setup(),team=建团队({id:'team',name:'team',goal:'read',captainSessionId:'owner'})
 加成员(team,{name:'reader',agent:'worker'});加任务(team,{id:'task',subject:'read',assignee:'reader',contract})
 const scheduler=new 团队调度器({orchestration:x.service,sessionDir:x.cwd,定义:()=>definitions,跑:{childOf:x.childOf,context:{cwd:x.cwd,provider:'p',model:'m'}},prepareTask:()=>x.settings,onChange:()=>{}})
 try{
  写团队(scheduler.dir(team.id),team);await scheduler.踢一下(team.id)
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  expect(x.wasCancelled()).toBe(true);assertSettled(x.store)
  expect(scheduler.读(team.id).tasks[0]?.receipt).toBeUndefined()
 }finally{await x.service.close()}
})
