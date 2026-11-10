import {scienceReadinessIssue} from '../src/protocol/science-acceptance.js'
import {summarizeResearchUsage,type ResearchUsageScope,type ResearchUsageSummary} from '../src/evaluation/research-usage.js'
import {researchRequestLimit,researchTrialTimeoutMs} from '../src/evaluation/research-budget.js'
import {generateResearchArrangement,PlanningInformationRequired} from './research-auto-arrangement.js'
import {freezeApprovedPlan,materializeApprovedTeam} from '../src/team/approved-plan.js'
import {serializeTaskArrangement,type TaskArrangement} from '../src/protocol/task-arrangement.js'
/** Actual Pi / frozen Team execution; the caller supplies either a local fixture or capped live route. */
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {researchSubmissionDiagnostics} from '../src/evaluation/research-submissions.js'
import {researchManifest,researchModelDeclaration,researchStageDeclarations,type ResearchStageModels} from '../src/evaluation/research-manifest.js'
import {readResearchTranscripts,type ResearchTranscriptBinding} from './research-transcripts.js'
import {dirname,join,resolve} from 'node:path'
import {researchTasks,judgeResearch,researchInputRead,researchFingerprint,summarizeResearch,notRunResearch,type ResearchTask,type ResearchRow,type ResearchTerminal} from '../src/evaluation/research-tasks.js'
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
const stageForResult=(type:string|undefined):'check'|'analyze'|'review'=>type==='review'?'review':type==='data-summary'?'check':'analyze'
const usageCell=(usage:ResearchUsageSummary|undefined,field:'input'|'output'|'cacheRead'|'visibleTokens')=>{
 if(!usage)return'未记录'
 if(usage.state==='not-run')return'未运行'
 const value=usage[field],partial=field==='visibleTokens'?usage.partialUsage:usage.partialFields.includes(field)
 return value===null?'未知':String(value)+(partial?'（下界）':'')
}

export interface RequestBudget {reserved:number;forwarded:number;denied:number;limit:number;inFlight?:number}
export interface ResearchTrial {stageRoutes?:Record<'check'|'analyze'|'review',{provider:string;model:string;credential:string}>;stageStats?:()=>Record<'work'|'review',RequestBudget>;stageGuidance?:(stage:'check'|'analyze'|'review',frozen?:boolean)=>string;credential:string;requests:()=>number;stats?:()=>{reserved:number;forwarded:number;denied:number;limit:number};close:()=>Promise<void>}
export interface ResearchOptions {repeats?:number;taskIds?:string[];perArmLimit?:number}
export interface ResearchRoute {requestLimit?:number;multiExecution?:'approved-plan'|'automatic-plan';requestBudgetFeedback?:'partition-live-v1';multiStageModels?:ResearchStageModels;multiStageLimits?:{work:number;review:number};beginTrial?:(limit:number,mode:'single'|'multi')=>ResearchTrial;provider:string;model:string;modelsPath:string;credential:string;requests:()=>number;signal?:AbortSignal;kind:'live'|'fixture'}
export async function runResearchEvaluation(outputDir:string,route:ResearchRoute,options:ResearchOptions={}){
 const requestLimit=researchRequestLimit(route.requestLimit)
 route={...route,requestLimit,...(route.multiStageLimits?{multiStageLimits:structuredClone(route.multiStageLimits)}:{}),...(route.multiStageModels?{multiStageModels:structuredClone(route.multiStageModels)}:{})}
 mkdirSync(outputDir,{recursive:true})
 if(['research.json','research.md','research-manifest.json'].some(name=>existsSync(join(outputDir,name))))throw new Error('评测输出已存在；不会覆盖旧试验')
 const catalog=researchTasks()
 if(options.taskIds&&(new Set(options.taskIds).size!==options.taskIds.length||options.taskIds.some(id=>!catalog.some(t=>t.id===id))))throw new Error('Invalid paired evaluation task selection')
 const repeats=options.repeats??1,tasks=options.taskIds?options.taskIds.map(id=>catalog.find(t=>t.id===id)!):catalog,perArmLimit=options.perArmLimit??Math.floor(requestLimit/(2*repeats*tasks.length))
 if(!Number.isSafeInteger(repeats)||repeats<1||repeats>4||!tasks.length||!Number.isSafeInteger(perArmLimit)||perArmLimit<1||perArmLimit*2*repeats*tasks.length>requestLimit)throw new Error('Invalid paired evaluation allocation')
 if(route.kind==='live'&&!route.beginTrial)throw new Error('Live evaluation requires isolated per-arm quotas')
 const rows:ResearchRow[]=[],sourceFiles=['scripts/evaluate-research.ts','src/evaluation/research-tasks.ts','src/subagent/executor.ts','src/subagent/child.ts','src/team/science-pipeline.ts','src/team/science-acceptance.ts','src/orchestration/task-submission.ts','src/orchestration/task-contract.ts','src/protocol/task-contract.ts','src/team/science-templates.ts','src/protocol/science-pipeline.ts','src/subagent/task-tools.ts','src/runtime/native.ts','src/runtime/pi-tool-status.ts','scripts/evaluation-request-gate.ts','scripts/research-trial-budget.ts','scripts/research-model-compat.ts','src/runtime/route-evidence-rules.ts','src/bot/output-locks.ts','src/evaluation/research-submissions.ts','src/evaluation/research-manifest.ts','scripts/research-transcripts.ts','scripts/research-auto-arrangement.ts','scripts/evaluate-current-api.ts','package.json','package-lock.json']
 if(route.kind==='fixture')sourceFiles.push('scripts/mock-research.mjs')
 // Parent-side accounting, locks and recovery are also part of the executed candidate.
 sourceFiles.splice(0,sourceFiles.length,...new Set([...sourceFiles,...readdirSync('src',{recursive:true}).map(String).filter(p=>/\.(?:ts|tsx)$/.test(p)).map(p=>'src/'+p.replaceAll('\\','/'))].sort()))
 const sourceFingerprint=researchFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')])),childBuildFingerprint=researchFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8'))
 const modelText=readFileSync(route.modelsPath,'utf8'),modelConfig:unknown=JSON.parse(modelText),modelDeclaration=researchModelDeclaration(modelConfig,route.provider,route.model)
 if(!!route.multiStageLimits!==!!route.multiStageModels)throw new Error('阶段模型与配额声明必须同时冻结')
 const stageModels=route.multiStageModels?researchStageDeclarations(modelConfig,route,route.multiStageModels):undefined
 if(route.kind==='live'&&(modelDeclaration.configuredReasoning===null||modelDeclaration.configuredMaxOutputTokens===null||modelDeclaration.configuredContextWindow===null||modelDeclaration.configuredApi!=='openai-completions'||modelDeclaration.unsupportedSettings))throw new Error('真实试验须先显式冻结受支持的模型推理、输出与请求设置')
 const manifest=researchManifest({requestLimit,runId:randomUUID(),generatedAt:new Date().toISOString(),inference:route.kind,provider:route.provider,model:route.model,modelDeclaration,tasks,repeats,perArmLimit,enforced:!!route.beginTrial,sourceFingerprint,childBuildFingerprint,...(route.multiExecution?{multiExecution:route.multiExecution}:{}),...(route.requestBudgetFeedback?{requestBudgetFeedback:route.requestBudgetFeedback}:{}),...(route.multiStageLimits?{multiStageLimits:route.multiStageLimits}:{}),...(stageModels?{stageModels}:{})})
 writeFileSync(join(outputDir,'research-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
 const changed=new Set<string>(),trialSettingsFiles=new Map<string,string>()
 const prepareSettings=(path:string,scope:'project'|'agent')=>{
  const text=JSON.stringify(manifest.execution.trialSettings[scope],null,2)+'\n'
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text,{flag:'wx'})
  trialSettingsFiles.set(path,text)
 }
 const verifyFrozen=()=>{
  try{if(researchFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')]))!==sourceFingerprint)changed.add('source')}catch{changed.add('source')}
  try{if(researchFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8'))!==childBuildFingerprint)changed.add('child-build')}catch{changed.add('child-build')}
  try{if(readFileSync(route.modelsPath,'utf8')!==modelText)changed.add('model-config')}catch{changed.add('model-config')}
  for(const [path,text] of trialSettingsFiles)try{if(readFileSync(path,'utf8')!==text)changed.add('trial-settings')}catch{changed.add('trial-settings')}
 }

 const save=()=>{
  const summary=summarizeResearch(rows,!!route.beginTrial)
  const report={version:2,multiExecution:route.multiExecution??'pipeline',runId:manifest.runId,manifestFingerprint:manifest.fingerprint,comparisonEligible:!changed.size,integrity:{changed:[...changed]},generatedAt:new Date().toISOString(),inference:route.kind,provider:route.provider,model:route.model,requestLimit:route.kind==='live'?requestLimit:null,requestAllocation:{perArmLimit:route.beginTrial?perArmLimit:null,repeats,enforced:!!route.beginTrial,plannedArms:tasks.length*2*repeats,perArmTimeoutMs:researchTrialTimeoutMs(perArmLimit)},sourceFiles,sourceFingerprint,childBuildFingerprint,tasks:tasks.map(({expected:_expected,...t})=>({...t,inputHash:researchFingerprint(t.csv)})),...summary,qualifiedPairs:changed.size?0:summary.qualifiedPairs}
  writeFileSync(join(outputDir,'research.json'),JSON.stringify(report,null,2)+'\n')
  writeFileSync(join(outputDir,'research.md'),['# 代表性科研任务对照',`Run ${manifest.runId}；比较清单 ${manifest.fingerprint}；候选与配置保持冻结：${!changed.size}。`,`推理：${route.kind}；模型 ${route.provider}/${route.model}；${route.kind==='live'?`整轮最多 ${requestLimit} 次请求`:'离线夹具不消耗真实调用额度'}；每组上限 ${route.beginTrial?perArmLimit:'未强制'}；重复 ${repeats}；分区强制 ${!!route.beginTrial}。`,...report.limitations,'','| 任务 | 重复 | 模式 | 终态 | 独立验收 | 请求 | 宿主提交/退回 | 可见 token | 用量未知任务 | 耗时 ms |','|---|---|---|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.caseId} | ${r.repeat} | ${r.mode} | ${r.terminal} | ${r.success} | ${r.requests} | ${r.submissionAttempts??'未知'}/${r.invalidSubmissions??'未知'} | ${r.usage.visibleTokens} | ${r.usage.unknownUsageTasks} | ${r.elapsedMs} |`),`\n完整配对 ${report.completePairs}；不完整配对 ${report.incompletePairs}；两组均通过独立核验 ${report.qualifiedPairs}。`,'','| 模式 | 合格交付 | 正确阻塞 | 误验收 | 明确触发请求上限 | 请求 / 合格交付 | 毫秒 / 合格交付 |','|---|---|---|---|---|---|---|',...Object.entries(report.delivery).map(([mode,d])=>`| ${mode} | ${d.qualifiedDeliveries} | ${d.correctBlocks} | ${d.falseAcceptances} | ${route.beginTrial?d.exhausted:'不适用'} | ${d.requestsPerDelivery?.toFixed(2)??'不适用'} | ${d.msPerDelivery?.toFixed(0)??'不适用'} |`),'awaiting-info 表示宿主已知缺项或规划提出待确认项且尚未执行；不计作合格交付或正确科学阻塞。','分子包含所有已运行试验的成本，包括失败和正确阻塞；离线结果只验证执行链。宿主提交/退回不含 SDK 拒绝和输出截断；它们须结合原始转录另行核查。','','## 独立审阅请求保留','',...rows.flatMap(r=>r.stageRequestBudgets?[`- ${r.caseId} / ${r.repeat} / ${r.mode}：核查+分析 ${r.stageRequestBudgets.work.forwarded}/${r.stageRequestBudgets.work.limit}，拒绝 ${r.stageRequestBudgets.work.denied}；独立审阅 ${r.stageRequestBudgets.review.forwarded}/${r.stageRequestBudgets.review.limit}，拒绝 ${r.stageRequestBudgets.review.denied}。保留额度不表示已完成审阅。`]:[]),'','## 分阶段用量（宿主已记录回执）','','旧 usage 字段保留执行任务口径；以下 planning/execution/review 为互斥作用域，合计包含规划。缓存读取单列，不重复加到输入输出。未知不补零；下界不是完整费用，未提供价格换算。','','| 任务 | 重复 | 组 | 阶段 | 输入 | 输出 | 缓存读取 | 可见输入+输出 | 覆盖 |','|---|---:|---|---|---:|---:|---:|---:|---|',...rows.flatMap(r=>(['planning','execution','review','total'] as const).map(phase=>{const usage=phase==='total'?r.totalUsage:r.phaseUsage?.[phase];return`| ${r.caseId} | ${r.repeat} | ${r.mode} | ${phase} | ${usageCell(usage,'input')} | ${usageCell(usage,'output')} | ${usageCell(usage,'cacheRead')} | ${usageCell(usage,'visibleTokens')} | ${usage?.state??'未记录'} |`})),...rows.flatMap(r=>r.usageIssues?.length?[`用量诊断 ${r.caseId}/${r.repeat}/${r.mode}: ${r.usageIssues.join(', ')}`]:[]),'','## 模型自动安排（规划请求计入所在组）','',...rows.flatMap(r=>r.arrangement?[`- ${r.caseId} / ${r.mode}：规划 ${r.arrangement.requests} 次，任务 ${r.arrangement.taskCount} 项，结构有效 ${r.arrangement.valid}，审阅覆盖 ${r.arrangement.reviewCovered}，编译通过 ${r.arrangement.compiled??false}。`]:[]),'固定三阶段夹具不代表模型自动拆分质量；自动安排只评价本题的冻结方法和契约。','', '## 提交诊断（与宿主计数分开）','','| 任务 | 重复 | 模式 | 宿主接收/退回 | SDK拒绝 | 输出上限未执行 | 记录完整 |','|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.caseId} | ${r.repeat} | ${r.mode} | ${r.submissionDiagnostics?`${r.submissionDiagnostics.hostAttempts}/${r.submissionDiagnostics.hostRejected}`:'未知'} | ${r.submissionDiagnostics?.sdkRejected??'未知'} | ${r.submissionDiagnostics?.outputLimitNotExecuted??'未知'} | ${r.submissionDiagnostics?.complete??false} |`),'SDK/截断计数仅在本轮每个作用域的完整转录与宿主已记录计数一致时报告；未知不是零。诊断不参与权限或科学验收。',...(changed.size?[`候选发生变化（${[...changed].join(', ')}），本轮不能用于收益比较，后续未启动。`]:[])].join('\n')+'\n')
  return report
 }
 for(let repeat=1;repeat<=repeats;repeat++)for(const [index,task] of tasks.entries())for(const mode of ((index+repeat-1)%2?['multi','single']:['single','multi']) as ('single'|'multi')[]){
  verifyFrozen()
  if(changed.size)rows.push({...notRunResearch(task,mode,researchFingerprint({manifest:manifest.fingerprint,taskId:task.id,repeat})),repeat,reason:'候选或模型配置变化，未启动'})
  else rows.push(await runTrial(outputDir,task,mode,route,repeat,perArmLimit,manifest.fingerprint,prepareSettings))
  verifyFrozen();save()
 }
 return save()
}
async function runTrial(out:string,task:ResearchTask,mode:'single'|'multi',route:ResearchRoute,repeat:number,perArmLimit:number,manifestFingerprint:string,prepareSettings:(path:string,scope:'project'|'agent')=>void):Promise<ResearchRow>{
 const fingerprint=researchFingerprint({manifest:manifestFingerprint,taskId:task.id,repeat}),before=route.requests(),started=Date.now()
 if(route.kind==='live'&&before>=researchRequestLimit(route.requestLimit)||route.signal?.aborted)return {...notRunResearch(task,mode,fingerprint),repeat}
 const lease=route.beginTrial?.(perArmLimit,mode),requests=lease?.requests??route.requests,armBefore=requests()
 let closingLease:Promise<void>|undefined
 const closeLease=()=>closingLease??=Promise.resolve().then(()=>lease?.close())
 try{
 // Each trial is retained under this explicit output, never a user workspace; no formal DB is opened.
 const staged=lease?.stageStats?.()
 if(mode==='multi'&&(!!staged!==!!route.multiStageLimits||staged&&route.multiStageLimits&&(staged.work.limit!==route.multiStageLimits.work||staged.review.limit!==route.multiStageLimits.review)))throw new Error('阶段配额必须与冻结清单一致')
 if(mode==='multi')for(const stage of ['check','analyze','review'] as const){const actual=lease?.stageRoutes?.[stage],expected=route.multiStageModels?.[stage];if(!!actual!==!!expected||actual&&expected&&(actual.model!==expected.model||actual.provider!==expected.provider))throw new Error('阶段模型必须与冻结清单一致')}
 const transcriptBindings:ResearchTranscriptBinding[]=[]
 const root=mkdtempSync(join(out,`${task.id}-${mode}-`)),input='input.csv';writeFileSync(join(root,input),task.csv)
 prepareSettings(join(root,'.pi','settings.json'),'project')
 const versions=await captureFileVersions(root,[input]),template={id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:task.unit??(route.multiExecution==='automatic-plan'?'':'未提供，必须阻塞，不能猜测'),...(!task.unit&&route.multiExecution==='automatic-plan'?{unitStatus:'missing' as const}:{}),missingValues:'drop NA in target column only',...(task.unit?{validation:{version:1 as const,column:task.column,metric:'mean' as const,unit:task.unit,missing:task.missing,absoluteTolerance:1e-9}}:{})}
 const recipe=scienceTemplate(template,'results',[input],input),instructions=task.instructions+'\n'+recipe.instructions
 const routeRecord=AnalysisRouteSchema.parse({routeId:'research',revision:1,updatedAt:1,title:task.id,goal:task.instructions,dataContext:[],steps:[{id:'s',title:task.id,purpose:task.instructions,inputs:[input],outputs:recipe.outputs,dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const definition={route:routeRecord,stepId:'s',inputs:[input],outputs:recipe.outputs,initialVersions:versions,members:{check:'check',analyze:'analyze',review:'review'},instructions,requireExecution:true,maxRevisions:0,acceptance:recipe.acceptance}
 const context={cwd:root,provider:route.provider,model:route.model,modelsPath:route.modelsPath,credentials:{[route.provider]:lease?.credential??route.credential,...Object.fromEntries(Object.values(lease?.stageRoutes??{}).map(s=>[s.provider,s.credential]))}},entry=resolve('dist/electron/subagent-child.js'),childOf=()=>({command:process.execPath,args:[entry],env:{ELECTRON_RUN_AS_NODE:'1'}})
 const stageDefinitions=()=>['check','analyze','review'].map(name=>({name,description:'representative research',systemPrompt:'Follow the approved method. Use real file tools, cite actual call IDs and submit_task_result. Do not guess missing units. Batch independent tool calls when possible.'+(route.multiExecution==='automatic-plan'?'':lease?.stageGuidance?.(name as 'check'|'analyze'|'review',!!route.multiExecution)??''),filePath:'/'+name,tools:['read','write','bash']}))
 const usageScopes:ResearchUsageScope[]=[]
 const observations:(TaskObservation|undefined)[]=[],controller=new AbortController(),abort=()=>controller.abort()
 route.signal?.addEventListener('abort',abort,{once:true})
 if(route.signal?.aborted)controller.abort()
 const timeout=setTimeout(abort,researchTrialTimeoutMs(perArmLimit));timeout.unref()
 let executedTeamId:string|undefined,service:OrchestrationService|undefined,scheduler:团队调度器|undefined,terminal:ResearchTerminal='failed',reason:string|undefined
 let arrangementMetrics:ResearchRow['arrangement'],readiness:ResearchRow['readiness']
 let outputVersions:ResearchRow['versions']=[]
 let blocking:{reasons:string[];inputRead:boolean}|undefined
 try{
  if(mode==='single'){
   // Cache warming is global-only in Pi; project settings alone do not disable it.
   prepareSettings(join(root,'single','settings.json'),'agent')
   transcriptBindings.push({scopeId:'single:1',relativeDirectory:'single/transcript'})
   const contract=stageContract(definition,'analyze'),settings={...resolveTaskSettings(contract,'allow-all',stageDefinitions()[1]!.tools),versions:{version:1 as const,inputs:versions}}
   const executor=new SubagentExecutor({context:{...context,agentDirOf:()=>join(root,'single')},prepareTask:()=>settings,childOf})
   const result=(await executor.run({mode:'single',agent:'analyze',task:instructions},stageDefinitions(),controller.signal)).results[0]
   const missingUnit=!!scienceReadinessIssue(contract.acceptance)
   if(missingUnit){readiness={missing:['units'],executionStarted:false};reason=scienceReadinessIssue(contract.acceptance)}
   terminal=controller.signal.aborted?'cancelled':missingUnit?'awaiting-info':result?.receipt?.state==='accepted'?'accepted':result?.receipt?.state==='blocked'?'blocked':'failed'
   if(!missingUnit)usageScopes.push({id:'single:1',phase:'execution',usage:result?.observation?.usage})
   observations.push(result?.observation);outputVersions=result?.receipt?.versions?.outputs??[]
   const submitted=result?.receipt?.result
   blocking={reasons:submitted?.blockers??[],inputRead:researchInputRead(root,input,result?.evidence)}
   if(terminal==='failed')reason='后端或正式提交未完成；查看隔离试验产物'
  }else{
   service=new OrchestrationService(new OrchestrationStore(join(root,'session'),'research'),1)
   scheduler=new 团队调度器({sessionDir:join(root,'session'),定义:stageDefinitions,跑:{context,childOf},orchestration:service,onChange:()=>{}})
   let team
   if(route.multiExecution){
    const stages=['check','analyze','review'] as const
    let arrangement:TaskArrangement={dispatch:'team-v1',mode:'science',rationale:'冻结同一科研任务的核查、分析和独立审阅以验证执行绑定；不是生产任务数量默认值。',independentReview:true,questions:[],tasks:stages.map((stage,index)=>{
     const contract=stageContract(definition,stage)
     return{id:stage,title:stage,goal:'按已批准方法完成当前阶段',role:stage,inputs:contract.inputs,outputs:contract.outputs,dependencies:index?[stages[index-1]!]:[],acceptance:'既有宿主契约、输入产物版本及独立真值核验',review:stage==='review',execution:{agent:stage,contract}}
    })}
    let markdown=instructions+'\n\n'+serializeTaskArrangement(arrangement)
    if(route.multiExecution==='automatic-plan'){
     const plannerRoute=lease?.stageRoutes?.analyze??{provider:route.provider,model:route.model,credential:lease?.credential??route.credential}
     const generated=await generateResearchArrangement({planningSource:{template,inputs:[input],outputRoot:'results',dataPath:input,requireExecution:true,independentReview:true},workspace:root,sessionDir:join(root,'planner'),modelsPath:route.modelsPath,...plannerRoute,definitions:stageDefinitions(),contracts:{check:stageContract(definition,'check'),analyze:stageContract(definition,'analyze'),review:stageContract(definition,'review')},instructions,requests,prepareSettings,signal:controller.signal})
     arrangement=generated.arrangement;markdown=instructions+'\n\n'+generated.markdown;writeFileSync(join(root,'planner','approved-execution-plan.md'),markdown+'\n',{flag:'wx'});arrangementMetrics={...generated.metrics,compiled:false}
    }
    const modelsByTask=route.multiExecution==='automatic-plan'&&lease?.stageRoutes?Object.fromEntries(arrangement.tasks.map(task=>[task.id,lease.stageRoutes![stageForResult(task.execution?.contract.resultType)]])):undefined
    const snapshot=await freezeApprovedPlan({workspace:root,owner:'research',planId:'research-pilot',planVersion:1,markdown,definitions:stageDefinitions(),tier:'allow-all',model:{provider:route.provider,model:route.model},...(modelsByTask?{modelsByTask}:lease?.stageRoutes?{modelsByAgent:lease.stageRoutes}:{}),signal:controller.signal})
    if(route.multiExecution==='automatic-plan'){
     for(const task of snapshot.frozenTasks)task.definition.systemPrompt+=lease?.stageGuidance?.(stageForResult(task.settings.contract?.resultType),true)??''
     if(arrangementMetrics)arrangementMetrics.compiled=true
    }
    team=materializeApprovedTeam(snapshot,'research')
    writeFileSync(join(root,'approved-plan.json'),JSON.stringify(snapshot.binding,null,2)+'\n',{flag:'wx'})
   }else{
   team=建团队({id:'research',name:'research',goal:instructions,captainSessionId:'research'})
   for(const name of ['check','analyze','review'] as const){const selected=lease?.stageRoutes?.[name];加成员(team,{name,agent:name,...(selected?{provider:selected.provider,model:selected.model}:{})})}
   startPipeline(team,'trial',definition,(_m,c)=>resolveTaskSettings(c,'allow-all',['read','write','bash']));
   }
   写团队(scheduler.dir(team.id),team);executedTeamId=team.id
   for(const member of team.members)prepareSettings(join(scheduler.dir(team.id),member.sessionDir,'agent',String(member.turns),'settings.json'),'agent')
   await scheduler.踢一下(team.id)
   const pending=()=>{const latest=scheduler!.读(team.id);return latest.approvedPlan?!latest.approvedPlanPaused&&(scheduler!.hasActiveTeam(team.id)||latest.tasks.some(t=>t.status==='pending'&&t.dependencies.every(d=>latest.tasks.find(p=>p.id===d)?.status==='completed'))):latest.pipeline!.status==='running'}
   while(pending()&&!controller.signal.aborted)await new Promise(r=>setTimeout(r,20))
   if(controller.signal.aborted)throw new Error('cancelled')
   while(scheduler.hasActiveTeam(team.id))await new Promise(r=>setTimeout(r,10))
   const final=scheduler.读(team.id)
   terminal=(final.approvedPlan?final.tasks.every(t=>t.status==='completed'&&t.receipt?.state==='accepted'):final.pipeline!.status==='completed')?'accepted':final.tasks.some(t=>t.receipt?.state==='blocked')?'blocked':'failed'
   outputVersions=final.tasks.find(t=>t.contract?.resultType==='model-metrics')?.receipt?.versions?.outputs??[]
   const checked=final.tasks.find(t=>t.contract?.resultType==='data-summary'&&t.receipt?.state==='blocked')?.receipt?.result
   blocking={reasons:[...(checked?.blockers??[]),...(checked?.data?.kind==='data-summary'?checked.data.issues:[])],inputRead:checked?.verification.state==='reviewed'&&!!checked.verification.toolCallIds?.length}
   if(terminal==='failed')reason='流程未完成；查看隔离阶段记录'
  }
 }catch(error){if(error instanceof PlanningInformationRequired&&scienceReadinessIssue(recipe.acceptance))readiness={missing:['units'],executionStarted:false};terminal=controller.signal.aborted?'cancelled':error instanceof PlanningInformationRequired?'awaiting-info':'failed';reason=terminal==='awaiting-info'?'方案等待补充信息，未启动执行；不计作合格交付或正确阻塞':'执行取消或运行错误；未计为正确阻塞'}
 finally{
  clearTimeout(timeout);route.signal?.removeEventListener('abort',abort)
  try{if(executedTeamId)scheduler?.中止全部(executedTeamId)}finally{await service?.close()}
  if(scheduler&&executedTeamId){
   // Read after drain on both success and cancellation; completed predecessors keep their known usage.
   const final=scheduler.读(executedTeamId)
   const attempted=final.tasks.filter(t=>t.attempt>0)
   observations.push(...attempted.map(t=>t.observation))
   for(const task of attempted){
    usageScopes.push({id:JSON.stringify([executedTeamId,task.id,task.attempt,task.attemptId??null]),phase:task.contract?.resultType==='review'?'review':'execution',usage:task.observation?.usage})
    const member=final.members.find(m=>m.name===task.assignee)
    transcriptBindings.push({scopeId:JSON.stringify([task.id,task.attempt,task.attemptId??null]),relativeDirectory:member?['session','teams',executedTeamId,...member.sessionDir.split(/[\\/]/)].join('/'):'missing-scope'})
   }
   outputVersions=final.tasks.find(t=>t.contract?.resultType==='model-metrics')?.receipt?.versions?.outputs??[]
  }
 }
 if(route.multiExecution==='automatic-plan'&&mode==='multi'){
  const file=join(root,'planner','automatic-arrangement.json')
  if(!arrangementMetrics&&existsSync(file))try{arrangementMetrics={...JSON.parse(readFileSync(file,'utf8')),compiled:false}}catch{/* Original trial failure remains authoritative. */}
  if(arrangementMetrics)writeFileSync(file,JSON.stringify({mode:'model-generated',...arrangementMetrics},null,2)+'\n')
 }
 const resultPath=join(root,'results/result.json')
 let actual:unknown;try{actual=JSON.parse(readFileSync(resultPath,'utf8'))}catch{if(existsSync(resultPath))actual=null}
 let versionMatches=terminal!=='accepted'
 if(terminal==='accepted')try{versionMatches=sameFileVersions(outputVersions,await captureFileVersions(root,recipe.outputs))}catch{}
 const transcript=readResearchTranscripts(root,transcriptBindings),hostAttempts=observations.reduce((n,o)=>n+(o?.submissionAttempts??0),0),hostRejected=observations.reduce((n,o)=>n+(o?.invalidSubmissions??0),0)
 const submissionDiagnostics=researchSubmissionDiagnostics({hostAttempts,hostRejected},transcript.scopes)
 await closeLease() // Counters must describe the fully drained arm, including cancellation.
 if(arrangementMetrics&&arrangementMetrics.requests>0)usageScopes.push({id:'planner',phase:'planning',usage:arrangementMetrics.usage})
 const usageIssues:string[]=arrangementMetrics?.usageIssue?['planner-usage-unavailable']:[]
 let attributed:ReturnType<typeof summarizeResearchUsage>|undefined
 try{attributed=summarizeResearchUsage(usageScopes)}catch{usageIssues.push('usage-scope-conflict')}
 return{...(readiness?{readiness}:{}),...(attributed?{phaseUsage:attributed.phases,totalUsage:attributed.total}:{}),...(usageIssues.length?{usageIssues}:{}),...(arrangementMetrics?{arrangement:arrangementMetrics}:{}),submissionDiagnostics,diagnosticReadIssues:transcript.issues,caseId:task.id,mode,repeat,fingerprint,terminal,...judgeResearch(task,terminal,actual,existsSync(join(root,input))&&readFileSync(join(root,input),'utf8')===task.csv,blocking,versionMatches),requests:requests()-armBefore,submissionAttempts:observations.reduce((n,o)=>n+(o?.submissionAttempts??0),0),invalidSubmissions:observations.reduce((n,o)=>n+(o?.invalidSubmissions??0),0),...(lease?.stats?{requestBudget:lease.stats()}:{}),...(lease?.stageStats?{stageRequestBudgets:lease.stageStats()}:{}),elapsedMs:Date.now()-started,usage:baselineUsage(observations.length?observations:[undefined]),versions:outputVersions,...(reason?{reason}:{})}
 }finally{await closeLease()}
}
