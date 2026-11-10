import {scienceReadinessIssue} from '../protocol/science-acceptance.js'
import {scienceStepContext} from '../protocol/science-route-context.js'
import {createHash} from 'node:crypto'
/** Fixed scientific reducer over existing Team tasks; no second execution loop. */
import {PipelineDefinitionSchema,SciencePipelineSchema,publicPipeline,stageContract,type PipelineContractDefinition,type PipelineDefinition,type PipelineStage,type SciencePipeline} from '../protocol/science-pipeline.js'
import {TaskContractSchema,TaskSettingsSchema,type TaskContract,type TaskSettings} from '../orchestration/task-contract.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import {加任务,团队错误} from './state.js'
import type {团队,成员} from './types.js'

export function pipelineStageContract(def:PipelineContractDefinition,stage:PipelineStage):TaskContract {
 return stageContract(def,stage)
}
/** Budget identity is host-owned and independent of the public batch display projection. */
export function pipelineBudgetId(team:团队,p:SciencePipeline):string{return'pipeline-'+createHash('sha256').update(JSON.stringify([team.id,p.requestId,p.namespace??null,p.budgetGeneration??0])).digest('hex')}
export function pipelineRemainingRuns(p:SciencePipeline):number{return p.stage==='check'?3:p.stage==='analyze'?2:1}
export function scienceBudgetPipelines(team:团队):SciencePipeline[]{
 const items=team.scienceBatch?.items.flatMap(item=>item.checkpoint?[item.checkpoint]:item.completed?[item.completed]:[])??[]
 const candidates=team.scienceBatch?.concurrency===2?[...items,...(team.pipeline?[team.pipeline]:[])]:[...(team.pipeline?[team.pipeline]:[]),...items]
 const found=new Map<string,SciencePipeline>()
 for(const p of candidates){const id=pipelineBudgetId(team,p);if(!found.has(id))found.set(id,p)}
 return[...found.values()]
}
export function blockPipelineBudget(p:SciencePipeline,reason:string,now=Date.now()):void{finish(p,'blocked',reason,now)}
export function startPipeline(team:团队,requestId:string,raw:PipelineDefinition,freeze:(member:成员,contract:TaskContract)=>TaskSettings=(m,c)=>resolveTaskSettings(c,'ask-risky'),now=Date.now(),namespace?:string):void {
 const definition=PipelineDefinitionSchema.parse(raw)
 const readiness= scienceReadinessIssue(definition.acceptance);if(readiness)throw new 团队错误(readiness)
 if(namespace){if(!team.scienceBatch||team.scienceBatch.items[team.scienceBatch.index]?.id!==namespace||team.pipeline?.status==='running')throw new 团队错误('批量内部阶段身份冲突')}
 else if(team.pipeline){if(team.pipeline.requestId===requestId&&JSON.stringify(team.pipeline.definition)===JSON.stringify(definition))return;throw new 团队错误('流程身份已存在，不能修改或覆盖')}
 if(team.tasks.length&&!namespace)throw new 团队错误('科研流程使用独立团队，不能覆盖已有任务')
 const members=Object.fromEntries((['check','analyze','review'] as const).map(stage=>{const member=team.members.find(m=>m.name===definition.members[stage]&&m.status!=='removed');if(!member)throw new 团队错误(`流程成员不存在：${stage}`);return[stage,member]})) as Record<PipelineStage,成员>
 if((members.analyze.botId??members.analyze.agent)===(members.review.botId??members.review.agent))throw new 团队错误('分析与审阅必须选择不同执行者')
 const settingsByStage=Object.fromEntries((['check','analyze','review'] as const).map(stage=>{const contract=pipelineStageContract(definition,stage),settings=TaskSettingsSchema.parse({...freeze(members[stage],contract),...(definition.initialVersions&&stage!=='review'?{versions:{version:1,inputs:definition.initialVersions}}:{})});if(JSON.stringify(settings.contract)!==JSON.stringify(contract))throw new 团队错误('冻结设置与流程契约不一致');return[stage,settings]})) as SciencePipeline['settingsByStage']
 const p:SciencePipeline={...(namespace?{namespace}:{}),version:1,requestId,definition,settingsByStage,status:'running',stage:'check',round:0,currentTaskId:'p-check-0-0',taskIds:[],stateRevision:1,startedAt:now,updatedAt:now,routeSync:'pending'}
 team.pipeline=p;enqueueStage(team,now);SciencePipelineSchema.parse(p)
}
function enqueueStage(team:团队,now:number){
 const p=team.pipeline!
 if(p.taskIds.length>=16){finish(p,'blocked','已达到 16 个阶段尝试上限；请核对检查点与产物后另建流程',now);return}
 const def=p.definition,step=def.route.steps.find(s=>s.id===def.stepId)!
 // Batch index supplies uniqueness; bounded display slug keeps every attempt below Team's 40-char limit.
 const namespace=p.namespace?`${team.scienceBatch!.index}-${p.namespace.slice(0,16)}-`:''
 const id=`p-${namespace}${p.stage}-${p.round}-${p.taskIds.length}`
 const check=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)!).find(t=>t.contract?.resultType==='data-summary'&&t.status==='completed'&&t.receipt?.state==='accepted')
 const lastAnalysis=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)!).find(t=>t.contract?.resultType==='model-metrics'&&t.status==='completed')
 const previous=p.taskIds.at(-1)?team.tasks.find(t=>t.id===p.taskIds.at(-1)):undefined
 const description=[`科研流程 ${team.id}，阶段 ${p.stage}，修正轮次 ${p.round}/${def.maxRevisions}。`,def.instructions,`用户已确认路线：${JSON.stringify({title:def.route.title,goal:def.route.goal,dataContext:def.route.dataContext,step:scienceStepContext(step)})}`,previous?.receipt?`上一阶段宿主回执：${JSON.stringify(previous.receipt)}`:'',p.stage==='analyze'&&check?.receipt?`核查回执：${JSON.stringify(check.receipt)}`:'',p.stage==='review'?'只读审阅声明产物，逐个真实 read 并引用 callId；明确 pass/revise/blocked。不能写入或让分析者代审。':'使用冻结契约；完成时调用 submit_task_result。'].filter(Boolean).join('\n\n')
 const dependencies=p.stage==='review'&&lastAnalysis?[lastAnalysis.id]:p.stage==='analyze'&&check?[check.id]:[]
 const settings=structuredClone(p.settingsByStage[p.stage])
 if(def.initialVersions&&p.stage==='review'){
  if(!lastAnalysis?.receipt?.versions){finish(p,'blocked','分析阶段缺少内容版本，未放行审阅',now);return}
  settings.versions={version:1,inputs:structuredClone(lastAnalysis.receipt.versions.outputs)}
 }
 const task=加任务(team,{id,subject:`${p.namespace?team.scienceBatch!.items[team.scienceBatch!.index]!.label+' · ':''}${({check:'数据核查',analyze:'分析执行',review:'独立审阅'})[p.stage]} · 修正 ${p.round}`,description,assignee:def.members[p.stage],contract:settings.contract!,dependencies},now)
 task.settings=structuredClone(settings);p.currentTaskId=id;p.taskIds.push(id);p.updatedAt=now
}
const finish=(p:SciencePipeline,status:'blocked'|'completed'|'cancelled',reason:string,now:number)=>{p.status=status;p.reason=reason.length>7900?reason.slice(0,7900)+'…（原因过长，完整内容见阶段记录）':reason;p.updatedAt=now;p.endedAt=now;p.stateRevision++}
export function advancePipeline(team:团队,now=Date.now()):void {
 const p=team.pipeline;if(!p||p.status!=='running')return
 const task=team.tasks.find(t=>t.id===p.currentTaskId)
 if(!task){finish(p,'blocked','当前阶段记录缺失，未重放',now);return}
 if(task.status==='pending'||task.status==='claimed'||task.status==='in_progress')return
 if(task.status==='cancelled'){finish(p,'cancelled','阶段已取消，未放行下游',now);return}
 const receipt=task.receipt,result=receipt?.result,data=result?.data
 if(p.stage==='review'&&receipt?.state==='blocked'&&data?.kind==='review'&&data.verdict==='revise'&&!result!.blockers.length&&result!.execution.state!=='failed'){
  if(p.round>=p.definition.maxRevisions){finish(p,'blocked','审阅仍需修正，已达到修正次数上限',now);return}
  p.round++;p.stage='analyze';p.stateRevision++;enqueueStage(team,now);return
 }
 const expected=p.stage==='check'?'data-summary':p.stage==='analyze'?'model-metrics':'review'
 if(task.status!=='completed'||receipt?.state!=='accepted'||data?.kind!==expected){finish(p,'blocked',receipt?.reason??task.output??'缺少有效宿主回执',now);return}
 if(p.stage==='review'){
  if(data.kind!=='review'||data.verdict!=='pass'){finish(p,'blocked','审阅未通过',now);return}
  finish(p,'completed','各阶段契约与审阅通过；不代表独立科学认证',now);return
 }
 p.stage=p.stage==='check'?'analyze':'review';p.stateRevision++;enqueueStage(team,now)
}
export function recoverPipeline(team:团队,now=Date.now(),reason='宿主重开，流程已暂停；核对产物后显式恢复，未自动重放'):boolean {
 const p=team.pipeline;if(!p||p.status!=='running')return false
 p.status='interrupted';p.reason=reason;p.updatedAt=now;p.stateRevision++;return true
}
export function resumePipeline(team:团队,acknowledgeInterrupted=false,now=Date.now()):void {
 const p=team.pipeline;if(!p||p.status!=='interrupted')throw new 团队错误('只有 interrupted 流程可显式恢复；blocked 请补齐条件后另建流程')
 const task=team.tasks.find(t=>t.id===p.currentTaskId);if(!task)throw new 团队错误('阶段记录缺失，不能恢复')
 if(task.status!=='pending'&&task.status!=='completed'&&!acknowledgeInterrupted)throw new 团队错误('该尝试可能有文件副作用；须先核对并明确 acknowledgeInterrupted')
 if(task.status==='claimed'||task.status==='in_progress')throw new 团队错误('旧尝试仍未排空，请等待停止后核对再恢复')
 if(task.status!=='pending'&&task.status!=='completed'&&acknowledgeInterrupted)p.acknowledgedTaskIds=[...(p.acknowledgedTaskIds??[]),task.id]
 p.status='running';delete p.reason;delete p.endedAt;p.updatedAt=now;p.stateRevision++
 if(task.status!=='pending'&&task.status!=='completed')enqueueStage(team,now)
 else advancePipeline(team,now)
}
export function cancelPipeline(team:团队,now=Date.now()):void {
 const p=team.pipeline;if(p&&!['completed','cancelled'].includes(p.status))finish(p,'cancelled','用户取消流程；不采用迟到结果',now)
}
export function pipelineStatus(team:团队){
 const p=team.pipeline;if(!p)throw new 团队错误('当前团队不是科研流程')
 const tasks=p.taskIds.map(id=>team.tasks.find(t=>t.id===id)!).filter(Boolean).filter(t=>!t.reusedFrom)
 const observations=tasks.filter(t=>['completed','failed','cancelled'].includes(t.status)).map(t=>t.observation)
 const usage:Record<string,number>={},partial=new Set<string>();let unknownUsageTasks=0
 for(const o of observations){if(!o?.usage){unknownUsageTasks++;for(const k of ['input','output','cacheRead'])partial.add(k);continue}for(const k of ['input','output','cacheRead'] as const){if(o.usage[k]!==undefined)usage[k]=(usage[k]??0)+o.usage[k]!;else partial.add(k)}for(const k of o.usage.partial??[])partial.add(k)}
 return{...publicPipeline(p),observation:{tasks:tasks.length,revisionRounds:p.round,elapsedMs:Math.max(0,(p.endedAt??Date.now())-p.startedAt),submissionAttempts:observations.reduce((n,o)=>n+(o?.submissionAttempts??0),0),invalidSubmissions:observations.reduce((n,o)=>n+(o?.invalidSubmissions??0),0),acceptanceFailures:tasks.filter(t=>t.receipt?.state==='invalid'||t.receipt?.state==='blocked').length,usage,partialUsage:[...partial],unknownUsageTasks},stages:tasks.map(({settings:_settings,...task})=>task)}
}
