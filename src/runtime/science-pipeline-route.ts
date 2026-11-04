/** Compare-and-swap projection of already validated child facts, never model prose. */
import {acceptedBatchFacts} from '../team/science-batch-facts.js'
import type {团队} from '../team/types.js'
import type {AnalysisRouteBook} from './analysis-route-book.js'
import {assertPipelineVersions} from '../team/science-pipeline-versions.js'
import {pipelineCheckpointVersions} from '../team/science-pipeline-versions.js'
import {taskOutputReservation} from '../bot/output-locks.js'
import {resolveTaskSettings} from '../subagent/task-tools.js'
import {TaskContractSchema} from '../protocol/task-contract.js'
import {sameFileVersions} from '../protocol/file-versions.js'
export async function projectPipelineRoute(book:AnalysisRouteBook,team:团队,options:{workspace?:string;signal?:AbortSignal;isCurrent?:()=>boolean}={}):Promise<'pending'|'applied'|'conflict'> {
 if(team.scienceBatch&&team.scienceBatch.status!=='completed')return'pending'
 if(options.signal?.aborted||options.isCurrent?.()===false)return'pending'
 if(team.pipeline?.definition.initialVersions){
  if(!options.workspace)return'conflict'
  let release:(()=>void)|undefined
  try{
   const files=pipelineCheckpointVersions(team)??[]
   const settings=resolveTaskSettings(TaskContractSchema.parse({access:'read-only',inputs:files.map(f=>f.path),resultType:'data-summary',submission:'tool'}),'deny-risky')
   release=await taskOutputReservation(options.workspace,settings,options.signal??new AbortController().signal)
   await assertPipelineVersions(team,options.workspace,options.signal,false)
   if(options.signal?.aborted||options.isCurrent?.()===false)return'pending'
   return projectVerifiedRoute(book,team)
  }catch(error){if(options.signal?.aborted)return'pending';return'conflict'}finally{release?.()}
 }
 return projectVerifiedRoute(book,team)
}
function projectVerifiedRoute(book:AnalysisRouteBook,team:团队):'pending'|'applied'|'conflict' {
 const p=team.pipeline;if(!p||p.status!=='completed')return'pending'
 const current=book.read();if(!current||current.routeId!==p.definition.route.routeId)return'conflict'
 const analysis=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted')
 const review=team.tasks.find(t=>t.id===p.currentTaskId)
 if(!analysis?.receipt?.result||review?.receipt?.state!=='accepted'||review.receipt.result?.data?.kind!=='review'||review.receipt.result.data.verdict!=='pass')return'conflict'
 if(p.definition.initialVersions&&(!analysis.receipt.versions||!review.receipt.versions||!sameFileVersions(analysis.receipt.versions.outputs,review.receipt.versions.inputs)))return'conflict'
 const sources=team.scienceBatch?[...acceptedBatchFacts(team).map(f=>f.analysis),team.tasks.find(t=>t.id===team.scienceBatch!.aggregateTaskId)!]:[analysis]
 if(sources.some(t=>t?.receipt?.state!=='accepted'||!t.receipt.result||!t.receipt.versions&&team.scienceBatch))return'conflict'
 const deliverables=sources.flatMap(source=>source.receipt!.result!.deliverables.map(d=>{const file=source.receipt!.versions?.outputs.find(f=>f.path===d.path);return file?{...d,note:`${d.note??''} sha256:${file.sha256} bytes:${file.bytes}`.trim()}:d}))
 const step=current.steps.find(s=>s.id===p.definition.stepId);if(!step)return'conflict'
 const marker=`[science-pipeline:${team.id}:${analysis.id}:${review.id}]`
 const verification={...review.receipt.result.verification,note:`${marker} ${review.receipt.result.verification.note}`}
 if(step.notes.includes(marker)&&step.status==='delivered'&&step.verification.note===verification.note&&deliverables.every(d=>step.deliverables.some(old=>old.path===d.path)))return'applied'
 if(current.revision!==p.definition.route.revision)return'conflict'
 const {routeId:_id,revision,updatedAt:_time,...draft}=current
 const target=draft.steps.find(s=>s.id===p.definition.stepId)!
 target.status='delivered';target.blockers=[];target.deliverables=deliverables
 target.execution={...analysis.receipt.result.execution,note:`${marker} ${analysis.receipt.result.execution.note}`}
 target.verification=verification;target.needsReview=false;target.notes=[...target.notes,marker,'交付事实来自子任务宿主回执；工具与格式验收不等于科学认证。']
 book.replace(revision,draft,'科研流程已完成，按冻结路线版本写回宿主验收事实')
 return'applied'
}
