/** Bounded batch transitions over the original Team reducer, attempts and frozen settings. */
import type {团队,成员,任务} from './types.js'
import type {PipelineDefinition} from '../protocol/science-pipeline.js'
import {ScienceBatchSchema,publicScienceBatch,type ScienceBatch} from '../protocol/science-batch.js'
import type {ScienceTemplate} from './science-templates.js'
import {startPipeline,resumePipeline,recoverPipeline,cancelPipeline} from './science-pipeline.js'
import {TaskContractSchema,TaskSettingsSchema,type TaskContract,type TaskSettings} from '../protocol/task-contract.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import {加成员,加任务,团队错误} from './state.js'
export function startScienceBatch(team:团队,requestId:string,template:ScienceTemplate,items:{id:string;label:string;definition:PipelineDefinition}[],summaryOutputs:string[],freeze?:(member:成员,contract:TaskContract)=>TaskSettings,now=Date.now()):void {
 if(team.pipeline||team.scienceBatch||team.tasks.length)throw new 团队错误('批量任务须使用独立团队')
 const planned=items.map(item=>{const scratch:团队={...structuredClone(team),tasks:[]};startPipeline(scratch,requestId+':'+item.id,item.definition,freeze,now);return{...item,settingsByStage:scratch.pipeline!.settingsByStage}})
 const b=ScienceBatchSchema.parse({version:1,requestId,template,items:planned,index:0,status:'running',stateRevision:1,aggregateTaskIds:[],summaryOutputs,startedAt:now})
 // Input/output union is also the final delivery verification envelope.
 const allPaths=new Set([...b.items.flatMap(i=>[...i.definition.inputs,...i.definition.outputs]),...b.summaryOutputs])
 if(allPaths.size>64)throw new 团队错误('批量总文件数超过 64')
 const inputs=new Set(b.items.flatMap(i=>i.definition.inputs)),outputs=b.items.flatMap(i=>i.definition.outputs).concat(b.summaryOutputs)
 if(new Set(outputs).size!==outputs.length||outputs.some(p=>inputs.has(p)))throw new 团队错误('批量输出不能重叠或覆盖输入')
 team.scienceBatch=b
 加成员(team,{name:'aggregate',agent:'science-host-summary',role:'固定宿主汇总；无模型执行'})
 startItem(team,now)
}
function startItem(team:团队,now:number){const b=team.scienceBatch!;while(b.items[b.index]!.completed){const item=b.items[b.index]!;team.pipeline={...structuredClone(item.completed!),definition:structuredClone(item.definition),requestId:b.requestId+':'+item.id,routeSync:'pending'};if(b.index+1>=b.items.length){aggregate(team,now);return}b.index++}const item=b.items[b.index]!;startPipeline(team,b.requestId+':'+item.id,item.definition,(_m,c)=>{const stage=c.resultType==='data-summary'?'check':c.resultType==='review'?'review':'analyze';return structuredClone(item.settingsByStage[stage])},now,item.id);if(b.requestFingerprint)team.pipeline!.requestFingerprint=b.requestFingerprint}
function terminal(b:ScienceBatch,status:'completed'|'blocked'|'cancelled',reason:string,now:number){b.status=status;b.reason=reason.slice(0,7900);b.endedAt=now;b.stateRevision++}
function aggregate(team:团队,now:number){
 const b=team.scienceBatch!
 if(b.aggregateTaskIds.length>=16){terminal(b,'blocked','汇总已达到 16 次尝试上限',now);return}
 const inputs=[...new Map([...b.items.flatMap(item=>item.definition.initialVersions!),...b.items.flatMap(item=>{const p=item.completed!;const analysis=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.receipt?.state==='accepted'&&t.contract?.resultType==='model-metrics');if(!analysis?.receipt?.versions)throw new 团队错误('批量分析回执缺少内容版本');return analysis.receipt.versions.outputs})].map(v=>[v.path,v])).values()]
 const contract=TaskContractSchema.parse({submission:'tool',inputs:inputs.map(v=>v.path),outputs:b.summaryOutputs,access:'workspace-write'})
 b.summarySettings??=TaskSettingsSchema.parse({...resolveTaskSettings(contract,'deny-risky',['read','write']),versions:{version:1,inputs}})
 const id=`batch-summary-${b.aggregateTaskIds.length}`
 const task=加任务(team,{id,subject:'固定宿主汇总',assignee:'aggregate',contract,dependencies:[]},now);task.settings=structuredClone(b.summarySettings)
 b.aggregateTaskId=id;b.aggregateTaskIds.push(id);b.status='aggregating';b.stateRevision++
}
export function advanceScienceBatch(team:团队,now=Date.now()):void {
 const b=team.scienceBatch,p=team.pipeline;if(!b||!p||!['running','aggregating'].includes(b.status))return
 if(b.status==='aggregating'){
  const task=team.tasks.find(t=>t.id===b.aggregateTaskId)
  if(!task){terminal(b,'blocked','汇总任务丢失，未重放',now);return}
  if(['pending','claimed','in_progress'].includes(task.status))return
  terminal(b,task.status==='completed'&&task.receipt?.state==='accepted'?'completed':task.status==='cancelled'?'cancelled':'blocked',task.receipt?.reason??'批量宿主汇总结束；不代表独立科学认证',now);return
 }
 if(p.status==='running')return
 if(p.status==='interrupted'){b.status='interrupted';b.stateRevision++;return}
 if(p.status!=='completed'){terminal(b,p.status,p.reason??'批量项未通过，后续未执行',now);return}
 b.items[b.index]!.completed=structuredClone(p);b.stateRevision++
 if(b.index+1<b.items.length){b.index++;startItem(team,now)}else aggregate(team,now)
}
export function recoverScienceBatch(team:团队,now=Date.now()):boolean {
 const b=team.scienceBatch;if(!b||!['running','aggregating'].includes(b.status))return false
 recoverPipeline(team,now);b.status='interrupted';b.stateRevision++;b.reason='批量执行已暂停；已完成项保留，未知副作用须核对后显式恢复';return true
}
export function resumeScienceBatch(team:团队,ack=false,now=Date.now()):void {
 const b=team.scienceBatch;if(!b||b.status!=='interrupted')throw new 团队错误('只有 interrupted 批量可恢复')
 if(team.pipeline?.status==='completed'){
  const task=team.tasks.find(t=>t.id===b.aggregateTaskId)
  if(task&&['claimed','in_progress'].includes(task.status))throw new 团队错误('旧汇总尝试仍未排空')
  if(task&&task.status!=='pending'&&task.status!=='completed'&&!ack)throw new 团队错误('汇总可能已写入文件；须核对后 acknowledgeInterrupted')
  b.status='aggregating';b.stateRevision++;delete b.reason
  if(!task||!['pending','completed'].includes(task.status))aggregate(team,now);else advanceScienceBatch(team,now)
 }else{resumePipeline(team,ack,now);b.status='running';b.stateRevision++;delete b.reason;advanceScienceBatch(team,now)}
}
export function cancelScienceBatch(team:团队,now=Date.now()):void {const b=team.scienceBatch;if(b&&!['completed','cancelled'].includes(b.status)){cancelPipeline(team,now);terminal(b,'cancelled','用户取消批量；保留已有检查点及产物',now)}}
export {publicScienceBatch}

/** Only used on the unpublished derived Team, before scheduler admission. */
export function activateDerivedBatch(team:团队,history:任务[] ,now=Date.now()):void {if(!team.scienceBatch||team.tasks.some(t=>t.status!=='pending'))throw new 团队错误('派生批次已开始执行');team.tasks=structuredClone(history);delete team.pipeline;team.scienceBatch.index=0;startItem(team,now);ScienceBatchSchema.parse(team.scienceBatch)}
