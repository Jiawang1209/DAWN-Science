/** Actual Pi / frozen Team execution; the caller supplies either a local fixture or capped live route. */
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {researchTasks,judgeResearch,researchFingerprint,summarizeResearch,notRunResearch,type ResearchTask,type ResearchRow,type ResearchTerminal} from '../src/evaluation/research-tasks.js'
import {baselineUsage} from '../src/evaluation/science-pipeline.js'
import {sameFileVersions} from '../src/protocol/file-versions.js'
import {captureFileVersions} from '../src/artifacts/task-versions.js'
import {SubagentExecutor} from '../src/subagent/executor.js'
import {resolveTaskSettings} from '../src/subagent/task-tools.js'
import {scienceTemplate} from '../src/team/science-templates.js'
import {stageContract} from '../src/protocol/science-pipeline.js'
import {AnalysisRouteSchema} from '../src/protocol/analysis-route.js'
import {建团队,加成员,写团队} from '../src/team/state.js'
import {startPipeline} from '../src/team/science-pipeline.js'
import {团队调度器} from '../src/team/scheduler.js'
import {OrchestrationService} from '../src/orchestration/service.js'
import {OrchestrationStore} from '../src/orchestration/store.js'
import type {TaskObservation} from '../src/protocol/task-observation.js'
export interface ResearchTrial {credential:string;requests:()=>number;stats?:()=>{reserved:number;forwarded:number;denied:number;limit:number};close:()=>Promise<void>}
export interface ResearchOptions {repeats?:number;taskIds?:string[];perArmLimit?:number}
export interface ResearchRoute {beginTrial?:(limit:number)=>ResearchTrial;provider:string;model:string;modelsPath:string;credential:string;requests:()=>number;signal?:AbortSignal;kind:'live'|'fixture'}
export async function runResearchEvaluation(outputDir:string,route:ResearchRoute,options:ResearchOptions={}){
 mkdirSync(outputDir,{recursive:true})
 const repeats=options.repeats??1,tasks=researchTasks().filter(t=>!options.taskIds||options.taskIds.includes(t.id)),perArmLimit=options.perArmLimit??Math.floor(30/(2*repeats*tasks.length))
 if(!Number.isSafeInteger(repeats)||repeats<1||repeats>4||!tasks.length||!Number.isSafeInteger(perArmLimit)||perArmLimit<1||perArmLimit*2*repeats*tasks.length>30)throw new Error('Invalid paired evaluation allocation')
 if(route.kind==='live'&&!route.beginTrial)throw new Error('Live evaluation requires isolated per-arm quotas')
 const rows:ResearchRow[]=[],sourceFiles=['scripts/evaluate-research.ts','src/evaluation/research-tasks.ts','src/subagent/executor.ts','src/subagent/child.ts','src/team/science-pipeline.ts','src/team/science-acceptance.ts','src/orchestration/task-submission.ts','src/orchestration/task-contract.ts','src/protocol/task-contract.ts','src/team/science-templates.ts','src/protocol/science-pipeline.ts','src/subagent/task-tools.ts','src/runtime/native.ts','src/runtime/pi-tool-status.ts','scripts/evaluation-request-gate.ts','src/bot/output-locks.ts']
 if(route.kind==='fixture')sourceFiles.push('scripts/mock-research.mjs')
 const sourceFingerprint=researchFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')]))
 const save=()=>{
  const report={version:1,generatedAt:new Date().toISOString(),inference:route.kind,provider:route.provider,model:route.model,requestLimit:route.kind==='live'?30:null,requestAllocation:{perArmLimit:route.beginTrial?perArmLimit:null,repeats,enforced:!!route.beginTrial,plannedArms:tasks.length*2*repeats},sourceFiles,sourceFingerprint,childBuildFingerprint:researchFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8')),tasks:tasks.map(({expected:_expected,...t})=>({...t,inputHash:researchFingerprint(t.csv)})),...summarizeResearch(rows,!!route.beginTrial)}
  writeFileSync(join(outputDir,'research.json'),JSON.stringify(report,null,2)+'\n')
  writeFileSync(join(outputDir,'research.md'),['# 代表性科研任务对照',`推理：${route.kind}；模型 ${route.provider}/${route.model}；${route.kind==='live'?'整轮最多 30 次请求':'离线夹具不消耗真实调用额度'}；每组上限 ${route.beginTrial?perArmLimit:'未强制'}；重复 ${repeats}；分区强制 ${!!route.beginTrial}。`,...report.limitations,'','| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |','|---|---|---|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.caseId} | ${r.repeat} | ${r.mode} | ${r.terminal} | ${r.success} | ${r.requests} | ${r.submissionAttempts??'未知'}/${r.invalidSubmissions??'未知'} | ${r.usage.visibleTokens} | ${r.usage.unknownUsageTasks} | ${r.elapsedMs} |`),`\n完整配对 ${report.completePairs}；不完整配对 ${report.incompletePairs}；两组均通过独立核验 ${report.qualifiedPairs}。`,'','| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |','|---|---|---|---|---|---|---|',...Object.entries(report.delivery).map(([mode,d])=>`| ${mode} | ${d.qualifiedDeliveries} | ${d.correctBlocks} | ${d.falseAcceptances} | ${route.beginTrial?d.exhausted:'不适用'} | ${d.requestsPerDelivery?.toFixed(2)??'不适用'} | ${d.msPerDelivery?.toFixed(0)??'不适用'} |`),'分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。'].join('\n')+'\n')
  return report
 }
 for(let repeat=1;repeat<=repeats;repeat++)for(const [index,task] of tasks.entries())for(const mode of ((index+repeat-1)%2?['multi','single']:['single','multi']) as ('single'|'multi')[]){
  rows.push(await runTrial(outputDir,task,mode,route,repeat,perArmLimit));save()
 }
 return save()
}
async function runTrial(out:string,task:ResearchTask,mode:'single'|'multi',route:ResearchRoute,repeat:number,perArmLimit:number):Promise<ResearchRow>{
 const fingerprint=researchFingerprint({task,provider:route.provider,model:route.model,inference:route.kind,tools:['read','write','bash'],tier:'allow-all',revisionLimit:0,outputCap:4096}),before=route.requests(),started=Date.now()
 if(route.kind==='live'&&before>=30||route.signal?.aborted)return {...notRunResearch(task,mode,fingerprint),repeat}
 const lease=route.beginTrial?.(perArmLimit),requests=lease?.requests??route.requests,armBefore=requests()
 try{
 // Each trial is retained under this explicit output, never a user workspace; no formal DB is opened.
 const root=mkdtempSync(join(out,`${task.id}-${mode}-`)),input='input.csv';writeFileSync(join(root,input),task.csv)
 const versions=await captureFileVersions(root,[input]),template={id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:task.unit??'未提供，必须阻塞，不能猜测',missingValues:'drop NA in target column only',...(task.unit?{validation:{version:1 as const,column:task.column,metric:'mean' as const,unit:task.unit,missing:task.missing,absoluteTolerance:1e-9}}:{})}
 const recipe=scienceTemplate(template,'results',[input],input),instructions=task.instructions+'\n'+recipe.instructions
 const routeRecord=AnalysisRouteSchema.parse({routeId:'research',revision:1,updatedAt:1,title:task.id,goal:task.instructions,dataContext:[],steps:[{id:'s',title:task.id,purpose:task.instructions,inputs:[input],outputs:recipe.outputs,dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const definition={route:routeRecord,stepId:'s',inputs:[input],outputs:recipe.outputs,initialVersions:versions,members:{check:'check',analyze:'analyze',review:'review'},instructions,requireExecution:true,maxRevisions:0,acceptance:recipe.acceptance}
 const context={cwd:root,provider:route.provider,model:route.model,modelsPath:route.modelsPath,credentials:{[route.provider]:lease?.credential??route.credential}},entry=resolve('dist/electron/subagent-child.js'),childOf=()=>({command:process.execPath,args:[entry],env:{ELECTRON_RUN_AS_NODE:'1'}})
 const definitions=['check','analyze','review'].map(name=>({name,description:'representative research',systemPrompt:'Follow the approved method. Use real file tools, cite actual call IDs and submit_task_result. Do not guess missing units. Batch independent tool calls when possible.',filePath:'/'+name,tools:['read','write','bash']}))
 const observations:(TaskObservation|undefined)[]=[],controller=new AbortController(),abort=()=>controller.abort()
 route.signal?.addEventListener('abort',abort,{once:true})
 if(route.signal?.aborted)controller.abort()
 const timeout=setTimeout(abort,180000);timeout.unref()
 let service:OrchestrationService|undefined,scheduler:团队调度器|undefined,terminal:ResearchTerminal='failed',reason:string|undefined
 let outputVersions:ResearchRow['versions']=[]
 let blocking:{reasons:string[];inputRead:boolean}|undefined
 try{
  if(mode==='single'){
   const contract=stageContract(definition,'analyze'),settings={...resolveTaskSettings(contract,'allow-all',definitions[1]!.tools),versions:{version:1 as const,inputs:versions}}
   const executor=new SubagentExecutor({context:{...context,agentDirOf:()=>join(root,'single')},prepareTask:()=>settings,childOf})
   const result=(await executor.run({mode:'single',agent:'analyze',task:instructions},definitions,controller.signal)).results[0]
   terminal=controller.signal.aborted?'cancelled':result?.receipt?.state==='accepted'?'accepted':result?.receipt?.state==='blocked'?'blocked':'failed'
   observations.push(result?.observation);outputVersions=result?.receipt?.versions?.outputs??[]
   const submitted=result?.receipt?.result
   blocking={reasons:submitted?.blockers??[],inputRead:!!result?.evidence?.some(e=>e.name==='read'&&e.status==='done'&&(e.input as {path?:string})?.path===input)}
   if(terminal==='failed')reason='后端或正式提交未完成；查看隔离试验产物'
  }else{
   service=new OrchestrationService(new OrchestrationStore(join(root,'session'),'research'),1)
   scheduler=new 团队调度器({sessionDir:join(root,'session'),定义:()=>definitions,跑:{context,childOf},orchestration:service,onChange:()=>{}})
   const team=建团队({id:'research',name:'research',goal:instructions,captainSessionId:'research'})
   for(const name of ['check','analyze','review'])加成员(team,{name,agent:name})
   startPipeline(team,'trial',definition,(_m,c)=>resolveTaskSettings(c,'allow-all',['read','write','bash']));写团队(scheduler.dir(team.id),team)
   await scheduler.踢一下(team.id)
   while(scheduler.读(team.id).pipeline!.status==='running'&&!controller.signal.aborted)await new Promise(r=>setTimeout(r,20))
   if(controller.signal.aborted)throw new Error('cancelled')
   while(scheduler.hasActiveTeam(team.id))await new Promise(r=>setTimeout(r,10))
   const final=scheduler.读(team.id)
   terminal=final.pipeline!.status==='completed'?'accepted':final.tasks.some(t=>t.receipt?.state==='blocked')?'blocked':'failed'
   outputVersions=final.tasks.find(t=>t.contract?.resultType==='model-metrics')?.receipt?.versions?.outputs??[]
   const checked=final.tasks.find(t=>t.contract?.resultType==='data-summary'&&t.receipt?.state==='blocked')?.receipt?.result
   blocking={reasons:[...(checked?.blockers??[]),...(checked?.data?.kind==='data-summary'?checked.data.issues:[])],inputRead:checked?.verification.state==='reviewed'&&!!checked.verification.toolCallIds?.length}
   if(terminal==='failed')reason='流程未完成；查看隔离阶段记录'
  }
 }catch{terminal=controller.signal.aborted?'cancelled':'failed';reason='执行取消或运行错误；未计为正确阻塞'}
 finally{
  clearTimeout(timeout);route.signal?.removeEventListener('abort',abort)
  try{scheduler?.中止全部('research')}finally{await service?.close()}
  if(scheduler){
   // Read after drain on both success and cancellation; completed predecessors keep their known usage.
   const final=scheduler.读('research')
   observations.push(...final.tasks.filter(t=>t.attempt>0).map(t=>t.observation))
   outputVersions=final.tasks.find(t=>t.contract?.resultType==='model-metrics')?.receipt?.versions?.outputs??[]
  }
 }
 const resultPath=join(root,'results/result.json')
 let actual:unknown;try{actual=JSON.parse(readFileSync(resultPath,'utf8'))}catch{if(existsSync(resultPath))actual=null}
 let versionMatches=terminal!=='accepted'
 if(terminal==='accepted')try{versionMatches=sameFileVersions(outputVersions,await captureFileVersions(root,recipe.outputs))}catch{}
 return{caseId:task.id,mode,repeat,fingerprint,terminal,...judgeResearch(task,terminal,actual,existsSync(join(root,input))&&readFileSync(join(root,input),'utf8')===task.csv,blocking,versionMatches),requests:requests()-armBefore,submissionAttempts:observations.reduce((n,o)=>n+(o?.submissionAttempts??0),0),invalidSubmissions:observations.reduce((n,o)=>n+(o?.invalidSubmissions??0),0),...(lease?.stats?{requestBudget:lease.stats()}:{}),elapsedMs:Date.now()-started,usage:baselineUsage(observations.length?observations:[undefined]),versions:outputVersions,...(reason?{reason}:{})}
 }finally{await lease?.close()}
}
