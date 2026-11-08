/** Reuse the orchestration ledger's review holds; never keep a second usage counter. */
import type {团队} from './types.js'
import type {OrchestrationService} from '../orchestration/service.js'
import {reviewReservationKey,type ReviewRunAdmission} from '../orchestration/budget.js'
const reviewTasks=(team:团队)=>team.approvedPlan?.tasks.filter(m=>m.review).map(m=>team.tasks.find(t=>t.id===m.taskId))??[]
const budgetId=(team:团队,taskId:string)=>`${team.id}:${taskId}`
function identity(team:团队,service:OrchestrationService,taskId:string){
 if(team.approvedPlan?.owner!==service.store.ownerSessionId||team.captainSessionId!==service.store.ownerSessionId||team.approvedPlan.teamId!==team.id)throw new Error('批准方案审阅预留不属于当前会话')
 return reviewReservationKey(service.store.ownerSessionId,budgetId(team,taskId),0)
}
export function prepareApprovedReviewReservations(team:团队,service:OrchestrationService):void{
 if(!team.approvedPlan)return
 const budget=service.budgetSnapshot(),reviews=reviewTasks(team)
 if(reviews.some(t=>!t))throw new Error('批准方案审阅任务缺失')
 const pending=reviews.filter(t=>t!.status==='pending')
 const own=pending.map(t=>({task:t!,key:identity(team,service,t!.id)})).map(row=>({...row,reservation:budget.reviewReservations?.find(r=>r.key===row.key)}))
 if(!budget.limits.reserveReviewRuns&&!own.some(r=>r.reservation?.remainingRuns===1))return
 if(own.some(r=>r.reservation&&r.reservation.phase!=='held'))throw new Error('批准方案审阅预留恢复需先核对；已结束的执行不能重放')
 const pendingCount=team.tasks.filter(t=>t.status==='pending').length,ownHeld=own.filter(r=>r.reservation?.remainingRuns===1).length
 const available=budget.limits.maxRuns===undefined?Infinity:budget.limits.maxRuns-budget.consumedRuns-(budget.reviewReservedRuns??0)+ownHeld
 if(available<pendingCount)throw new Error(`批准方案预算不足：剩余 ${pendingCount} 项任务（含独立审阅），可用 ${available} 轮`)
 for(const row of own)service.reserveReviewRuns(budgetId(team,row.task.id),0,1)
}
export function approvedReviewAdmission(team:团队,taskId:string,service:OrchestrationService):ReviewRunAdmission|undefined{
 if(!team.approvedPlan?.tasks.some(m=>m.taskId===taskId&&m.review))return
 const key=identity(team,service,taskId),reservation=service.budgetSnapshot().reviewReservations?.find(r=>r.key===key)
 if(!reservation)return
 if(reservation.phase!=='held')throw new Error('批准方案审阅预留尚未核验或已结束')
 return{key,stage:'review'}
}
/** Caller has just reverified external inputs and every completed predecessor output. */
export function resumeApprovedReviewReservations(team:团队,service:OrchestrationService):void{
 for(const task of reviewTasks(team)){if(!task||task.status!=='pending')continue;const key=identity(team,service,task.id),hold=service.budgetSnapshot().reviewReservations?.find(r=>r.key===key);if(hold?.phase==='recovery-check')service.resumeReviewReservation(key)}
}
export function releaseApprovedReviewReservations(team:团队,service:OrchestrationService):void{
 if(!team.approvedPlan||service.hasTaskWork(team.id,team.tasks.map(t=>t.id)))return
 for(const task of reviewTasks(team)){
  if(!task||!team.finishedAt&&!['completed','failed','cancelled'].includes(task.status))continue
  const key=identity(team,service,task.id),hold=service.budgetSnapshot().reviewReservations?.find(r=>r.key===key)
  if(hold?.remainingRuns===1&&!service.hasReviewWork(key))service.releaseReviewReservation(key)
 }
}
