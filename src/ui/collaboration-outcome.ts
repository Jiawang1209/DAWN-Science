/** Pure read-only projection of one overview. It never schedules, reads files or retries. */
import type {RunOverview} from '../protocol/run-overview.js'
import type {TeamSnapshot} from '../protocol/events.js'
import type {TaskReceipt} from '../protocol/task-contract.js'
import type {TaskAttemptBinding} from '../protocol/run-explanation.js'
import type {FileVersion} from '../protocol/file-versions.js'
import {collaborationTaskKey,hasCurrentAcceptance,type Run} from './collaboration-model.js'
export type OutcomeAction='inspect-feedback'|'inspect-inputs'|'inspect-findings'|'inspect-artifacts'|'wait-for-drain'|'inspect-recovery'
export type OutcomeState='active'|'accepted'|'blocked'|'failed'|'stopping'|'history'|'unverified'|'cancelled'
export type OutcomeSelection=string|{kind:'run';runId:string}|{kind:'task';teamId:string;taskId:string}
export interface OutcomeArtifact {
 version:FileVersion
 selectionKey:string
 scope:'stage'|'final'
 runId?:string
 epoch?:number
 teamId?:string
 taskId?:string
 attemptId?:string
}
export interface OutcomeView {
 state:OutcomeState
 blocker?:string
 action?:OutcomeAction
 /** Existing row key to focus before opening the inspection action. */
 actionTarget?:{selectionKey:string}
 acceptedPaths:string[]
 /** Host accepted content versions, suitable for existing version-aware preview. */
 artifacts:OutcomeArtifact[]
 /** Inspection only: these versions may belong to history or an unverified receipt. */
 inspectionArtifacts:OutcomeArtifact[]
 acceptanceScope?:'stage'|'final'
 pendingReview?:boolean
 /** Cancellation alone does not prove that the associated process has drained. */
 drainVerified?:boolean
 /** Acceptance does not imply that the route write has succeeded. */
 routeSync?:NonNullable<TeamSnapshot['pipeline']>['routeSync']
}
type Task=TeamSnapshot['tasks'][number]
const activeTask=(task:Task)=>['pending','claimed','in_progress'].includes(task.status)
function view(state:OutcomeState,action?:OutcomeAction,blocker?:string):OutcomeView {
 return{state,acceptedPaths:[],artifacts:[],inspectionArtifacts:[],...(action?{action}:{}),...(blocker?{blocker}:{})}
}
function feedback(receipt?:TaskReceipt){
 return receipt?.reason||receipt?.result?.blockers.join('；')||(receipt?.result?.data?.kind==='review'?receipt.result.data.findings.join('；'):'')||receipt?.summary
}
function withArtifacts(result:OutcomeView,artifacts:OutcomeArtifact[]):OutcomeView {
 return{...result,...(result.state==='accepted'?{acceptanceScope:artifacts.some(artifact=>artifact.scope==='stage')?'stage' as const:'final' as const}:{}),artifacts,acceptedPaths:[...new Set(artifacts.map(a=>a.version.path))]}
}
function inspection(result:OutcomeView,artifacts:OutcomeArtifact[]):OutcomeView{return{...result,inspectionArtifacts:artifacts}}
function target(result:OutcomeView,selectionKey:string):OutcomeView{return{...result,actionTarget:{selectionKey}}}
function runOutcome(snapshot:RunOverview,run:Run):OutcomeView {
 const result=projectRunOutcome(snapshot,run),team=snapshot.team
 if(!team||result.state!=='accepted')return target(result,`run:${run.id}`)
 const task=team.tasks.find(task=>taskRun(snapshot,team,task,run.phase)===run)
 const canonical=groupRuns(snapshot,team).includes(run)
 const inBatch=!!team.scienceBatch&&(task?taskInBatch(snapshot,team,task)||team.scienceBatch.taskIds===undefined:canonical)
 const belongs=inBatch||!!team.pipeline&&(task?team.pipeline.taskIds.includes(task.id):canonical)
 if(!belongs)return target(result,`run:${run.id}`)
 const final=!!task&&runVersionsMatch(run,task)&&(inBatch?task.id===team.scienceBatch!.aggregateTaskId&&projectBatchOutcome(snapshot,team).state==='accepted':isFinalPipelineTask(team,task))
 const scope=final?'final':'stage'
 return target({...result,acceptanceScope:scope,pendingReview:!final&&team.pipeline?.stage==='review'&&team.pipeline.status!=='completed',artifacts:result.artifacts.map(artifact=>({...artifact,scope}))},`run:${run.id}`)
}
function projectRunOutcome(snapshot:RunOverview,run:Run):OutcomeView {
 const artifacts=(run.taskReceipt?.versions?.outputs??[]).map(version=>({version,selectionKey:`run:${run.id}`,runId:run.id,...(run.resultEpoch!==undefined?{epoch:run.resultEpoch}:{}),scope:'final' as const}))
 if(snapshot.source!=='live'||run.phase==='unknown')return inspection(view('history','inspect-artifacts'),artifacts)
 if(run.phase==='stopping')return view('stopping','wait-for-drain')
 if(run.phase==='running'||run.phase==='queued')return view('active','inspect-feedback')
 if(run.state==='cancelled')return{...view('cancelled','inspect-recovery'),drainVerified:hasDrainProof(run)}
 if(run.state==='interrupted')return inspection(view('unverified','inspect-recovery',run.reason),artifacts)
 if(run.state==='queued'||run.state==='running'||run.state==='idle')return view('active','inspect-feedback')
 const current=run.epoch>0&&run.resultEpoch!==undefined&&run.resultEpoch===run.epoch
 if(!current)return inspection(view('unverified','inspect-artifacts'),artifacts)
 if(run.taskReceipt?.state==='blocked'||run.taskReceipt?.state==='invalid')return inspection(view('blocked','inspect-feedback',feedback(run.taskReceipt)),artifacts)
 if(run.state==='failed')return inspection(view('failed','inspect-feedback',run.reason||feedback(run.taskReceipt)),artifacts)
 if(run.contract&&hasCurrentAcceptance(run)&&run.taskReceipt?.state==='accepted'&&run.taskReceipt.versions)return withArtifacts(view('accepted','inspect-artifacts'),artifacts)
 return inspection(view('unverified','inspect-artifacts'),artifacts)
}
function taskArtifacts(team:TeamSnapshot,task:Task,scope:'stage'|'final'):OutcomeArtifact[]{
 return(task.receipt?.versions?.outputs??[]).map(version=>({version,selectionKey:collaborationTaskKey(team.id,task.id),teamId:team.id,taskId:task.id,...(task.attemptId?{attemptId:task.attemptId}:{}),scope}))
}
function taskAccepted(task:Task){return task.status==='completed'&&Number.isInteger(task.attempt)&&task.attempt>0&&!!task.contract&&!!task.attemptId&&task.receipt?.state==='accepted'&&!!task.receipt.versions}
/** Prefer current live admission; bounded history is a legacy fallback only. */
function taskRun(snapshot:RunOverview,team:TeamSnapshot,task:Task,phase:Run['phase']){
 if(snapshot.source!=='live')return undefined
 const matches=(binding:TaskAttemptBinding|undefined)=>binding?.teamId===team.id&&binding.taskId===task.id&&binding.attempt===task.attempt&&(binding.attemptId===task.attemptId||task.status==='cancelled'&&!task.attemptId)
 return snapshot.runs.find(run=>run.phase===phase&&(phase!=='drained'||hasDrainProof(run))&&(run.taskAttempt?matches(run.taskAttempt):snapshot.history?.events.some(event=>event.type==='started'&&event.childId===run.id&&event.epoch===run.epoch&&matches(event.taskAttempt))))
}
function taskStopping(snapshot:RunOverview,team:TeamSnapshot,task:Task){return!!taskRun(snapshot,team,task,'stopping')}
function taskOutcome(snapshot:RunOverview,team:TeamSnapshot,task:Task):OutcomeView {
 const result=projectTaskOutcome(snapshot,team,task),p=team.pipeline
 const inBatch=!!team.scienceBatch&&(taskInBatch(snapshot,team,task)||team.scienceBatch.taskIds===undefined)
 if(result.state!=='accepted'||!inBatch&&!p?.taskIds.includes(task.id))return target(result,collaborationTaskKey(team.id,task.id))
 const final=inBatch?task.id===team.scienceBatch!.aggregateTaskId&&projectBatchOutcome(snapshot,team).state==='accepted':isFinalPipelineTask(team,task)
 const scope=final?'final':'stage'
 return target({...result,acceptanceScope:scope,pendingReview:!final&&p?.stage==='review'&&p.status!=='completed',artifacts:result.artifacts.map(artifact=>({...artifact,scope})),...(p?{routeSync:p.routeSync}:{})},collaborationTaskKey(team.id,task.id))
}
function projectTaskOutcome(snapshot:RunOverview,team:TeamSnapshot,task:Task):OutcomeView {
 const artifacts=taskArtifacts(team,task,'final')
 if(snapshot.source!=='live')return inspection(view('history','inspect-artifacts'),artifacts)
 if(taskStopping(snapshot,team,task))return view('stopping','wait-for-drain')
 if(activeTask(task))return view('active',task.dependencies.length?'inspect-inputs':'inspect-feedback')
 if(task.status==='cancelled')return{...view('cancelled','inspect-recovery'),drainVerified:!!taskRun(snapshot,team,task,'drained')}
 if(!task.attemptId||!Number.isInteger(task.attempt)||task.attempt<=0)return inspection(view('unverified','inspect-artifacts'),artifacts)
 if(task.receipt?.state==='blocked'||task.receipt?.state==='invalid')return inspection(view('blocked','inspect-feedback',feedback(task.receipt)),artifacts)
 if(task.status==='failed')return inspection(view('failed','inspect-feedback',feedback(task.receipt)),artifacts)
 if(taskAccepted(task))return withArtifacts(view('accepted','inspect-artifacts'),artifacts)
 return inspection(view('unverified','inspect-artifacts'),artifacts)
}
/** The review's direct dependencies are authoritative; names and round suffixes are not. */
function reviewAnalysis(team:TeamSnapshot,review:Task,taskIds:string[]):Task|undefined {
 const candidates=review.dependencies.map(id=>team.tasks.find(task=>task.id===id)).filter((task):task is Task=>!!task&&taskIds.includes(task.id)&&task.contract?.resultType==='model-metrics'&&taskAccepted(task))
 return candidates.length===1?candidates[0]:undefined
}
function passingReview(review:Task,analysis:Task){
 const result=review.receipt?.result,data=result?.data,outputs=analysis.receipt!.versions!.outputs,inputs=review.receipt?.versions?.inputs??[]
 return taskAccepted(review)&&review.contract?.resultType==='review'&&data?.kind==='review'&&data.verdict==='pass'&&!result?.blockers.length&&
  outputs.length>0&&review.contract.inputs.length===outputs.length&&outputs.every(v=>review.contract!.inputs.includes(v.path))&&data.reviewedPaths.length===outputs.length&&outputs.every(v=>data.reviewedPaths.includes(v.path))&&inputs.length===outputs.length&&outputs.every(v=>inputs.some(i=>i.path===v.path&&i.sha256===v.sha256&&i.bytes===v.bytes))
}
function validCheckpoint(team:TeamSnapshot){
 const p=team.pipeline!
 return p.taskIds.includes(p.currentTaskId)&&new Set(p.taskIds).size===p.taskIds.length&&p.taskIds.every(id=>team.tasks.filter(task=>task.id===id).length===1)
}
function sameVersions(a:FileVersion[],b:FileVersion[]){return a.length===b.length&&a.every(v=>b.some(other=>other.path===v.path&&other.sha256===v.sha256&&other.bytes===v.bytes))}
function contractInputsMatch(task:Task){const inputs=task.receipt?.versions?.inputs;return!!inputs&&task.contract?.inputs.length===inputs.length&&task.contract.inputs.every(path=>inputs.some(v=>v.path===path))}
/** Complete host provenance, including the accepted check and independent review. */
function completedPipelineProof(team:TeamSnapshot){
 const p=team.pipeline!
 if(p.status!=='completed'||p.stage!=='review'||!validCheckpoint(team))return undefined
 const review=team.tasks.find(task=>task.id===p.currentTaskId)!,analysis=reviewAnalysis(team,review,p.taskIds)
 if(!analysis||!analysis.assignee||!review.assignee||analysis.assignee===review.assignee||!passingReview(review,analysis)||analysis.receipt?.result?.data?.kind!=='model-metrics'||!contractInputsMatch(analysis))return undefined
 const checks=analysis.dependencies.map(id=>team.tasks.find(task=>task.id===id)).filter((task):task is Task=>!!task&&p.taskIds.includes(task.id)&&task.contract?.resultType==='data-summary'&&taskAccepted(task))
 if(checks.length!==1)return undefined
 const check=checks[0]!,data=check.receipt?.result?.data
 if(data?.kind!=='data-summary'||data.issues.length||!contractInputsMatch(check)||!sameVersions(check.receipt!.versions!.inputs,analysis.receipt.versions!.inputs))return undefined
 return{check,analysis,review}
}
function isFinalPipelineTask(team:TeamSnapshot,task:Task){
 const proof=team.pipeline&&completedPipelineProof(team)
 return!!proof&&(task.id===proof.analysis.id||task.id===proof.review.id)
}
function runVersionsMatch(run:Run,task:Task){
 const runVersions=run.taskReceipt?.versions,taskVersions=task.receipt?.versions
 return!!runVersions&&!!taskVersions&&sameVersions(runVersions.inputs,taskVersions.inputs)&&sameVersions(runVersions.outputs,taskVersions.outputs)
}
/** Public batch checkpoints expose current tasks, plus their declared dependency graph. */
function taskInBatch(snapshot:RunOverview,team:TeamSnapshot,task:Task){
 const batch=team.scienceBatch!
 if(batch.taskIds!==undefined)return batch.taskIds.includes(task.id)
 const ids=new Set<string>(),pending=[...(team.pipeline?.taskIds??[]),...(batch.aggregateTaskId?[batch.aggregateTaskId]:[]),...batch.items.flatMap(item=>item.currentTaskId?[item.currentTaskId]:[])]
 while(pending.length){const id=pending.pop()!;if(ids.has(id))continue;ids.add(id);pending.push(...(team.tasks.find(candidate=>candidate.id===id)?.dependencies??[]))}
 return ids.has(task.id)||groupRuns(snapshot,team).some(run=>run.taskAttempt?.teamId===team.id&&run.taskAttempt.taskId===task.id&&run.taskAttempt.attempt===task.attempt&&run.taskAttempt.attemptId===task.attemptId)
}
/** Canonical team addresses identify the whole group, never an individual task attempt. */
function groupRuns(snapshot:RunOverview,team:TeamSnapshot){return snapshot.source==='live'?snapshot.runs.filter(run=>(run.kind==='team'||run.kind==='bot')&&run.address.length===3&&run.address[0]===team.id):[]}
function groupStopping(snapshot:RunOverview,team:TeamSnapshot){return groupRuns(snapshot,team).find(run=>run.phase==='stopping')}
function hasDrainProof(run:Run){return run.phase==='drained'&&run.epoch>0&&run.resultEpoch===run.epoch&&['completed','failed','cancelled'].includes(run.state)}
function groupDrained(snapshot:RunOverview,team:TeamSnapshot){
 const runs=groupRuns(snapshot,team)
 return runs.length>0&&runs.every(hasDrainProof)
}
function pipelineOutcome(snapshot:RunOverview,team:TeamSnapshot):OutcomeView {
 const p=team.pipeline!
 if(!validCheckpoint(team))return{...view('unverified','inspect-feedback'),routeSync:p.routeSync}
 const review=team.tasks.find(t=>t.id===p.currentTaskId),analysis=review&&p.stage==='review'?reviewAnalysis(team,review,p.taskIds):undefined
 const artifacts=analysis?taskArtifacts(team,analysis,'stage'):[]
 let result:OutcomeView
 if(snapshot.source!=='live')result=inspection(view('history','inspect-artifacts'),artifacts)
 else if(team.tasks.some(task=>p.taskIds.includes(task.id)&&taskStopping(snapshot,team,task)))result=view('stopping','wait-for-drain')
 else if(p.status==='cancelled')result=groupStopping(snapshot,team)?target(view('stopping','wait-for-drain'),`run:${groupStopping(snapshot,team)!.id}`):{...view('cancelled','inspect-recovery'),drainVerified:groupDrained(snapshot,team)}
 else if(p.status==='interrupted')result=view('unverified','inspect-recovery',p.reason)
 else if(p.status==='blocked')result=withArtifacts(view('blocked','inspect-feedback',feedback(review?.receipt)||p.reason),artifacts)
 else if(p.status==='completed')result=completedPipelineProof(team)&&analysis?withArtifacts(view('accepted','inspect-artifacts'),taskArtifacts(team,analysis,'final')):inspection(view('unverified','inspect-findings'),artifacts)
 else if(review&&['completed','failed'].includes(review.status)&&(review.receipt?.state==='blocked'||review.receipt?.state==='invalid'))result=withArtifacts(view('blocked','inspect-feedback',feedback(review.receipt)),artifacts)
 else result=withArtifacts(view('active',p.stage==='review'?'inspect-findings':'inspect-feedback'),artifacts)
 const actionTask=result.state==='accepted'&&result.artifacts.length?analysis:team.tasks.find(task=>p.taskIds.includes(task.id)&&taskStopping(snapshot,team,task))??review
 const outcome={...result,...(result.state==='accepted'?{acceptanceScope:'final' as const}:artifacts.length?{acceptanceScope:'stage' as const}:{}),pendingReview:p.stage==='review'&&p.status!=='completed',routeSync:p.routeSync}
 return outcome.actionTarget?outcome:actionTask?target(outcome,collaborationTaskKey(team.id,actionTask.id)):outcome
}
function blockedReceiptTask(task:Task|undefined):task is Task {
 return!!task&&Number.isInteger(task.attempt)&&task.attempt>0&&!!task.attemptId&&['completed','failed'].includes(task.status)&&(task.receipt?.state==='blocked'||task.receipt?.state==='invalid')
}
function batchNavigationTask(snapshot:RunOverview,team:TeamSnapshot){
 const batch=team.scienceBatch!,stopping=team.tasks.find(task=>taskStopping(snapshot,team,task))
 if(stopping)return stopping
 const summary=team.tasks.find(task=>task.id===batch.aggregateTaskId)
 if(summary&&(['aggregating','completed'].includes(batch.status)||blockedReceiptTask(summary)))return summary
 const blocked=batch.items.filter(item=>item.status==='blocked').map(item=>team.tasks.find(task=>task.id===item.currentTaskId)).find(task=>blockedReceiptTask(task)&&(batch.taskIds===undefined||taskInBatch(snapshot,team,task)))
 if(blocked)return blocked
 const p=team.pipeline,current=p&&validCheckpoint(team)&&batch.taskIds?.includes(p.currentTaskId)?team.tasks.find(task=>task.id===p.currentTaskId):undefined
 if(batch.status==='blocked')return p?.status==='blocked'&&blockedReceiptTask(current)?current:undefined
 return summary??team.tasks.find(task=>task.id===batch.items[batch.index]?.currentTaskId)??current
}
function batchOutcome(snapshot:RunOverview,team:TeamSnapshot):OutcomeView {
 const task=batchNavigationTask(snapshot,team),result=projectBatchOutcome(snapshot,team)
 return result.actionTarget?result:task?target(result,collaborationTaskKey(team.id,task.id)):result
}
function projectBatchOutcome(snapshot:RunOverview,team:TeamSnapshot):OutcomeView {
 const batch=team.scienceBatch!,summary=team.tasks.find(t=>t.id===batch.aggregateTaskId)
 if(snapshot.source!=='live')return inspection(view('history','inspect-artifacts'),summary?taskArtifacts(team,summary,'final'):[])
 if(team.tasks.some(task=>taskStopping(snapshot,team,task)))return view('stopping','wait-for-drain')
 if(batch.status==='cancelled')return groupStopping(snapshot,team)?target(view('stopping','wait-for-drain'),`run:${groupStopping(snapshot,team)!.id}`):{...view('cancelled','inspect-recovery'),drainVerified:groupDrained(snapshot,team)}
 if(batch.status==='interrupted')return view('unverified','inspect-recovery',batch.reason)
 if(batch.status==='blocked')return view('blocked','inspect-feedback',feedback(summary?.receipt)||batch.reason)
 if(batch.status!=='completed')return view('active',batch.status==='aggregating'?'inspect-artifacts':'inspect-feedback')
 if(batch.completed!==batch.total||batch.items.length!==batch.total||batch.items.some(item=>item.status!=='completed')||!summary||!taskAccepted(summary))return view('unverified','inspect-artifacts')
 const artifacts=taskArtifacts(team,summary,'final')
 if(artifacts.length!==batch.summaryOutputs.length||!batch.summaryOutputs.every(path=>artifacts.some(a=>a.version.path===path)))return inspection(view('unverified','inspect-artifacts'),artifacts)
 return withArtifacts(view('accepted','inspect-artifacts'),artifacts)
}
function combineOutcomes(results:OutcomeView[]):OutcomeView|undefined {
 for(const state of ['stopping','active','blocked','failed','cancelled','unverified','history'] as const){
  const result=results.find(result=>result.state===state)
  if(!result)continue
  const blocker=state==='active'?results.find(result=>result.state==='blocked'&&result.blocker):undefined
  return{...result,...(blocker?{blocker:blocker.blocker,action:blocker.action,actionTarget:blocker.actionTarget}:{}),acceptedPaths:[],artifacts:[],inspectionArtifacts:results.flatMap(result=>result.inspectionArtifacts)}
 }
 if(!results.length)return undefined
 const result=withArtifacts(view('accepted','inspect-artifacts'),results.flatMap(result=>result.artifacts))
 const key=result.artifacts[0]?.selectionKey??results.find(result=>result.actionTarget)?.actionTarget?.selectionKey
 return key?target(result,key):result
}
function overallTeam(snapshot:RunOverview,team:TeamSnapshot):OutcomeView {
 if(team.scienceBatch)return batchOutcome(snapshot,team)
 if(team.pipeline)return pipelineOutcome(snapshot,team)
 return combineOutcomes(team.tasks.map(task=>taskOutcome(snapshot,team,task)))??view(snapshot.source==='live'?'unverified':'history','inspect-feedback')
}
export function selectCollaborationOutcome(snapshot:RunOverview,selection?:OutcomeSelection):OutcomeView {
 if(snapshot.team&&snapshot.team.captainSessionId!==snapshot.ownerSessionId)return view('unverified','inspect-feedback')
 if(selection!==undefined){
  if(typeof selection==='object'){
   if(selection.kind==='run'){const run=snapshot.runs.find(run=>run.id===selection.runId);return run?runOutcome(snapshot,run):view('unverified','inspect-feedback')}
   const team=snapshot.team,task=team?.id===selection.teamId?team.tasks.find(task=>task.id===selection.taskId):undefined
   return team&&task?taskOutcome(snapshot,team,task):view('unverified','inspect-feedback',snapshot.teamIssue)
  }
  const task=snapshot.team?.tasks.find(task=>collaborationTaskKey(snapshot.team!.id,task.id)===selection)
  if(task)return taskOutcome(snapshot,snapshot.team!,task)
  const run=snapshot.runs.find(run=>`run:${run.id}`===selection||run.id===selection)
  return run?runOutcome(snapshot,run):view('unverified','inspect-feedback',snapshot.teamIssue)
 }
 if(snapshot.team)return overallTeam(snapshot,snapshot.team)
 if(snapshot.teamIssue)return view('unverified','inspect-feedback',snapshot.teamIssue)
 return combineOutcomes(snapshot.runs.map(run=>runOutcome(snapshot,run)))??view(snapshot.source==='live'?'unverified':'history','inspect-feedback')
}
