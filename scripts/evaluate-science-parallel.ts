/** Offline software-path comparison. Pi, Python, files, reservations and receipts are real. */
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {NativeRuntime} from '../src/runtime/native.js'
import type {团队调度器} from '../src/team/scheduler.js'
import type {AnalysisRouteBook} from '../src/runtime/analysis-route-book.js'
import {recoverTeamExecution} from '../src/team/recovery.js'
import {写团队} from '../src/team/state.js'
import {baselineFingerprint,baselineUsage,verifyMeanFixture} from '../src/evaluation/science-pipeline.js'
import {sharedTaskOutputLocks} from '../src/bot/output-locks.js'
import {scienceReuseBuild} from '../src/team/science-reuse.js'
import {sameFileVersions} from '../src/protocol/file-versions.js'
// @ts-expect-error shared deterministic localhost provider
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error shared deterministic scientific fixture
import {scienceTemplateScenario} from './mock-science-template.mjs'

export type TaskInterval={taskId:string;stage:string;member:string;queuedAt:number;backendStartedAt?:number;lastRequestAt?:number;endedAt?:number;ok?:boolean}
/** Check actual grants; shared analysis members alone cannot prove workspace exclusion. */
export function assertWorkspaceLockExclusion(reservations:readonly {paths:readonly string[];grantedAt?:number;releasedAt?:number}[]){
 const actual=reservations.filter((r):r is typeof r&{grantedAt:number}=>r.grantedAt!==undefined)
 if(actual.some(r=>r.releasedAt===undefined))throw new Error('Workspace lock has an undrained holder')
 const workspace=actual.filter(r=>r.paths.includes('*'))
 for(const writer of workspace)for(const other of actual){
  if(writer!==other&&Math.min(writer.releasedAt!,other.releasedAt!)>Math.max(writer.grantedAt,other.grantedAt))throw new Error('Whole-workspace lock overlap with another holder')
 }
 return{workspaceReservations:workspace.length,checkedReservations:actual.length}
}
export function summarizeTaskIntervals(intervals:TaskInterval[]){
 const actual=intervals.filter((i):i is TaskInterval&{backendStartedAt:number;endedAt:number}=>i.backendStartedAt!==undefined&&i.endedAt!==undefined&&i.endedAt>=i.backendStartedAt)
 const overlaps:{left:string;right:string;elapsedMs:number}[]=[]
 for(let a=0;a<actual.length;a++)for(let b=a+1;b<actual.length;b++){const left=actual[a]!,right=actual[b]!,elapsedMs=Math.min(left.endedAt,right.endedAt)-Math.max(left.backendStartedAt,right.backendStartedAt);if(elapsedMs>0)overlaps.push({left:left.taskId,right:right.taskId,elapsedMs})}
 const boundaries=actual.flatMap(i=>[{at:i.backendStartedAt,delta:1},{at:i.endedAt,delta:-1}]).sort((a,b)=>a.at-b.at||a.delta-b.delta)
 let active=0,maxBackendConcurrent=0,actualOverlapMs=0,previous=boundaries[0]?.at??0
 for(const e of boundaries){if(active>1)actualOverlapMs+=e.at-previous;active+=e.delta;maxBackendConcurrent=Math.max(maxBackendConcurrent,active);previous=e.at}
 return{maxBackendConcurrent,actualOverlapMs,analysisOverlapMs:overlaps.filter(o=>[o.left,o.right].every(id=>actual.find(i=>i.taskId===id)?.stage==='analyze')).reduce((n,o)=>n+o.elapsedMs,0),overlaps}
}
type ComparableRun={concurrency:number;comparisonFingerprint:string;elapsedMs:number;modelRequests:number;groundTruthPassed:boolean;accepted:boolean;numericOutputs:unknown[]}
export function summarizeParallelPair(serial:ComparableRun,bounded:ComparableRun){
 if(serial.concurrency!==1||bounded.concurrency!==2||serial.comparisonFingerprint!==bounded.comparisonFingerprint)throw new Error('Runs are not comparable')
 if(!serial.accepted||!bounded.accepted||!serial.groundTruthPassed||!bounded.groundTruthPassed)throw new Error('Both runs must have accepted actual numeric outputs')
 const sameNumericOutputs=JSON.stringify(serial.numericOutputs)===JSON.stringify(bounded.numericOutputs)
 if(!sameNumericOutputs)throw new Error('Actual numeric outputs differ')
 return{sameNumericOutputs,sameRequestCount:serial.modelRequests===bounded.modelRequests,wallTimeDifferenceMs:bounded.elapsedMs-serial.elapsedMs,serialToBoundedRatio:serial.elapsedMs/bounded.elapsedMs}
}
async function until(test:()=>boolean,timeout=40000){const deadline=Date.now()+timeout;while(!test()){if(Date.now()>deadline)throw new Error('Parallel fixture timed out');await new Promise<void>(r=>setTimeout(r,10))}}
type Tool={execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text?:string}[]}>}
export function scienceBatchControl(session:{getToolDefinition(name:string):Tool},action:'resume'|'cancel'):Tool{return session.getToolDefinition(action+'_science_batch')}
type Internal={botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):Tool}}> ;routeBooks:Map<string,{book:AnalysisRouteBook}>}
const input='x\n1\n2\n3\n4\n5\n'
const configuration={provider:'localhost deterministic fixture',actualPiPythonFiles:true,inputs:{'a.csv':input,'b.csv':input},method:'mean',required:{n:5,mean:3,unit:'m'},stages:['check','analyze','review'],maxRevisions:1,fixtureResponseDelayMs:180,analysisDelayMs:0,locks:'original read-path reservations and whole-workspace execution reservation; no relaxation',workload:'same two independent CSVs and required artifacts; concurrency is the treatment'}
const comparisonFingerprint=baselineFingerprint(configuration)

async function runFixture(concurrency:1|2,repeat:number,outputDir:string,intervention?:'stop-resume'|'cancel'){
 const root=mkdtempSync(join(tmpdir(),'dawn-science-parallel-')),started=Date.now(),intervals:TaskInterval[]=[],events:unknown[]=[],requests:{at:number;taskId?:string;resultType:string;inputs:string[]}[]=[]
 let internal:Internal|undefined,activeTeam:string|undefined
 const fixture=scienceTemplateScenario({delayMs:configuration.analysisDelayMs})
 const server=await startMockInferenceServer({firstChunkDelayMs:configuration.fixtureResponseDelayMs,scenario:{reply:fixture.reply,toolCall(body:unknown){
  const b=body as {messages?:{role:string;content:unknown}[]},messages=b.messages??[],user=messages.findLast(m=>m.role==='user'),prompt=typeof user?.content==='string'?user.content:Array.isArray(user?.content)?user.content.map((part:{text?:string})=>part.text??'').join(''):''
  const contractText=/任务契约（范围已冻结）：([^\n]+)/.exec(prompt)?.[1]
  if(contractText){const c=JSON.parse(contractText) as {resultType:string;inputs:string[]},control=internal?.botTeams.get('parallel'),team=control&&activeTeam?control.scheduler.读(activeTeam):undefined,task=team?.tasks.find(t=>t.status==='in_progress'&&t.contract?.resultType===c.resultType&&JSON.stringify(t.contract.inputs)===JSON.stringify(c.inputs)),now=Date.now()-started
   requests.push({at:now,...(task?{taskId:task.id}:{}),resultType:c.resultType,inputs:c.inputs});const interval=intervals.findLast(i=>i.taskId===task?.id&&i.endedAt===undefined);if(interval){interval.backendStartedAt??=now;interval.lastRequestAt=now}
  }
  return fixture.toolCall(body)
 }}})
 for(const file of ['a.csv','b.csv'])writeFileSync(join(root,file),input)
 const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));mkdirSync(join(root,'.dawn/agents'),{recursive:true})
 for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: offline fixture\ntools: read, write, bash\n---\nUse the frozen contract. Synthetic software fixture only.`)
 const lockReservations:{paths:readonly string[];queuedAt:number;grantedAt?:number;releasedAt?:number;cancelledAt?:number}[]=[],originalAcquire=sharedTaskOutputLocks.acquire
 sharedTaskOutputLocks.acquire=function(scope,paths,signal,resolver){const trace:{paths:readonly string[];queuedAt:number;grantedAt?:number;releasedAt?:number;cancelledAt?:number}={paths:(paths??['*']).map(p=>p.startsWith(root+'/')?p.slice(root.length+1):p),queuedAt:Date.now()-started};lockReservations.push(trace);return originalAcquire.call(sharedTaskOutputLocks,scope,paths,signal,resolver).then(release=>{trace.grantedAt=Date.now()-started;return()=>{release();trace.releasedAt=Date.now()-started}}).catch(error=>{trace.cancelledAt=Date.now()-started;throw error})}
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')});internal=runtime as unknown as Internal
 const unsubscribe=runtime.attach('parallel',e=>{
  if(e.kind==='subagent_start'&&e.toolCallId.startsWith('team:')){const taskId=e.task,control=internal!.botTeams.get('parallel'),team=control?.scheduler.读(e.toolCallId.slice(5)),task=team?.tasks.find(t=>t.id===taskId),stage=task?.contract?.resultType==='data-summary'?'check':task?.contract?.resultType==='model-metrics'?'analyze':task?.contract?.resultType==='review'?'review':'aggregate';intervals.push({taskId,member:task?.assignee??e.agent,stage,queuedAt:Date.now()-started});events.push({at:Date.now()-started,kind:e.kind,index:e.index,taskId})}
  if(e.kind==='subagent_end'&&e.toolCallId.startsWith('team:')){const begin=events.findLast(x=>(x as {kind:string;index:number}).kind==='subagent_start'&&(x as {index:number}).index===e.index) as {taskId:string}|undefined,interval=intervals.findLast(i=>i.taskId===begin?.taskId&&i.endedAt===undefined);if(interval){interval.endedAt=Date.now()-started;interval.ok=e.ok}events.push({at:Date.now()-started,kind:e.kind,index:e.index,taskId:begin?.taskId,ok:e.ok})}
 })
 const save=(name:string,value:unknown)=>writeFileSync(join(outputDir,name),JSON.stringify(value,null,2)+'\n')
 try{
  await runtime.start({sessionId:'parallel',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
  const book=internal.routeBooks.get('parallel')!.book,route=book.replace(0,{title:'parallel fixture',goal:'approved mean',dataContext:['synthetic deterministic software fixture'],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['a.csv','b.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
  const tools=internal.sessions.get('parallel')!.session,start=tools.getToolDefinition('start_science_batch'),template={id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:1e-9}}
  const args={routeId:route.routeId,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved mean; preserve inputs',template,items:[{id:'a',label:'A',inputs:['a.csv'],dataPath:'a.csv'},{id:'b',label:'B',inputs:['b.csv'],dataPath:'b.csv'}],outputRoot:'results',maxRevisions:1,concurrency}
  const reuseBuildBefore=scienceReuseBuild(),began=Date.now(),result=await start.execute('pair-'+repeat+'-'+concurrency,{...args,revision:route.revision});if(result.isError)throw new Error(JSON.stringify(result))
  const control=internal.botTeams.get('parallel')!,scheduler=control.scheduler;activeTeam=control.current.id
  let stopEvidence:unknown
  if(intervention){
   await until(()=>intervals.filter(i=>i.backendStartedAt!==undefined&&i.endedAt===undefined).length>=2)
   const before=scheduler.读(activeTeam),activeTasks=before.tasks.filter(t=>t.status==='in_progress').map(t=>t.id),stopAt=Date.now()-started
   if(intervention==='cancel'){const cancelled=await scienceBatchControl(tools,'cancel').execute('cancel',{teamId:activeTeam,stateRevision:before.scienceBatch!.stateRevision});if(cancelled.isError)throw new Error(JSON.stringify(cancelled))}else scheduler.中止全部(activeTeam)
   await until(()=>!scheduler.hasActiveTeam(activeTeam!));const drained=Date.now()-started,saved=scheduler.读(activeTeam);recoverTeamExecution(saved);写团队(scheduler.dir(activeTeam),saved)
   const completedBefore=saved.tasks.filter(t=>t.receipt?.state==='accepted').map(t=>t.id);stopEvidence={intervention,activeTasks,stopAt,drainedAt:drained,drainMs:drained-stopAt,status:saved.scienceBatch!.status,aggregateAttempts:saved.scienceBatch!.aggregateTaskIds.length,completedBefore}
   if(activeTasks.length<2||saved.scienceBatch!.aggregateTaskIds.length)throw new Error('Stop demonstration did not stop two active tasks before aggregation')
   save(`intervention-${intervention}-paused.json`,saved)
   if(intervention==='cancel'){
    if(saved.scienceBatch!.status!=='cancelled')throw new Error('Cancellation was not terminal')
    const row={repeat,concurrency,intervention,elapsedMs:Date.now()-began,modelRequests:server.requests.length,stopEvidence,intervals,requests,events,lockReservations,...summarizeTaskIntervals(intervals),...baselineUsage(saved.tasks.map(t=>t.observation)),status:saved.scienceBatch!.status,summaryAbsent:saved.scienceBatch!.summaryOutputs.every(p=>!existsSync(join(root,p)))};assertWorkspaceLockExclusion(row.lockReservations);save('cancel.json',row);if(!row.summaryAbsent)throw new Error('Cancelled batch published a summary');return row
   }
   const resumed=await scienceBatchControl(tools,'resume').execute('resume',{teamId:activeTeam,stateRevision:saved.scienceBatch!.stateRevision,acknowledgeInterrupted:true});if(resumed.isError)throw new Error(JSON.stringify(resumed))
  }
  await until(()=>['completed','blocked'].includes(scheduler.读(activeTeam!).scienceBatch!.status));await until(()=>!scheduler.hasActiveTeam(activeTeam!));if(scheduler.读(activeTeam!).scienceBatch!.status!=='completed'){save('failed-team.json',scheduler.读(activeTeam!));throw new Error('Fixture batch blocked: '+scheduler.读(activeTeam!).scienceBatch!.reason)}await until(()=>scheduler.读(activeTeam!).pipeline?.routeSync!=='pending')
  const elapsedMs=Date.now()-began,team=scheduler.读(activeTeam),batch=team.scienceBatch!,numericOutputs=batch.items.map(item=>JSON.parse(readFileSync(join(root,item.definition.acceptance!.resultPath),'utf8')) as unknown),inputPreserved=['a.csv','b.csv'].every(p=>readFileSync(join(root,p),'utf8')===input),groundTruthPassed=numericOutputs.every(verifyMeanFixture)
  const reviewedVersions=batch.items.every(item=>{const tasks=(item.completed?.taskIds??[]).map(id=>team.tasks.find(t=>t.id===id)!),analysis=tasks.find(t=>t.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted'),review=tasks.find(t=>t.contract?.resultType==='review'&&t.receipt?.state==='accepted');return!!analysis?.receipt?.versions&&!!review?.settings?.versions&&sameFileVersions(analysis.receipt.versions.outputs,review.settings.versions.inputs)})
  const outputFiles=batch.items.flatMap(i=>i.definition.outputs).concat(batch.summaryOutputs).map(path=>({path,bytes:readFileSync(join(root,path)).byteLength,sha256:createHash('sha256').update(readFileSync(join(root,path))).digest('hex')})),summary=JSON.parse(readFileSync(join(root,batch.summaryOutputs[0]!),'utf8')),routeProjected=team.pipeline?.routeSync==='applied',accepted=batch.status==='completed'&&reviewedVersions&&routeProjected&&inputPreserved&&batch.aggregateTaskIds.length===1&&summary.items.length===2
  const row={repeat,concurrency,...(intervention?{intervention}:{}),comparisonFingerprint,elapsedMs,modelRequests:server.requests.length,status:batch.status,groundTruthPassed,accepted,numericOutputs,inputPreserved,reviewedVersions,routeProjected,aggregateAttempts:batch.aggregateTaskIds.length,...baselineUsage(team.tasks.map(t=>t.observation)),...summarizeTaskIntervals(intervals),intervals:structuredClone(intervals),requests:structuredClone(requests),events:structuredClone(events),lockReservations:structuredClone(lockReservations),lockWaitMs:lockReservations.reduce((n,l)=>n+Math.max(0,(l.grantedAt??l.cancelledAt??l.queuedAt)-l.queuedAt),0),outputFiles,...(stopEvidence?{stopEvidence}:{})}
  assertWorkspaceLockExclusion(row.lockReservations)
  const prefix=intervention??`pair-${repeat}-concurrency-${concurrency}`;save(prefix+'.json',row);save(prefix+'-team.json',team);save(prefix+'-route.json',book.read());save(prefix+'-summary.json',summary)
  // Keep reviewable actual Python/JSON/report/figure outputs, not only provider declarations.
  for(const file of outputFiles){const dest=join(outputDir,'artifacts',prefix,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,readFileSync(join(root,file.path)))}
  if(!accepted||!groundTruthPassed||row.analysisOverlapMs>0||row.maxBackendConcurrent>concurrency)throw new Error('Parallel fixture failed independent content, review, route, aggregation or execution-exclusion checks: '+prefix)
  if(concurrency===2&&!intervention&&row.actualOverlapMs<=0)throw new Error('Bounded fixture showed no actual backend overlap')
  if(concurrency===2&&!intervention&&repeat===1){
   const sourceId=team.id,sourcePath=join(root,'session/teams',sourceId,'team.json'),sourceBefore=readFileSync(sourcePath,'utf8'),reuseBuildAfter=scienceReuseBuild(),beforeRequests=server.requests.length,derivedStarted=Date.now()
   const derived=await start.execute('all-reuse',{...args,revision:book.read()!.revision,reuseFrom:{teamId:team.id,stateRevision:batch.stateRevision}});if(derived.isError)throw new Error(JSON.stringify(derived));activeTeam=control.current.id
   await until(()=>['completed','blocked'].includes(scheduler.读(activeTeam!).scienceBatch!.status));await until(()=>!scheduler.hasActiveTeam(activeTeam!));if(scheduler.读(activeTeam!).scienceBatch!.status!=='completed'){save('failed-team.json',scheduler.读(activeTeam!));throw new Error('Fixture batch blocked: '+scheduler.读(activeTeam!).scienceBatch!.reason)}await until(()=>scheduler.读(activeTeam!).pipeline?.routeSync!=='pending')
   const reused=scheduler.读(activeTeam),b=reused.scienceBatch!,evidence={concurrency:2,reuseBuildBefore,reuseBuildAfter,sourceBuildStable:reuseBuildBefore===reuseBuildAfter,elapsedMs:Date.now()-derivedStarted,modelRequests:server.requests.length-beforeRequests,status:b.status,reusedItems:b.items.map(i=>i.reuse?.mode),aggregateAttempts:b.aggregateTaskIds.length,routeProjected:reused.pipeline?.routeSync==='applied',routeRevision:book.read()!.revision,frozenRouteRevision:reused.pipeline!.definition.route.revision,sourcePreserved:readFileSync(sourcePath,'utf8')===sourceBefore};save('all-reuse.json',evidence);save('all-reuse-team.json',reused);save('all-reuse-route.json',book.read())
   if(evidence.modelRequests!==0||evidence.status!=='completed'||!evidence.reusedItems.every(m=>m==='reused')||evidence.aggregateAttempts!==1||!evidence.routeProjected||!evidence.sourcePreserved)throw new Error('All-reused bounded batch failed: '+JSON.stringify(evidence))
  }
  return row
 }finally{unsubscribe();await runtime.stop('parallel');sharedTaskOutputLocks.acquire=originalAcquire;await server.close();rmSync(root,{recursive:true,force:true})}
}

export async function runScienceParallel(outputDir:string){
 if(!existsSync(resolve('dist/electron/subagent-child.js')))throw new Error('Build the Pi child first (npm run build:electron)')
 mkdirSync(outputDir,{recursive:true});const rows:Awaited<ReturnType<typeof runFixture>>[]=[],pairs:unknown[]=[]
 for(let repeat=1;repeat<=2;repeat++){
  // Alternate ordering to reduce one-direction warm-up bias; no speed threshold is enforced.
  const order: (1|2)[]=repeat===1?[1,2]:[2,1]
  for(const concurrency of order)rows.push(await runFixture(concurrency,repeat,outputDir))
  const pair=rows.filter(r=>r.repeat===repeat&&!r.intervention) as (ComparableRun&{repeat:number})[];pairs.push({repeat,...summarizeParallelPair(pair.find(r=>r.concurrency===1)!,pair.find(r=>r.concurrency===2)!)})
 }
 const resumed=await runFixture(2,0,outputDir,'stop-resume'),cancelled=await runFixture(2,0,outputDir,'cancel')
 const sourceFiles=['scripts/evaluate-science-parallel.ts','scripts/mock-science-template.mjs','src/team/science-batch.ts','src/team/science-pipeline-tools.ts','src/team/scheduler.ts','src/bot/output-locks.ts','src/runtime/native.ts','src/protocol/science-batch.ts']
 const report={version:1,generatedAt:new Date().toISOString(),kind:'deterministic-local-software-path',configuration,comparisonFingerprint,sourceFiles,sourceFingerprint:baselineFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')])),childBuildFingerprint:baselineFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8')),rows,pairs,interventions:{resumed,cancelled},limitations:['确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。','相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。','backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。','lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。','actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。','重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。']}
 writeFileSync(join(outputDir,'parallel.json'),JSON.stringify(report,null,2)+'\n')
 const md=['# 有界并行实际执行评测',...report.limitations,'','| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |','|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|',...rows.map(r=>'numericOutputs' in r?`| ${r.repeat} | ${r.concurrency} | ${r.elapsedMs} | ${r.modelRequests} | ${r.actualOverlapMs} | ${r.maxBackendConcurrent} | ${r.analysisOverlapMs} | ${r.lockWaitMs} | ${r.groundTruthPassed} | ${r.accepted} | ${r.visibleTokens} | ${r.unknownUsageTasks} |`:''),'','## 真实时间线（相对单次夹具创建，ms）',...rows.flatMap(r=>['',`### 重复 ${r.repeat}／并发 ${r.concurrency}`,'','| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |','|---|---|---|---:|---:|---:|',...r.intervals.map(i=>`| ${i.taskId} | ${i.stage} | ${i.member} | ${i.queuedAt} | ${i.backendStartedAt??'无模型请求'} | ${i.endedAt??'未知'} |`)]),'','## 停止、取消与恢复','',`停止／恢复：${JSON.stringify('stopEvidence' in resumed?resumed.stopEvidence:undefined)}；最终完成=${'accepted' in resumed&&resumed.accepted}。`,`终态取消：${JSON.stringify('stopEvidence' in cancelled?cancelled.stopEvidence:undefined)}；无汇总=${'summaryAbsent' in cancelled&&cancelled.summaryAbsent}。`,'','完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。','每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。'].join('\n')+'\n'
 writeFileSync(join(outputDir,'parallel.md'),md)
 return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runScienceParallel(resolve(process.argv[2]??'docs/validation/live-parallel-20261105/stage-c')).then(r=>console.log(JSON.stringify({pairs:r.pairs,rows:r.rows.map(x=>({repeat:x.repeat,concurrency:x.concurrency,elapsedMs:x.elapsedMs,requests:x.modelRequests,overlapMs:x.actualOverlapMs})),interventions:'passed'}))).catch(error=>{console.error(error);process.exitCode=1})
