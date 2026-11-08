/** Read-only receipt projection. Reuse the same outcome rules as the collaboration workbench. */
import {basename} from 'node:path'
import type {RunOverview} from '../protocol/run-overview.js'
import {TaskArtifactSchema,type TaskArtifact,type TaskArtifactCheck} from '../protocol/task-artifacts.js'
import {selectCollaborationOutcome} from '../protocol/collaboration-outcome.js'
import {文件类按名字} from '../files/file-kind.js'
import {fileIdentity} from '../artifacts/blobs.js'
import {DEFAULT_LIMITS} from '../artifacts/model.js'
const identity=(a:TaskArtifact)=>JSON.stringify([a.ownerSessionId,a.target.kind,a.target.kind==='run'?[a.target.id,a.target.epoch]:[a.target.teamId,a.target.id,a.target.attemptId],a.version.path,a.version.sha256,a.version.bytes,a.source,a.acceptance,a.scope])
export function projectAcceptedArtifacts(snapshot:RunOverview,owner:string):TaskArtifact[]{
 if(snapshot.ownerSessionId!==owner||snapshot.source==='unsupported'||snapshot.team&&snapshot.team.captainSessionId!==owner)return[]
 const result:TaskArtifact[]=[],seen=new Set<string>(),overall=selectCollaborationOutcome(snapshot)
 const add=(outcome:ReturnType<typeof selectCollaborationOutcome>,target:TaskArtifact['target'],label:string)=>{
  const historical=snapshot.source==='disk'
  const candidates=historical?outcome.inspectionArtifacts:outcome.state==='accepted'?outcome.artifacts:[]
  for(const row of candidates){
   const parsed=TaskArtifactSchema.safeParse({path:row.version.path,kind:文件类按名字(basename(row.version.path),'file'),label:label.slice(0,512),ownerSessionId:owner,target,version:row.version,
    source:snapshot.source,acceptance:historical?'historical':'accepted',scope:!historical&&overall.state==='accepted'?row.scope:'stage'})
   if(!parsed.success)continue
   const key=identity(parsed.data);if(!seen.has(key)){seen.add(key);result.push(parsed.data)}
  }
 }
 const team=snapshot.team
 if(team)for(const task of team.tasks){
  if(task.status!=='completed'||task.receipt?.state!=='accepted'||!task.receipt.versions||!task.attemptId||!task.contract||task.attempt<1)continue
  add(selectCollaborationOutcome(snapshot,{kind:'task',teamId:team.id,taskId:task.id}),{kind:'task',teamId:team.id,id:task.id,attemptId:task.attemptId},task.subject)
 }
 for(const run of snapshot.runs){
  // Managed Team results already have an authoritative task entry; ordinary subagents retain epoch identity.
  if(run.kind!=='subagent'||run.state!=='completed'||!run.contract||run.epoch<1||run.resultEpoch!==run.epoch||run.receipt!=='accepted'||run.taskReceipt?.state!=='accepted')continue
  add(selectCollaborationOutcome(snapshot,{kind:'run',runId:run.id}),{kind:'run',id:run.id,epoch:run.epoch},run.label)
 }
 return result
}
/** A bounded explicit content check; preview still reads current bytes and is labelled accordingly. */
export async function checkAcceptedArtifact(workspace:string,owner:string,requested:TaskArtifact,readSnapshot:()=>RunOverview):Promise<TaskArtifactCheck>{
 const unavailable=(reason:string):TaskArtifactCheck=>({state:'unavailable',checkedAt:new Date().toISOString(),reason})
 const parsed=TaskArtifactSchema.safeParse(requested)
 if(!parsed.success||parsed.data.ownerSessionId!==owner)return unavailable('验收产物不属于当前会话')
 const key=identity(parsed.data)
 const stillOwned=()=>{try{return projectAcceptedArtifacts(readSnapshot(),owner).some(a=>identity(a)===key)}catch{return false}}
 if(!stillOwned())return unavailable('验收来源或执行代次已变化')
 try{
  const actual=await fileIdentity(workspace,parsed.data.version.path,{maxBytes:DEFAULT_LIMITS.hashBytes,timeoutMs:DEFAULT_LIMITS.hashMs})
  if(!stillOwned())return unavailable('核对期间验收来源或执行代次已变化')
  return{state:actual.sha256===parsed.data.version.sha256&&actual.bytes===parsed.data.version.bytes?'matches':'changed',checkedAt:new Date().toISOString()}
 }catch{return unavailable('当前文件不存在、越界或无法在限制内核对')}
}
