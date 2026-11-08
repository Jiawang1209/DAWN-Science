/** Exact drained task attempts only. An absent receipt is never evidence of success. */
import type {RunOverview} from './run-overview.js'
import {collaborationTaskKey} from './collaboration-settlement.js'
export function taskDeliveryNotice(snapshot:RunOverview,selection:string|undefined){
 const team=snapshot.team
 if(snapshot.source!=='live'||team?.captainSessionId!==snapshot.ownerSessionId)return
 const task=team.tasks.find(t=>collaborationTaskKey(team.id,t.id)===selection)
 if(!task?.attemptId||task.attempt<=0||task.status!=='failed'||task.receipt||task.contract?.submission!=='tool')return
 const run=snapshot.runs.find(r=>r.kind==='team'&&r.address.length===3&&r.address[0]===team.id&&r.phase==='drained'&&r.epoch>0&&r.resultEpoch===r.epoch&&r.state==='failed'&&r.taskAttempt?.teamId===team.id&&r.taskAttempt.taskId===task.id&&r.taskAttempt.attempt===task.attempt&&r.taskAttempt.attemptId===task.attemptId)
 if(run?.observation?.submissionAttempts!==0)return
 return task.contract.resultType==='review'?'review-unsubmitted':'task-unsubmitted'
}
