/** Which persisted versions remain authoritative at a particular checkpoint. */
import type {团队} from './types.js'
import {taskOutputReservation} from '../bot/output-locks.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import {TaskContractSchema} from '../protocol/task-contract.js'
import {assertFileVersions} from '../artifacts/task-versions.js'
import type {FileVersion} from '../protocol/file-versions.js'
export function pipelineCheckpointVersions(team:团队):FileVersion[]|undefined {
 const p=team.pipeline;if(!p?.definition.initialVersions)return
 const b=team.scienceBatch
 const files=b?b.items.flatMap(i=>i.definition.initialVersions!):[...p.definition.initialVersions]
 if(b){
  for(const item of b.items){if(!item.completed)continue;const analysis=[...item.completed.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted');if(!analysis?.receipt?.versions)throw new Error('已验收批量项缺少版本');files.push(...analysis.receipt.versions.outputs)}
  if(b.status==='completed'){const summary=team.tasks.find(t=>t.id===b.aggregateTaskId);if(!summary?.receipt?.versions)throw new Error('已验收汇总缺少版本');files.push(...summary.receipt.versions.outputs)}
 }
 // An analysis retry may replace its own unaccepted outputs. Review/delivery must match accepted analysis.
 const reviewing=b?.concurrency===2?b.items.filter(i=>!i.completed&&i.checkpoint?.stage==='review').map(i=>i.checkpoint!):p.stage==='review'&&!b?.items[b.index]?.completed?[p]:[]
 for(const checkpoint of reviewing){
  const analysis=[...checkpoint.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted')
  if(!analysis?.receipt?.versions)throw new Error('已验收分析缺少内容版本，不能恢复或交付')
  files.push(...analysis.receipt.versions.outputs)
 }
 const byPath=new Map(files.map(file=>[file.path,file]));return [...byPath.values()]
}
export async function assertPipelineVersions(team:团队,workspace:string,signal?:AbortSignal,reserve=true):Promise<void> {
 const files=pipelineCheckpointVersions(team)
 if(files){const release=reserve?await taskOutputReservation(workspace,resolveTaskSettings(TaskContractSchema.parse({inputs:files.map(f=>f.path),resultType:'data-summary'}),'deny-risky'),signal??new AbortController().signal):()=>{};try{await assertFileVersions(workspace,files,signal)}finally{release()}}
}
