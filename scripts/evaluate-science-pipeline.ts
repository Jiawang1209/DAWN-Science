import {runScienceIncremental} from './evaluate-science-incremental.js'
/** Offline actual-Pi baseline. Never loads credentials or calls a remote inference provider. */
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {SubagentExecutor} from '../src/subagent/executor.js'
import {resolveTaskSettings} from '../src/subagent/task-tools.js'
import {captureFileVersions} from '../src/artifacts/task-versions.js'
import {建团队,加成员,写团队} from '../src/team/state.js'
import {startPipeline,resumePipeline} from '../src/team/science-pipeline.js'
import {recoverTeamExecution} from '../src/team/recovery.js'
import {团队调度器} from '../src/team/scheduler.js'
import {OrchestrationService} from '../src/orchestration/service.js'
import {OrchestrationStore} from '../src/orchestration/store.js'
import {AnalysisRouteSchema} from '../src/protocol/analysis-route.js'
import {stageContract} from '../src/protocol/science-pipeline.js'
import {scienceTemplate} from '../src/team/science-templates.js'
import {baselineFingerprint,baselineUsage,verifyMeanFixture,SCIENCE_BASELINE_CASES,judgeScienceBaseline,summarizeScienceBaseline,type ScienceBaselineCase,type ScienceBaselineRow} from '../src/evaluation/science-pipeline.js'
import type {TaskObservation} from '../src/protocol/task-observation.js'
// @ts-expect-error shared localhost provider
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error deterministic fixture
import {scienceTemplateScenario} from './mock-science-template.mjs'
async function until(test:()=>boolean,timeout=20000){const deadline=Date.now()+timeout;while(!test()){if(Date.now()>deadline)throw new Error('评测等待超时');await new Promise<void>(done=>setTimeout(done,10))}}
export async function runScienceBaseline(outputDir:string){
 const entry=resolve('dist/electron/subagent-child.js');if(!existsSync(entry))throw new Error('缺少 Pi 子进程构建；标准 npm run evaluate:science 命令会先重建')
 const rows:ScienceBaselineRow[]=[]
 const sourceFiles=['src/artifacts/task-versions.ts','src/team/science-pipeline.ts','src/team/scheduler.ts','src/subagent/executor.ts','scripts/mock-science-template.mjs','scripts/evaluate-science-pipeline.ts','src/team/science-templates.ts','src/protocol/science-template.ts','src/protocol/task-contract.ts','src/protocol/file-versions.ts','src/orchestration/task-submission.ts','src/subagent/task-tools.ts','src/subagent/child-task.ts','src/subagent/child.ts','src/team/runner.ts','src/bot/output-locks.ts']
 const sourceFingerprint=baselineFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')]))
 for(const scenario of SCIENCE_BASELINE_CASES)for(const mode of ['single','multi'] as const)rows.push(await run(scenario,mode,entry))
 const report={version:1,generatedAt:new Date().toISOString(),sourceFiles,sourceFingerprint,childBuildFingerprint:baselineFingerprint(readFileSync(entry,'utf8')),configuration:{interventionsAreScripted:true,inputPreservationBaseline:'bytes after scripted external fault injection, before executor admission',provider:'deepseek',model:'deepseek-flash',endpoint:'localhost deterministic fixture',fixture:'x=1,2,3,4,5 m',method:'arithmetic mean',sameOutputs:true,parallelism:1},...summarizeScienceBaseline(rows)}
 mkdirSync(outputDir,{recursive:true});writeFileSync(join(outputDir,'baseline.json'),JSON.stringify(report,null,2)+'\n')
 const md=['# 单／多 agent 本地评测基线',...report.limitations,'','| 场景 | 模式 | 验收 | 独立真值通过 | 成功 | 错误放行 | 输入保留 | 请求数 | 阶段/尝试 | 重做 | 人工介入 | 可见 token | 未知用量任务 | 耗时 ms |','|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.scenario} | ${r.mode} | ${r.accepted} | ${r.groundTruthPassed} | ${r.success} | ${r.falseAcceptance} | ${r.inputPreserved} | ${r.modelRequests} | ${r.stages} | ${r.rework} | ${r.interventions} | ${r.visibleTokens}${r.partialUsage?'（部分）':''} | ${r.unknownUsageTasks} | ${r.elapsedMs} |`),'',`Source fingerprint: ${sourceFingerprint}`].join('\n')+'\n'
 writeFileSync(join(outputDir,'baseline.md'),md)
 if(rows.some(r=>!r.success||r.falseAcceptance))throw new Error('评测存在失败或错误放行，请查看 baseline.json')
 return report
}
async function run(scenario:ScienceBaselineCase,mode:'single'|'multi',entry:string):Promise<ScienceBaselineRow>{
 const root=mkdtempSync(join(tmpdir(),'dawn-science-baseline-')),scenarioProvider=scienceTemplateScenario({mode:scenario==='reviewer-repair'?'revise':scenario==='missing-units'?'missing-units':'pass',delayMs:scenario==='stop-resume'?3000:0}),server=await startMockInferenceServer({scenario:scenarioProvider}),modelsPath=join(root,'models.json')
 const original='x\n1\n2\n3\n4\n5\n';writeFileSync(join(root,'in.csv'),original);writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const template={id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:scenario==='missing-units'?'unknown; block':'m',missingValues:'block'}
 const recipe=scienceTemplate(template,'results',['in.csv']),versions=await captureFileVersions(root,['in.csv']),route=AnalysisRouteSchema.parse({routeId:'baseline',revision:1,updatedAt:1,title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['in.csv'],outputs:recipe.outputs,dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const definition={route,stepId:'s',inputs:['in.csv'],outputs:recipe.outputs,initialVersions:versions,members:{check:'check',analyze:'analyze',review:'review'},instructions:recipe.instructions,requireExecution:true,maxRevisions:1}
 const definitions=['check','analyze','review'].map(name=>({name,description:'fixture',systemPrompt:'Use the frozen contract and approved method.',filePath:'/'+name,tools:['read','write','bash']}))
 const context={cwd:root,provider:'deepseek',model:'deepseek-flash',modelsPath,credentials:{deepseek:'offline-mock'}},childOf=()=>({command:process.execPath,args:[entry],env:{ELECTRON_RUN_AS_NODE:'1'}})
 if(scenario==='changed-input')writeFileSync(join(root,'in.csv'),'x\n9\n8\n7\n6\n5\n')
 const expectedInput=readFileSync(join(root,'in.csv'),'utf8'),started=Date.now(),observations:(TaskObservation|undefined)[]=[];let accepted=false,stages=0,rework=0,interventions=0,service:OrchestrationService|undefined,scheduler:团队调度器|undefined,teamId:string|undefined
 try{
 if(mode==='single'){
  const contract=stageContract(definition,'analyze'),settings={...resolveTaskSettings(contract,'allow-all',definitions[1]!.tools),versions:{version:1 as const,inputs:versions}}
  const executor=new SubagentExecutor({context:{...context,agentDirOf:i=>join(root,'single',String(i))},prepareTask:()=>settings,childOf})
  const execute=(signal?:AbortSignal,repair=false)=>executor.run({mode:'single',agent:'analyze',task:recipe.instructions+(repair?'\n修正轮次 1/1；共同宿主真值验收发现单位缺失，请补充单位说明后按同一方法重新执行。':'')},definitions,signal)
  let result
  if(scenario==='stop-resume'){
   const ctrl=new AbortController(),pending=execute(ctrl.signal)
   await until(()=>scenarioProvider.executionRequested)
   ctrl.abort();const stopped=await pending;observations.push(stopped.results[0]?.observation);stages++;interventions++;rework++
   result=await execute()
  }else result=await execute()
  stages++;observations.push(result.results[0]?.observation)
  if(scenario==='reviewer-repair'){
   const first=JSON.parse(readFileSync(join(root,'results/result.json'),'utf8'))
   if(verifyMeanFixture(first))throw new Error('单 agent 未遇到约定的同一初始缺陷')
   rework++;result=await execute(undefined,true);stages++;observations.push(result.results[0]?.observation)
  }
  accepted=result.results[0]?.receipt?.state==='accepted'
 }else{
  service=new OrchestrationService(new OrchestrationStore(join(root,'session'),'baseline'),1)
  scheduler=new 团队调度器({sessionDir:join(root,'session'),定义:()=>definitions,跑:{context,childOf},orchestration:service,onChange:()=>{}})
  const team=建团队({id:'baseline',name:'baseline',goal:recipe.instructions,captainSessionId:'baseline'});for(const name of ['check','analyze','review'])加成员(team,{name,agent:name})
  startPipeline(team,'request',definition,(_m,c)=>resolveTaskSettings(c,'allow-all',['read','write','bash']));写团队(scheduler.dir(team.id),team);teamId=team.id
  await scheduler.踢一下(team.id)
  if(scenario==='stop-resume'){
   await until(()=>scenarioProvider.executionRequested)
   scheduler.中止全部(team.id);await until(()=>!scheduler!.hasActiveTeam(team.id));const saved=scheduler.读(team.id);recoverTeamExecution(saved);写团队(scheduler.dir(team.id),saved)
   scheduler.改(team.id,t=>resumePipeline(t,true));scheduler.resumeTeam(team.id);await scheduler.踢一下(team.id);interventions++
  }
  await until(()=>['completed','blocked'].includes(scheduler!.读(team.id).pipeline!.status));await until(()=>!scheduler!.hasActiveTeam(team.id))
  const final=scheduler.读(team.id);accepted=final.pipeline!.status==='completed';stages=final.tasks.length;rework=Math.max(0,final.tasks.filter(t=>t.contract?.resultType==='model-metrics').length-1);observations.push(...final.tasks.map(t=>t.observation))
 }
 let actual:unknown;try{actual=JSON.parse(readFileSync(join(root,'results/result.json'),'utf8'))}catch{}
 const judged=judgeScienceBaseline(scenario,accepted,actual,readFileSync(join(root,'in.csv'),'utf8')===expectedInput)
 const comparisonFingerprint=baselineFingerprint({scenario,input:original,versions,template,model:'deepseek-flash',provider:'deterministic-local',outputs:recipe.outputs,tools:['read','write','bash'],tier:'allow-all',source:'same-scenario-fixture',finalCriteria:{n:5,mean:3,unit:'m',preserveInput:true,expectedBlocking:['missing-units','changed-input']},maxCorrections:1,injectedFault:scenario==='reviewer-repair'?'same initial result lacks unit; same one-correction allowance':scenario})
 return{scenario,mode,comparisonFingerprint,accepted,...judged,elapsedMs:Date.now()-started,modelRequests:server.requests.length,stages,rework,interventions,...baselineUsage(observations)}
 }finally{if(scheduler&&teamId)scheduler.中止全部(teamId);await service?.close();await server.close();rmSync(root,{recursive:true,force:true})}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const destination=resolve(process.argv[2]??'docs/validation/incremental-science-20261105/evaluation')
 runScienceBaseline(destination).then(async r=>{const incremental=await runScienceIncremental(destination);console.log(JSON.stringify({destination,byMode:r.byMode,incrementalRows:incremental.rows.length}))}).catch(error=>{console.error(error);process.exitCode=1})
}
