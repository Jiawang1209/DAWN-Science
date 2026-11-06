/** Accounting within the existing atomic orchestration state, not a scheduler. */
import {z} from 'zod'
import {RunBudgetLimitsSchema,type RunBudget,type RunBudgetLimits} from '../protocol/run-budget.js'
import type {TaskObservation} from '../protocol/task-observation.js'
import {UserFacingError} from '../errors.js'
const natural=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const BudgetRecordSchema=z.object({revision:natural,limits:RunBudgetLimitsSchema,consumedRuns:natural,legacyRuns:natural,knownTokens:natural,unknownRuns:natural,startedAt:z.number().finite().optional(),active:z.array(z.object({childId:z.string(),epoch:z.number().int().positive()}).strict())}).strict()
export type BudgetRecord=z.infer<typeof BudgetRecordSchema>
export function initialBudget(children:readonly {epoch:number;result?:unknown}[]):BudgetRecord{
 // Pre-orchestration transcripts may carry a completed result with epoch zero.
 // That proves at least one turn, never zero-cost work; its full history is unknown.
 const legacyRuns=children.reduce((n,child)=>n+Math.max(child.epoch,child.result?1:0),0)
 return{revision:0,limits:{},consumedRuns:legacyRuns,legacyRuns,knownTokens:0,unknownRuns:legacyRuns,active:[]}
}
export function budgetBlock(record:BudgetRecord,now=Date.now(),admission=true):RunBudget['blocked']{
 const{limits}=record
 if(limits.maxElapsedMs!==undefined&&record.startedAt!==undefined&&now-record.startedAt>=limits.maxElapsedMs)return{code:'elapsed',message:'委派预算总历时已到；新任务未启动'}
 if(limits.maxTokens!==undefined){
  if(record.knownTokens>=limits.maxTokens)return{code:'tokens',message:'委派预算已达到可核验 token 限额；在途请求可能仍有额外消耗'}
  if(record.unknownRuns>0)return{code:'unknown-usage',message:'委派预算存在未知用量，无法按 token 限额继续；请核对记录或显式调整限制'}
 }
 if(admission&&limits.maxRuns!==undefined&&record.consumedRuns>=limits.maxRuns)return{code:'runs',message:'委派预算执行轮次已用完；已有合法轮次继续，新轮次未启动'}
}
export function budgetView(record:BudgetRecord,now=Date.now()):RunBudget{
 const{revision,limits,consumedRuns,legacyRuns,knownTokens,unknownRuns,startedAt}=record
 return{revision,limits:structuredClone(limits),consumedRuns,legacyRuns,knownTokens,unknownRuns,inFlight:record.active.length,...(startedAt!==undefined?{startedAt}:{}),elapsedMs:startedAt===undefined?0:Math.max(0,now-startedAt),...(budgetBlock(record,now)?{blocked:budgetBlock(record,now)}:{})}
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
 record.limits=RunBudgetLimitsSchema.parse(limits);record.revision++
}
