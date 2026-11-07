/** Pure reading projection. No parent context requests, transcript scans or billing inference. */
import type {RunOverview} from '../protocol/run-overview.js'
import type {TaskAttemptBinding} from '../protocol/run-explanation.js'
import {t,tf} from './i18n/index.js'
type Run=RunOverview['runs'][number]
const number=(n:number)=>n.toLocaleString()
const safe=(n:number|undefined):n is number=>n!==undefined&&Number.isSafeInteger(n)&&n>=0
const count=(n:number|undefined):n is number=>n!==undefined&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER
export function settledUsage(run:Run){
 const u=run.usageTotals
 let value=t("未记录")
 if(u?.source==='host-epoch-deltas'){
  if(!u.settledEpochs)value=u.legacyHistory?t("历史未覆盖"):t("尚未结算")
  else if(!safe(u.input)||!safe(u.output))value=t("输入或输出未记录")
  else if(!Number.isSafeInteger(u.input+u.output))value=t("合计超出安全范围")
  else value=u.partial.includes('input')||u.partial.includes('output')?tf("至少 {0} tokens",number(u.input+u.output)):tf("{0} tokens",number(u.input+u.output))
 }
 const field=(key:'input'|'output'|'cacheRead')=>u?.source==='host-epoch-deltas'&&safe(u[key])?(u.partial.includes(key)?tf("至少 {0} tokens",number(u[key])):tf("{0} tokens",number(u[key]))):t("未记录")
 return {recorded:u?.source==='host-epoch-deltas',value,input:field('input'),output:field('output'),cacheRead:field('cacheRead'),coverage:u?tf("{0} 轮已结算 · {1} 轮不完整",u.settledEpochs,u.unknownEpochs):t("用量未记录"),legacy:!!u?.legacyHistory}
}
export function usageLabel(run:Run){return tf("已结算累计 · {0}",settledUsage(run).value)}
export function projectAgentObservation(snapshot:RunOverview,run:Run,owner=snapshot.ownerSessionId){
 const o=run.contextObservation,b=o?.sample,s=b?.sample
 const bound=!!b&&b.ownerSessionId===owner&&snapshot.ownerSessionId===owner&&b.childId===run.id&&b.epoch===run.epoch
 const current=!!(bound&&snapshot.runs.some(member=>member.id===run.id&&member.epoch===run.epoch)&&snapshot.source==='live'&&run.phase==='running'&&run.state==='running'&&o?.current&&o.reason==='current'&&s?.availability==='available'&&s.source==='sdk-estimate'&&count(s.usedTokens))
 const used=current&&s?.availability==='available'?s.usedTokens:undefined
 const capacity=current&&count(s?.contextWindow)&&s.contextWindow>0&&s.contextWindowSource==='model-config'?s.contextWindow:undefined
 const value=used===undefined?t("未知"):capacity===undefined?tf("{0} tokens",number(used)):tf("{0} / {1} tokens",number(used),number(capacity))
 // A sample from a foreign owner/child is not even this member's historical value.
 const retained=b?.ownerSessionId===owner&&snapshot.ownerSessionId===owner&&b.childId===run.id&&b.epoch<=run.epoch?s:undefined
 const reason=snapshot.source!=='live'?t("磁盘历史快照"):!bound?t("样本身份或执行代次已失效"):run.phase!=='running'||run.state!=='running'?t("当前执行已停止或不活跃"):o?.reason==='route-changed'?t("模型路线已变更"):o?.reason==='awaiting-sample'?t("等待当前轮次新样本"):o?.reason==='historical'?t("历史样本，非当前上下文"):s?.availability==='unknown'?contextUnknownReason(s.reason):!current?t("当前上下文未知"):t("当前有效样本")
 const historical=!current&&retained?.availability==='available'&&retained.source==='sdk-estimate'&&count(retained.usedTokens)
 const label=current?t("当前上下文 · SDK估算"):historical?t("上次上下文 · 历史（估算）"):t("当前上下文")
 const displayValue=historical&&retained?.availability==='available'?tf("{0} tokens",number(retained.usedTokens)):value
 return {context:{current,historical,label,value:displayValue,used,capacity,percent:used!==undefined&&capacity!==undefined?Math.min(100,used/capacity*100):undefined,sample:retained,reason},usage:settledUsage(run)}
}
export function contextUnknownReason(reason:string){
 switch(reason){case 'unsupported':return t("当前运行时不支持采样");case 'no-current-route-anchor':return t("没有当前模型路线锚点");case 'after-compaction':return t("压缩后等待新样本");case 'sdk-unavailable':return t("SDK 上下文读数不可用");case 'sample-failed':return t("上下文采样失败");default:return t("当前上下文未知")}
}
/** Timeline association AND the member's current assignment must agree exactly. */
export function exactTaskObservationRun(snapshot:RunOverview,owner:string,query:Omit<TaskAttemptBinding,'attemptId'>&{attemptId?:string|undefined},current?:Run){
 if(snapshot.ownerSessionId!==owner||!query.attemptId||!current)return undefined
 const member=snapshot.runs.find(r=>r.id===current.id&&r.epoch===current.epoch),b=member?.taskAttempt
 const exact=(binding:Run['taskAttempt'])=>binding?.teamId===query.teamId&&binding.taskId===query.taskId&&binding.attemptId===query.attemptId&&binding.attempt===query.attempt
 return member&&(member.kind==='team'||member.kind==='bot')&&member.address[0]===query.teamId&&exact(b)&&exact(current.taskAttempt)?member:undefined
}
