/** Independent ground truth and pair comparability for the local software-path baseline. */
import type {TaskObservation} from '../protocol/task-observation.js'
import {createHash} from 'node:crypto'
export const SCIENCE_BASELINE_CASES=['normal','missing-units','reviewer-repair','changed-input','stop-resume'] as const
export type ScienceBaselineCase=typeof SCIENCE_BASELINE_CASES[number]
export function baselineFingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function verifyMeanFixture(value:unknown):boolean {
 if(!value||typeof value!=='object')return false
 const v=value as Record<string,unknown>;return v.n===5&&v.mean===3&&v.unit==='m'
}
export function judgeScienceBaseline(scenario:ScienceBaselineCase,accepted:boolean,actual:unknown,inputPreserved:boolean){
 const shouldDeliver=!['missing-units','changed-input'].includes(scenario),correct=verifyMeanFixture(actual)
 return{shouldDeliver,groundTruthPassed:correct,inputPreserved,success:inputPreserved&&(shouldDeliver?accepted&&correct:!accepted),falseAcceptance:accepted&&(!shouldDeliver||!correct)}
}
export function baselineUsage(observations:readonly (TaskObservation|undefined)[]){
 const unknown=(o:TaskObservation|undefined)=>!o?.usage||o.usage.input===undefined||o.usage.output===undefined||!!o.usage.partial?.some(k=>k==='input'||k==='output')
 return{visibleTokens:observations.reduce((n,o)=>n+(o?.usage?.input??0)+(o?.usage?.output??0),0),unknownUsageTasks:observations.filter(unknown).length,partialUsage:observations.some(unknown)}
}
export interface ScienceBaselineRow {scenario:ScienceBaselineCase;mode:'single'|'multi';comparisonFingerprint:string;accepted:boolean;success:boolean;falseAcceptance:boolean;inputPreserved:boolean;groundTruthPassed:boolean;elapsedMs:number;modelRequests:number;stages:number;rework:number;interventions:number;visibleTokens:number;unknownUsageTasks:number;partialUsage:boolean}
export function summarizeScienceBaseline(rows:ScienceBaselineRow[]){
 for(const scenario of SCIENCE_BASELINE_CASES){const pair=rows.filter(r=>r.scenario===scenario);if(pair.length!==2||new Set(pair.map(p=>p.mode)).size!==2||pair[0]!.comparisonFingerprint!==pair[1]!.comparisonFingerprint)throw new Error('不可比较或缺失配对基线：'+scenario)}
 return{kind:'deterministic-local-software-path' as const,limitations:['确定性 localhost 响应，仅证明软件执行与验收路径；不支持真实模型质量、速度或费用收益结论。','时长受本机与取消故障注入影响；用量只计可见字段，未知不按零成本解释。'],rows,byMode:(['single','multi'] as const).map(mode=>{const data=rows.filter(r=>r.mode===mode);return{mode,cases:data.length,successes:data.filter(r=>r.success).length,falseAcceptances:data.filter(r=>r.falseAcceptance).length,inputPreserved:data.filter(r=>r.inputPreserved).length,modelRequests:data.reduce((n,r)=>n+r.modelRequests,0),visibleTokens:data.reduce((n,r)=>n+r.visibleTokens,0),partialUsage:data.some(r=>r.partialUsage),unknownUsageTasks:data.reduce((n,r)=>n+r.unknownUsageTasks,0)}})}
}
