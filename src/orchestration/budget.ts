/** Accounting within the existing atomic orchestration state, not a scheduler. */
import {z} from 'zod'
import {RunBudgetLimitsSchema,ReviewRunReservationSchema,ReviewReservationKeySchema,ReviewReservationIdentitySchema,type RunBudget,type RunBudgetLimits} from '../protocol/run-budget.js'
import type {TaskObservation} from '../protocol/task-observation.js'
import {UserFacingError} from '../errors.js'
import {TaskAttemptBindingSchema} from '../protocol/run-explanation.js'
const natural=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const ReviewRunAdmissionSchema=z.object({key:ReviewReservationKeySchema,stage:z.enum(['check','analyze','review'])}).strict()
export type ReviewRunAdmission=z.infer<typeof ReviewRunAdmissionSchema>
const ReviewRunBindingSchema=z.object({childId:z.string(),taskAttempt:TaskAttemptBindingSchema,admission:ReviewRunAdmissionSchema,admittedEpoch:z.number().int().positive().optional()}).strict()
export const BudgetRecordSchema=z.object({revision:natural,limits:RunBudgetLimitsSchema,consumedRuns:natural,legacyRuns:natural,knownTokens:natural,unknownRuns:natural,startedAt:z.number().finite().optional(),reviewReservations:z.array(ReviewRunReservationSchema).optional(),reviewBindings:z.array(ReviewRunBindingSchema).optional(),active:z.array(z.object({childId:z.string(),epoch:z.number().int().positive(),reviewAdmission:ReviewRunAdmissionSchema.optional()}).strict())}).strict()
export type BudgetRecord=z.infer<typeof BudgetRecordSchema>
export function reviewReservationKey(ownerSessionId:string,pipelineId:string,revisionCycle:number):string{
 return JSON.stringify(ReviewReservationIdentitySchema.parse([ownerSessionId,pipelineId,revisionCycle]))
}
export function heldReviewRuns(record:BudgetRecord):number{return(record.reviewReservations??[]).reduce((sum,reservation)=>sum+reservation.remainingRuns,0)}
export function initialBudget(children:readonly {epoch:number;result?:unknown}[]):BudgetRecord{
 // Pre-orchestration transcripts may carry a completed result with epoch zero.
 // That proves at least one turn, never zero-cost work; its full history is unknown.
 const legacyRuns=children.reduce((n,child)=>n+Math.max(child.epoch,child.result?1:0),0)
 return{revision:0,limits:{},consumedRuns:legacyRuns,legacyRuns,knownTokens:0,unknownRuns:legacyRuns,active:[]}
}
export function budgetBlock(record:BudgetRecord,now=Date.now(),admission=true,reviewAdmission?:ReviewRunAdmission):RunBudget['blocked']{
 const{limits}=record
 if(limits.maxElapsedMs!==undefined&&record.startedAt!==undefined&&now-record.startedAt>=limits.maxElapsedMs)return{code:'elapsed',message:'委派预算总历时已到；新任务未启动'}
 if(limits.maxTokens!==undefined){
  if(record.knownTokens>=limits.maxTokens)return{code:'tokens',message:'委派预算已达到可核验 token 限额；在途请求可能仍有额外消耗'}
  if(record.unknownRuns>0)return{code:'unknown-usage',message:'委派预算存在未知用量，无法按 token 限额继续；请核对记录或显式调整限制'}
 }
 if(admission){
  if(limits.maxRuns!==undefined&&record.consumedRuns>=limits.maxRuns)return{code:'runs',message:'委派预算执行轮次已用完；已有合法轮次继续，新轮次未启动'}
  if(reviewAdmission){
   const own=record.reviewReservations?.find(reservation=>reservation.key===reviewAdmission.key)
   if(own?.phase==='recovery-check')return{code:'runs',message:'审阅预留处于恢复待核对状态；核验后才能继续'}
   if(!own||own.phase!=='held'||own.remainingRuns!==1)return{code:'runs',message:'本流程周期没有可用的审阅预留；新轮次未启动'}
   if(reviewAdmission.stage==='review'){
    if(record.active.some(active=>active.reviewAdmission?.key===reviewAdmission.key))return{code:'runs',message:'本流程周期的前序执行仍未排空；独立审阅未启动'}
    return
   }
  }
  if(limits.maxRuns!==undefined&&record.consumedRuns+heldReviewRuns(record)>=limits.maxRuns)return{code:'runs',message:'剩余执行轮次已为独立审阅预留；普通阶段未启动'}
 }
}
export function budgetView(record:BudgetRecord,now=Date.now()):RunBudget{
 const{revision,limits,consumedRuns,legacyRuns,knownTokens,unknownRuns,startedAt}=record
 const reservations=record.reviewReservations??[],showReservations=limits.reserveReviewRuns||record.reviewReservations!==undefined
 return{revision,limits:structuredClone(limits),consumedRuns,legacyRuns,knownTokens,unknownRuns,inFlight:record.active.length,...(startedAt!==undefined?{startedAt}:{}),elapsedMs:startedAt===undefined?0:Math.max(0,now-startedAt),...(budgetBlock(record,now)?{blocked:budgetBlock(record,now)}:{}),...(showReservations?{reviewReservations:structuredClone(reservations),reviewReservedRuns:heldReviewRuns(record),reviewRecoveryRuns:reservations.filter(reservation=>reservation.phase==='recovery-check').length,...(limits.maxRuns!==undefined?{ordinaryRemainingRuns:Math.max(0,limits.maxRuns-consumedRuns-heldReviewRuns(record))}:{})}:{})}
}
export function chargeObservation(record:BudgetRecord,observation?:TaskObservation):void{
 const usage=observation?.usage,fields=['input','output','cacheRead'] as const
 let unknown=!usage
 for(const field of fields){
  const value=usage?.[field]
  if(value===undefined||!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(record.knownTokens+value)){unknown=true;continue}
  record.knownTokens+=value
  if(usage?.partial?.includes(field))unknown=true
 }
 if(unknown)record.unknownRuns++
 record.revision++
}
export function setBudgetLimits(record:BudgetRecord,limits:RunBudgetLimits,expectedRevision:number):void{
 if(record.revision!==expectedRevision)throw new UserFacingError('预算版本已变化 (revision conflict)，请刷新后重试')
 const parsed=RunBudgetLimitsSchema.parse(limits)
 if(heldReviewRuns(record)>0&&parsed.maxRuns===undefined)throw new UserFacingError('仍有审阅预留，不能移除 maxRuns；请先排空并终止相应流程')
 record.limits=parsed;record.revision++
}
