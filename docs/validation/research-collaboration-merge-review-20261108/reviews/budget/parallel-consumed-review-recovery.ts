import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {团队调度器,type BotMemberRun} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/scheduler.js'
import {建团队,加成员,写团队,取消任务} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/state.js'
import {startPipeline,cancelPipeline,pipelineBudgetId} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/science-pipeline.js'
import {startScienceBatch,cancelScienceBatch} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/science-batch.js'
import {createSciencePipelineTools} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/science-pipeline-tools.js'
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.js'
import {OrchestrationService} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/service.js'
import {AnalysisRouteSchema} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/analysis-route.js'
import type {成员轮结果} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/types.js'
const roots:string[]=[]

const route=AnalysisRouteSchema.parse({routeId:'route',revision:1,updatedAt:1,title:'analysis',goal:'check and analyze',dataContext:[],steps:[{id:'s',title:'model',purpose:'confirmed method',inputs:['in.csv'],outputs:['out.csv'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
const version=(path:string,text:string)=>({path,sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)})
function accepted(run:BotMemberRun,revise=false):成员轮结果{
 const kind=run.settings!.contract!.resultType!
 const data=kind==='data-summary'?{kind,rows:1,columns:[{name:'x'}],issues:[]}:kind==='model-metrics'?{kind,method:'mean',metrics:{n:1},caveats:[]}:{kind:'review' as const,verdict:revise?'revise' as const:'pass' as const,findings:revise?['fix units']:[],reviewedPaths:run.settings!.contract!.inputs}
 return{ok:!revise,output:'trusted adapter fixture',receipt:{version:1,state:revise?'blocked':'accepted',summary:'fixture',deliverables:[],...(run.settings?.versions?{versions:{version:1,inputs:run.settings.versions.inputs,outputs:kind==='model-metrics'?run.settings.contract!.outputs.map(path=>version(path,'n\n1\n')):[]}}:{}),result:{summary:'fixture',blockers:[],deliverables:[],execution:{state:'not_run',note:'fixture'},verification:{state:kind==='model-metrics'?'unreviewed':'reviewed',note:'fixture'},data:data as any}}}
}
function setup(maxRuns:number,runner?:(run:BotMemberRun)=>Promise<成员轮结果>,versioned=false){
 const root=mkdtempSync('/tmp/p14-budget-review.lBhhti/scenario-');roots.push(root)
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

async function until(predicate:()=>boolean,label:string){for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('timeout '+label)}
let release!:(value:成员轮结果)=>void
const gate=new Promise<成员轮结果>(resolve=>{release=resolve})
const first=parallelSetup(9,async run=>run.settings!.contract!.resultType==='review'?gate:accepted(run))
let nextService:OrchestrationService|undefined
try {
 await first.scheduler.踢一下(first.team.id)
 await until(()=>first.calls.filter(run=>run.settings!.contract!.resultType==='review').length===2,'both reviews')
 assert.equal(first.store.budget().consumedRuns,6)
 assert.equal(first.store.budget().reviewReservedRuns,0)
 first.scheduler.中止全部(first.team.id)
 release({ok:false,output:'drained'})
 await until(()=>!first.scheduler.hasActiveTeam(first.team.id),'drain')
 await first.service.close()
 const store=new OrchestrationStore(first.root,'parent'),service=new OrchestrationService(store,4),calls:BotMemberRun[]=[]
 nextService=service
 const scheduler=new 团队调度器({sessionDir:first.root,orchestration:service,定义:()=>[],跑:{context:{cwd:first.root,provider:'p',model:'m'},childOf:()=>({command:'must-not-run-model',args:[]})},memberRunner:async run=>{calls.push(run);return accepted(run)},onChange:()=>{}})
 const tools=createSciencePipelineTools({sessionId:'parent',调度器:scheduler,定义:()=>[],当前:{get:()=>first.team.id,set:()=>{}},已知模型:async()=>[],route:()=>route})
 const resume=tools.find(t=>t.name==='resume_science_batch')!
 const before=scheduler.读(first.team.id)
 const result=await resume.execute('review-resume',{stateRevision:before.scienceBatch!.stateRevision,acknowledgeInterrupted:true})
 assert.notEqual(result.isError,true,JSON.stringify(result))
 await until(()=>['completed','blocked'].includes(scheduler.读(first.team.id).scienceBatch!.status),'terminal')
 const final=scheduler.读(first.team.id)
 assert.equal(final.scienceBatch!.status,'completed',final.scienceBatch!.reason)
 assert.equal(calls.length,2)
 assert.equal(store.budget().consumedRuns,9) // Two retried reviews plus fixed host summary are execution runs.
 assert.equal(store.budget().reviewReservations?.length,4)
 assert.equal(store.budget().reviewReservedRuns,0)
 assert.ok(final.scienceBatch!.items.every(item=>item.completed?.budgetGeneration===1))
 console.log(JSON.stringify({scenario:'parallel consumed-review recovery',status:final.scienceBatch!.status,calls:calls.length,budget:store.budget(),generations:final.scienceBatch!.items.map(i=>i.completed?.budgetGeneration)},null,2))
} finally {
 release({ok:false,output:'drained'})
 await first.service.close()
 await nextService?.close()
 for(const root of roots)rmSync(root,{recursive:true,force:true})
}
